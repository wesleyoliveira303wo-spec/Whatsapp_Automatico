// Baileys 7.x é ESM puro (ver guia de migração). Nossa API é CommonJS, então
// NÃO importamos valores estaticamente (um `require` de um pacote ESM-only
// quebraria em runtime). Só `import type` (apagado na compilação, não vira
// `require`) para os TIPOS; os VALORES (`makeWASocket`, `DisconnectReason`,
// `fetchLatestBaileysVersion`, `jidNormalizedUser`) entram por `await import()`
// dinâmico dentro de `connect()`, guardado em `this.baileys` para os handlers
// síncronos usarem depois (connect() sempre roda antes de qualquer evento).
import type { AnyMessageContent, ConnectionState, WASocket } from '@whiskeysockets/baileys';

/** Módulo Baileys carregado dinamicamente (ESM) — o tipo é inferido do próprio pacote. */
type BaileysModule = typeof import('@whiskeysockets/baileys');
// `import type` — apagado em tempo de compilação, sem `require()` em
// runtime. `Boom` só é usado como anotação de tipo abaixo (cast), nunca
// instanciado; isso evita uma dependência de runtime desnecessária em
// `@hapi/boom` só para um cast de tipo.
import type { Boom } from '@hapi/boom';

import { Logger } from '../../../../../shared/domain/Logger';
import { CredentialsStore } from '../../../../../shared/security/domain/CredentialsStore';
import { Cipher } from '../../../../../shared/security/domain/Cipher';
import { WhatsAppSession } from '../../../domain/entities/WhatsAppSession';
import { WhatsAppDisconnectReason } from '../../../domain/entities/WhatsAppDisconnectReason';
import {
  WhatsAppProvider,
  ProfilePictureLookup,
} from '../../../domain/providers/WhatsAppProvider';
import {
  WhatsAppProviderEvent,
  WhatsAppMessageContentTypeEvent,
  WhatsAppMediaReferenceEvent,
} from '../../../domain/providers/WhatsAppProviderEvent';
import { ReconnectionPolicy } from '../../../domain/providers/ReconnectionPolicy';
import { WhatsAppQRCodeNotAvailableError } from '../../../domain/errors/WhatsAppQRCodeNotAvailableError';
import { WhatsAppNotConnectedError } from '../../../domain/errors/WhatsAppNotConnectedError';
import { buildWhatsAppCredentialsNamespace } from '../../../domain/credentialsNamespace';
import { useCredentialsStoreAuthState } from './BaileysCredentialsAdapter';

/**
 * Shape mínimo consumido de um evento `messages.upsert` do Baileys —
 * definido localmente (não importado de `@whiskeysockets/baileys`) porque só
 * um subconjunto pequeno e estável da mensagem real é necessário aqui.
 * Campos opcionais tipados como `| null` (não só `| undefined`) porque é
 * exatamente assim que o pacote real (`WAMessageKey`/`proto.IMessage`,
 * `@whiskeysockets/baileys@6.7.9`) os declara — verificado com `tsc` real
 * contra o pacote instalado (Milestone 3, Bloco 1), diferente do restante
 * desta classe (`ConnectionState`/`WASocket`, ver NOTA DE VERIFICAÇÃO
 * abaixo), cuja verificação contra o pacote real ainda está pendente.
 */
/**
 * Shape mínimo de UM tipo de mídia dentro de `message.message.*Message` —
 * `imageMessage`/`audioMessage`/`videoMessage`/`documentMessage`/
 * `stickerMessage` do Baileys compartilham este subconjunto de campos
 * (`mimetype`/`url`/`mediaKey`, todos strings base64/URL no shape público do
 * protocolo — verificado contra a documentação pública do Baileys, mesma
 * ressalva de verificação já registrada na NOTA acima desta classe).
 * `caption` só existe em `imageMessage`/`videoMessage`/`documentMessage` (o
 * WhatsApp não permite legenda em áudio/figurinha) — opcional aqui para os 5.
 * `fileName` só existe em `documentMessage`.
 */
interface BaileysMediaMessage {
  mimetype?: string | null;
  url?: string | null;
  /**
   * O Baileys real entrega `mediaKey` como `Uint8Array` (bytes crus do
   * Signal), nunca como `string` — `extractMediaContent` converte para
   * base64 antes de cifrar (`Cipher.encrypt` espera `string`). Aceita
   * `string` também só para simplificar fixtures de teste.
   */
  mediaKey?: Uint8Array | string | null;
  caption?: string | null;
  fileName?: string | null;
  /** Ver docstring de `BaileysContextInfo` — resposta/reação a Status. */
  contextInfo?: BaileysContextInfo | null;
}

/**
 * Shape mínimo de `ContextInfo` (proto do Baileys) — Fase 1, 2026-07-31.
 * Reaproveitado pelo próprio protocolo do WhatsApp para marcar "esta
 * mensagem é uma resposta/reação a OUTRA mensagem": quando a mensagem
 * citada mora num chat DIFERENTE do chat onde a resposta chegou,
 * `remoteJid` vem preenchido com o chat de origem (ver `lib/Utils/messages.
 * js` do pacote real: `if (jid !== quoted.key.remoteJid) contextInfo.
 * remoteJid = quoted.key.remoteJid`). Quando alguém reage/responde a um
 * Status (Stories), a mensagem original mora em `status@broadcast` — esse é
 * o sinal usado para filtrar essas mensagens (ver `isStatusReply` abaixo).
 * Verificado contra `WAProto/WAProto.proto` do pacote real instalado.
 */
interface BaileysContextInfo {
  remoteJid?: string | null;
}

/** Endereço fixo do WhatsApp para Status/Stories — mesma constante que o Baileys expõe como `STORIES_JID`. */
const STATUS_BROADCAST_JID = 'status@broadcast';

interface BaileysInboundMessage {
  key: {
    /**
     * ID único da mensagem atribuído pelo WhatsApp (ADR #97: usado para
     * deduplicar ecos de envios próprios em `handleMessagesUpsert`).
     */
    id?: string | null;
    remoteJid?: string | null;
    fromMe?: boolean | null;
    /**
     * Número real (`@s.whatsapp.net`) do remetente quando a mensagem chega de
     * um LID (`@lid`, formato de privacidade novo do WhatsApp). Presente em
     * `WAMessageKey` do Baileys 6.7.23. Responder ao `@lid` é ACEITO pelo
     * Baileys mas NÃO entrega — por isso, quando presente, este é o endereço
     * correto para responder/registrar a conversa.
     */
    senderPn?: string | null;
    /**
     * Baileys v7: substitui (ou complementa) `senderPn` — JID alternativo da
     * outra ponta da conversa quando o JID primário é um LID. Em mensagens
     * `fromMe` (operador enviou de outro dispositivo), `remoteJid` é o LID do
     * destinatário e `remoteJidAlt` traz o número real (`@s.whatsapp.net`).
     */
    remoteJidAlt?: string | null;
  };
  /**
   * HOTFIX 2026-08-25 — segundos desde epoch (protobuf pode entregar como
   * `number` OU como `Long`, dependendo de como o evento foi serializado;
   * nunca suposto, ver `resolveMessageTimestampMs`). Usado só para decidir
   * se uma mensagem `type: 'append'` é recente o bastante para ser tratada
   * como mensagem nova (ver `handleMessagesUpsert`) — nunca para lógica de
   * negócio (a `Message.occurredAt` continua vindo de `new Date()` no
   * momento do recebimento, como sempre foi).
   */
  messageTimestamp?: number | { toNumber(): number } | null;
  message?: {
    conversation?: string | null;
    extendedTextMessage?: { text?: string | null; contextInfo?: BaileysContextInfo | null } | null;
    /** Fase 1, Bloco F1.1 (ADR #90) — reconhecimento de mensagens de mídia. */
    imageMessage?: BaileysMediaMessage | null;
    audioMessage?: BaileysMediaMessage | null;
    videoMessage?: BaileysMediaMessage | null;
    documentMessage?: BaileysMediaMessage | null;
    stickerMessage?: BaileysMediaMessage | null;
  } | null;
  /**
   * Nome de exibição do remetente no WhatsApp (Milestone 6, Bloco M6H-2b) —
   * campo real do evento `messages.upsert` do Baileys, não presente em toda
   * mensagem (ex.: sincronização de histórico). Usado só para identificação
   * na Dashboard (`WhatsAppConversation.contactName`) — nunca para lógica de
   * roteamento/entrega, que continua inteiramente baseada em JID.
   */
  pushName?: string | null;
  /**
   * HOTFIX 2026-07-31 — campo de nível de mensagem do próprio Baileys
   * (`lib/Types/Message.d.ts`: `broadcast?: boolean`, "if it is broadcast"),
   * preenchido em `decode-wa-message.js` como `isJidBroadcast(from)`. Usado
   * como DEFESA EM PROFUNDIDADE junto de `isIgnoredChatJid`: se um endereço
   * de broadcast futuro não casar com o sufixo `@broadcast`, este booleano
   * ainda barra o evento.
   */
  broadcast?: boolean | null;
}

/**
 * Um dos 5 tipos de mídia reconhecidos (Fase 1, Bloco F1.1) — par
 * (tipo de conteúdo, chave do campo dentro de `message.message`). Usado por
 * `extractMediaContent` para percorrer os 5 campos possíveis sem repetir a
 * mesma lógica de extração 5 vezes.
 */
const MEDIA_MESSAGE_FIELDS: ReadonlyArray<{
  contentType: Exclude<WhatsAppMessageContentTypeEvent, 'text'>;
  field: 'imageMessage' | 'audioMessage' | 'videoMessage' | 'documentMessage' | 'stickerMessage';
}> = [
  { contentType: 'image', field: 'imageMessage' },
  { contentType: 'audio', field: 'audioMessage' },
  { contentType: 'video', field: 'videoMessage' },
  { contentType: 'document', field: 'documentMessage' },
  { contentType: 'sticker', field: 'stickerMessage' },
];

interface BaileysMessagesUpsertEvent {
  type: string;
  messages: BaileysInboundMessage[];
}

/**
 * HOTFIX 2026-07-31 — tipos de chat em que o Francis NUNCA atua: a
 * ferramenta é um atendente de conversas PRIVADAS 1:1, e nada além disso
 * deve gerar `Conversation`/`Message`/IA/Pipeline/Analytics/notificação.
 *
 * CAUSA RAIZ do bug de Status, verificada no FONTE do pacote real
 * (`node_modules/@whiskeysockets/baileys@7.0.0-rc13`), não suposta:
 * `lib/Utils/decode-wa-message.js` (~linha 150) monta a `key` de uma
 * mensagem recebida assim — para `isJidBroadcast(from)` (que inclui
 * `status@broadcast`), faz `chatId = from` e `author = participant`, e
 * `key.remoteJid = chatId`. Logo, **um Status publicado por um contato
 * chega com `key.remoteJid === 'status@broadcast'`** (o autor real fica em
 * `key.participant`), e o mesmo evento também traz `broadcast: true` no
 * nível da mensagem (`lib/Types/Message.d.ts`: "if it is broadcast").
 *
 * Isso explica exatamente o sintoma relatado ("os Status de várias pessoas
 * aparecendo como UMA conversa só, cujo nome muda"): como a conversa é
 * chaveada por `contactJid` e todo Status compartilha o MESMO
 * `status@broadcast`, todos colapsavam numa única `WhatsAppConversation`,
 * cujo `contactName` era sobrescrito pelo `pushName` do autor do último
 * Status recebido.
 *
 * Sufixos cobertos (comparação por sufixo, mesma semântica das funções que
 * o próprio Baileys expõe em `lib/WABinary/jid-utils.js`):
 * - `@g.us` → grupos (`isJidGroup`), fora de escopo desde a Milestone 3;
 * - `@newsletter` → canais (`isJidNewsletter`), transmissão de mão única;
 * - `@broadcast` → `isJidBroadcast`, que cobre `status@broadcast`
 *   (`isJidStatusBroadcast`/`STORIES_JID`) e listas de transmissão. Usado o
 *   sufixo (não a igualdade com `status@broadcast`) de propósito: pega
 *   qualquer endereço de broadcast, presente ou futuro, com o mesmo
 *   racional — nenhum deles é uma conversa de atendimento.
 */
function isIgnoredChatJid(remoteJid: string): boolean {
  return (
    remoteJid.endsWith('@g.us') ||
    remoteJid.endsWith('@newsletter') ||
    remoteJid.endsWith('@broadcast')
  );
}

/**
 * Detecta se uma mensagem é uma resposta/reação a um STATUS (Stories) —
 * Fase 1, 2026-07-31 (ver docstring de `BaileysContextInfo`). Checa
 * `contextInfo.remoteJid` em CADA campo de mensagem possível (texto ou
 * qualquer um dos 5 tipos de mídia) — função pura, sem I/O, testável
 * isoladamente.
 *
 * Complementar (não redundante) a `isIgnoredChatJid`: aqui a mensagem chega
 * no chat 1:1 NORMAL do contato (`@s.whatsapp.net`/`@lid`), só carregando um
 * `contextInfo` que aponta para o Status citado — o `remoteJid` da `key` não
 * tem nada de especial, então o filtro de sufixo não a alcança.
 */
function isStatusReply(message: BaileysInboundMessage): boolean {
  const contexts: Array<BaileysContextInfo | null | undefined> = [
    message.message?.extendedTextMessage?.contextInfo,
    message.message?.imageMessage?.contextInfo,
    message.message?.audioMessage?.contextInfo,
    message.message?.videoMessage?.contextInfo,
    message.message?.documentMessage?.contextInfo,
    message.message?.stickerMessage?.contextInfo,
  ];
  return contexts.some((context) => context?.remoteJid === STATUS_BROADCAST_JID);
}

/**
 * HOTFIX 2026-08-25 — achado real (episódio 1, sessão "Whatsapp Sites"): uma
 * mensagem de campanha foi enviada a um número novo, o cliente respondeu, e
 * a resposta NUNCA chegou (sem log, sem erro, sem linha no banco — silêncio
 * total). Medido no log real: a conexão caiu (`statusCode 428`) ~40s depois
 * do envio e reconectou ~32s depois — exatamente a janela em que, pelo
 * protocolo do WhatsApp, uma mensagem recebida enquanto reconectávamos
 * costuma ser entregue como `messages.upsert { type: 'append' }` (mensagem
 * "recuperada" na resincronização), não como `{ type: 'notify' }`.
 * `handleMessagesUpsert` descartava TODO evento `!== 'notify'` sem log
 * nenhum. Corrigido para também aceitar `'append'`.
 *
 * HOTFIX 2026-08-25 (episódio 2, sessão "Lest Conceito", MESMO DIA) —
 * achado real que REFUTA a suposição original de que só `'append'`
 * carregava risco de histórico velho: duas mensagens de contatos reais, de
 * **6 dias atrás** (quarta-feira, 11h37 e 20h43), foram entregues como
 * `type: 'notify'` — não `'append'` — na reconexão desta sessão (que ficou
 * muito tempo sem conectar), e a IA respondeu as duas na hora como se
 * fossem mensagens novas, porque `'notify'` sempre foi aceito
 * incondicionalmente, sem NENHUMA checagem de idade. `'notify'` não é
 * garantia de "mensagem em tempo real" — é só a categoria que o WhatsApp
 * usa pra dizer "isso merece notificação", o que inclui reentrega de
 * mensagens não lidas de dias atrás numa sessão que ficou muito tempo
 * offline.
 *
 * Por isso a checagem de frescor deixou de ser exclusiva de `'append'` e
 * passa a valer para QUALQUER mensagem aceita, seja `'notify'` ou
 * `'append'` — usando o `messageTimestamp` real da mensagem (não o tipo do
 * evento) como sinal. Critério assimétrico deliberado: só REJEITA quando
 * há EVIDÊNCIA POSITIVA de que a mensagem é velha (timestamp presente e
 * fora da janela); sem `messageTimestamp` (nunca deveria faltar, mas o
 * campo é opcional no protobuf), aceita — não há evidência de problema, e
 * negar por padrão arriscaria descartar mensagem legítima sem prova
 * nenhuma. Isso também simplificou o código: não há mais divergência de
 * comportamento entre `'notify'` e `'append'` além do próprio filtro de
 * tipo no topo de `handleMessagesUpsert`.
 *
 * Janela aumentada de 5 para 30 minutos (pedido do fundador, mesmo
 * episódio 2): 5 min era curto demais para cobrir o tempo real entre uma
 * sessão cair e alguém notar/reconectar pela Dashboard — mas ainda ordens
 * de magnitude menor que "dias", suficiente para não deixar passar
 * histórico de verdade (ver o achado do episódio 2: um histórico real de
 * milhares de mensagens `'append'` velhas continua sendo corretamente
 * rejeitado, porque elas carregam `messageTimestamp` genuinamente antigo).
 */
const MESSAGE_FRESHNESS_WINDOW_MS = 30 * 60 * 1000;

/**
 * Normaliza `messageTimestamp` (segundos desde epoch) para milissegundos —
 * o protobuf do WhatsApp entrega como `number` OU como `Long` (objeto com
 * `.toNumber()`) dependendo de como o evento foi serializado; nunca supõe
 * um dos dois formatos.
 */
function resolveMessageTimestampMs(
  messageTimestamp: BaileysInboundMessage['messageTimestamp'],
): number | undefined {
  if (messageTimestamp == null) {
    return undefined;
  }
  const seconds =
    typeof messageTimestamp === 'number' ? messageTimestamp : messageTimestamp.toNumber();
  if (!Number.isFinite(seconds)) {
    return undefined;
  }
  return seconds * 1000;
}

/**
 * Ver docstring de `MESSAGE_FRESHNESS_WINDOW_MS` para o histórico completo
 * (dois episódios reais) por trás deste critério assimétrico: só rejeita
 * quando o `messageTimestamp` está PRESENTE e é mais velho que a janela —
 * sem timestamp, não há evidência de problema, então aceita. Vale para
 * QUALQUER mensagem aceita por `handleMessagesUpsert` (`'notify'` ou
 * `'append'`), não só para um dos dois tipos.
 */
function isStaleQueuedMessage(message: BaileysInboundMessage, now: () => Date): boolean {
  const timestampMs = resolveMessageTimestampMs(message.messageTimestamp);
  if (timestampMs === undefined) {
    return false;
  }
  return Math.abs(now().getTime() - timestampMs) > MESSAGE_FRESHNESS_WINDOW_MS;
}

/**
 * Teto de espera por `getProfilePictureUrl` (Milestone 6, Bloco M6H-2b,
 * achado do teste real de 2026-07-25) — bem mais curto que o timeout
 * interno do Baileys para essa mesma query, que pode chegar a dezenas de
 * segundos. Ver docstring de `getProfilePictureUrl` para o incidente que
 * motivou este valor: várias fotos pedidas ao mesmo tempo (lista de
 * conversas + cabeçalho) deixavam o socket com múltiplas esperas longas
 * simultâneas, e a sessão parecia travada (inclusive para mensagens reais).
 */
const PROFILE_PICTURE_TIMEOUT_MS = 6_000;

/**
 * Teto de espera por `downloadMedia` (Fase 1, Bloco F1.1, ADR #90) — mesmo
 * racional de `PROFILE_PICTURE_TIMEOUT_MS`: baixar um arquivo do CDN do
 * WhatsApp pode demorar (arquivo grande, CDN lento, URL prestes a expirar) e
 * não pode travar o restante da sessão. Mais generoso que o de foto de
 * perfil (mídia real costuma ser maior que uma foto de perfil).
 */
const MEDIA_DOWNLOAD_TIMEOUT_MS = 20_000;

/**
 * Implementação concreta de `WhatsAppProvider` usando Baileys (Milestone 1,
 * Item 3). Cada instância corresponde a exatamente um socket/uma sessão —
 * `tenantId`/`sessionName` são fixados na construção, não por chamada (ver
 * comentário em `WhatsAppProvider.onEvent`); quem cria múltiplas instâncias
 * para múltiplos tenants/sessões é responsabilidade de um futuro
 * Factory/Registry (achado F1, deliberadamente adiado — ADR #16), fora do
 * escopo deste item.
 *
 * Credenciais: delega inteiramente a `useCredentialsStoreAuthState`
 * (`BaileysCredentialsAdapter.ts`), que bridgeia o port genérico
 * `CredentialsStore` para o formato `AuthenticationState` do Baileys — este
 * arquivo nunca lida com serialização de chaves do Signal diretamente.
 *
 * Mapeamento de status (achado P4 do Architecture Review original, ver
 * PROJECT_STATUS.md — parcialmente resolvido na Production Hardening, Bloco
 * 8a): Baileys reporta motivos de desconexão bem mais ricos do que os 3
 * valores de `WhatsAppSession['status']` (`DisconnectReason.loggedOut`,
 * `connectionLost`, `restartRequired`, `timedOut`, etc.). `status` continua
 * colapsando tudo em `'disconnected'` (decisão deliberada, mantida — ver
 * `WhatsAppDisconnectReason` para a justificativa completa de por que o
 * motivo vive num campo SEPARADO, não como um valor a mais em `status`), mas
 * o motivo específico deixou de ser só logado: `mapDisconnectReason()`
 * traduz o `statusCode` do Baileys para um `WhatsAppDisconnectReason` de
 * Domain, guardado em `currentDisconnectReason` e incluído no evento
 * `status_changed` emitido — de onde `SessionManager` o persiste. O motivo é
 * limpo (`undefined`) ao entrar em `'connecting'`/`'connected'` (ver
 * `connect()` e `handleConnectionUpdate`).
 *
 * NOTA DE VERIFICAÇÃO: importa `makeWASocket`/`ConnectionState`/
 * `DisconnectReason`/`WASocket` de `@whiskeysockets/baileys` e `Boom` de
 * `@hapi/boom` — nenhum dos dois pôde ser instalado nem type-checado neste
 * sandbox (sem shell). A API usada aqui (`sock.ev.on('connection.update',
 * ...)`, `sock.ev.on('creds.update', ...)`, `update.qr`, `update.connection`,
 * `update.lastDisconnect.error` como `Boom`, `DisconnectReason.loggedOut`,
 * `sock.user.id` no formato `"<telefone>:<device>@s.whatsapp.net"`) segue a
 * API pública documentada do Baileys, mas precisa ser confirmada com
 * `npm install` + `tsc` reais no ambiente do usuário — incluindo o nome/
 * versão exata do pacote, já que este ecossistema tem histórico de forks e
 * renomeações.
 *
 * Ciclo de vida do socket (correção do BUG-04, auditoria de 2026-07-06, ver
 * DECISIONS.md ADR #23): a versão original assumia `connect()` sendo chamado
 * exatamente uma vez por instância. Na prática, `SessionManager` reutiliza a
 * MESMA instância entre múltiplos ciclos de `init()`/`disconnect()` — cada
 * chamada nova de `connect()` criava outro socket sem nunca encerrar o
 * anterior (vazamento de timers/handles internos do Baileys), e o socket
 * antigo podia disparar um evento tardio depois que um socket novo já
 * existia, sobrescrevendo `currentStatus`/emitindo eventos com informação do
 * socket ERRADO. Corrigido com (a) `teardownSocket()` antes de criar um novo
 * socket e no `disconnect()`; (b) um check de identidade dentro do handler
 * de `connection.update` (`this.socket !== socket`) que ignora eventos de um
 * socket que já foi substituído.
 *
 * Correções da auditoria de INTEGRAÇÃO de 2026-07-06 (ver DECISIONS.md ADR
 * #26), encontradas simulando o ciclo de vida completo (reconexão, logout):
 *
 * BUG-12 — o handler de `creds.update` NÃO tinha o mesmo check de
 * identidade do `connection.update`. Um `creds.update` tardio de um socket
 * já substituído/encerrado podia sobrescrever a chave `'creds'` no banco
 * com dados desatualizados, mesmo depois do socket novo já ter salvo algo
 * mais recente — risco real de corrupção/perda de credenciais numa
 * reconexão rápida. Corrigido com o mesmo padrão de check de identidade.
 *
 * BUG-13 — nenhuma limpeza de credenciais ao detectar
 * `DisconnectReason.loggedOut` (usuário desvinculou o dispositivo pelo
 * celular). As credenciais persistidas ficavam inválidas mas continuavam lá
 * — uma reconexão futura as carregaria e falharia de novo, em vez de gerar
 * um QR novo. Corrigido chamando `credentialsStore.clear()` quando
 * `loggedOut === true`.
 *
 * Reconexão automática com backoff + circuit breaker (Production
 * Hardening, Bloco 8b): antes deste bloco, só `restartRequired` (515)
 * reconectava automaticamente, de forma imediata e incondicional (BUG-14).
 * Este bloco generaliza isso para QUALQUER motivo recuperável (todos exceto
 * `'logged_out'` — ver `isDisconnectReasonRecoverable`), mas via
 * `ReconnectionPolicy` injetada (`WhatsAppReconnectionPolicy`, por padrão):
 * cada tentativa espera um delay exponencialmente crescente, e depois de um
 * número configurável de falhas consecutivas o circuito abre e a instância
 * para de tentar sozinha (só uma chamada explícita de `init()`/`connect()`,
 * ou uma conexão bem-sucedida, a tira desse estado). Nenhum timer/contador
 * vive nesta classe — só delega ao `reconnectionPolicy` recebido no
 * construtor (SRP: este arquivo continua falando apenas o protocolo
 * Baileys).
 *
 * Mensagem inbound/outbound (Milestone 3, Bloco 1): `connect()` passa a
 * assinar também `messages.upsert`, emitindo `message_received` (novo
 * membro de `WhatsAppProviderEvent`) para mensagens 1:1 reais — descarta
 * silenciosamente `fromMe` (eco do próprio número), mensagens de grupo
 * (`remoteJid` terminado em `@g.us`), mensagens de canal/newsletter
 * (`remoteJid` terminado em `@newsletter` — Fase 1, 2026-07-31: a
 * ferramenta atua só em conversas privadas), eventos que não são
 * `type === 'notify'` (sincronização de histórico, não mensagem nova) e
 * mensagens sem nenhum conteúdo reconhecido (mensagem de sistema, reação,
 * enquete — ver `extractMediaContent`). Desde a Fase 1, Bloco F1.1 (ADR #90), mensagens de
 * imagem/áudio/vídeo/documento/figurinha também são reconhecidas — antes
 * deste bloco eram descartadas em silêncio junto com os demais tipos sem
 * texto extraível; a `mediaKey` (bytes crus do Signal) é convertida para
 * base64 e cifrada via `Cipher` (opcional no construtor) antes de sair desta
 * classe, nunca em texto plano. `sendMessage()` é a contrapartida de saída: só envia com uma
 * conexão viva de verdade (socket presente E `currentStatus === 'connected'`
 * — ajuste de auditoria arquitetural do Claude Design), lançando
 * `WhatsAppNotConnectedError` caso contrário. O check de identidade de
 * socket (`this.socket !== socket`, usado por `creds.update` e
 * `connection.update` desde o BUG-04/BUG-12) passa a ser compartilhado pelos
 * três handlers via `isCurrentSocket()`, extraído nesta Milestone para
 * eliminar a duplicação que um terceiro handler (`messages.upsert`)
 * tornaria ainda mais evidente.
 */

/**
 * Monta o payload de conteúdo aceito por `sock.sendMessage()` do Baileys para
 * cada tipo de mídia — Fase 1, Bloco F1.3. Extraída como função pura/
 * exportada (em vez de inline dentro de `sendMediaMessage`) para ser testável
 * sem precisar montar um socket Baileys fake: cada branch só monta um objeto
 * literal, sem I/O algum.
 *
 * O Baileys usa uma CHAVE DIFERENTE por tipo de mídia (`image`/`audio`/
 * `video`/`document`), não um formato genérico `{ media: buffer, type }` —
 * por isso o `switch`, em vez de um único objeto com `[media.contentType]`
 * calculado dinamicamente (perderia a checagem exaustiva do TypeScript sobre
 * a união `contentType`).
 *
 * `audio` sempre envia `ptt: false` (mensagem de áudio comum, não "voice
 * note"/PTT) — o WhatsApp distingue os dois visualmente (PTT tem o ícone de
 * microfone com forma de onda, mensagem de áudio comum aparece como um
 * player de arquivo); replicar o comportamento de PTT exigiria detectar isso
 * na origem do upload, fora do escopo desta rodada (paridade básica).
 *
 * `document` é o único caso que usa `fileName` — o Baileys ignora esse campo
 * para os demais tipos (imagem/áudio/vídeo não têm "nome de arquivo" visível
 * na UI do WhatsApp).
 */
export function buildBaileysMediaContent(media: {
  contentType: 'image' | 'audio' | 'video' | 'document';
  buffer: Buffer;
  mimeType: string;
  caption?: string;
  fileName?: string;
}): AnyMessageContent {
  switch (media.contentType) {
    case 'image':
      return { image: media.buffer, mimetype: media.mimeType, caption: media.caption };
    case 'audio':
      return { audio: media.buffer, mimetype: media.mimeType, ptt: false };
    case 'video':
      return { video: media.buffer, mimetype: media.mimeType, caption: media.caption };
    case 'document':
      return {
        document: media.buffer,
        mimetype: media.mimeType,
        fileName: media.fileName ?? 'arquivo',
        caption: media.caption,
      };
    default: {
      // Checagem exaustiva: se um novo membro for adicionado à união de
      // `contentType` sem atualizar este switch, o `tsc` falha aqui.
      const exhaustiveCheck: never = media.contentType;
      throw new Error(`Tipo de mídia não suportado para envio: ${exhaustiveCheck}`);
    }
  }
}

export class BaileysProvider implements WhatsAppProvider {
  private socket: WASocket | undefined;

  /**
   * Módulo Baileys carregado por `await import()` no `connect()` (ESM). Os
   * handlers síncronos (`handleConnectionUpdate`, `handleMessagesUpsert`)
   * acessam `this.baileys.DisconnectReason`/`this.baileys.jidNormalizedUser`
   * por aqui — sempre definido no momento em que qualquer evento chega, porque
   * o import acontece ANTES de os listeners serem registrados em `connect()`.
   * `!` (definite assignment) porque o TS não enxerga essa ordem.
   */
  private baileys!: BaileysModule;
  private eventListener: ((event: WhatsAppProviderEvent) => void) | undefined;
  private currentStatus: WhatsAppSession['status'] = 'disconnected';

  /**
   * Cache de IDs de mensagens que NÓS enviamos via `sendMessage` /
   * `sendMediaMessage` (ADR #97). O Baileys ecoa de volta todo envio como
   * `messages.upsert { type: 'notify', key: { fromMe: true } }` — sem este
   * cache não daria para distinguir o eco de uma mensagem que o OPERADOR
   * enviou de OUTRO dispositivo (WhatsApp mobile/web). Cada entrada expira
   * automaticamente após 60 s via `setTimeout` — tempo muito além do típico
   * (o eco chega em < 2 s), mas conservador o suficiente para redes lentas.
   * Um ID é deletado assim que é consumido (no `handleMessagesUpsert`) OU
   * quando o timer dispara, o que acontecer primeiro.
   */
  private readonly sentMessageIds = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Registra um ID de mensagem enviada por NÓS para que o eco do Baileys
   * seja suprimido em `handleMessagesUpsert`. Chamado logo após cada
   * `socket.sendMessage()` bem-sucedido.
   */
  private recordSentMessageId(id: string | null | undefined): void {
    if (!id) return;
    const existing = this.sentMessageIds.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => this.sentMessageIds.delete(id), 60_000);
    this.sentMessageIds.set(id, timer);
  }
  /**
   * Motivo da última desconexão (Production Hardening, Bloco 8a) — ver
   * `WhatsAppDisconnectReason`. `undefined` enquanto nunca houve uma queda
   * nesta instância, ou assim que a sessão volta a `'connecting'`/
   * `'connected'` (ver `connect()`/`handleConnectionUpdate`).
   */
  private currentDisconnectReason: WhatsAppDisconnectReason | undefined;
  private currentPhoneNumber: string | undefined;
  private latestQrCode: string | undefined;

  constructor(
    private readonly tenantId: string,
    private readonly sessionName: string,
    private readonly credentialsStore: CredentialsStore,
    private readonly logger: Logger,
    private readonly reconnectionPolicy: ReconnectionPolicy,
    /**
     * Fase 1, Bloco F1.1 (ADR #90) — cifra a `mediaKey` de mensagens de
     * mídia antes de emitir o evento (nunca em texto plano). OPCIONAL: sem
     * ele, `handleMessagesUpsert` trata qualquer mensagem de mídia como se
     * não tivesse conteúdo extraível (mesmo comportamento de antes deste
     * bloco) — a ausência de `cipher` nunca deveria acontecer em produção
     * (o composition root sempre o injeta), mas o tipo opcional evita
     * quebrar testes/composições antigas que não o conhecem.
     */
    private readonly cipher?: Cipher,
  ) {}

  async connect(): Promise<void> {
    // Cancela qualquer reconexão automática agendada (Production
    // Hardening, Bloco 8b) — esta chamada de `connect()` (explícita, via
    // `SessionManager.init()`, ou disparada pela própria política de
    // retry) já É a tentativa de reconexão; um timer pendente da política
    // se tornaria redundante ou, pior, dispararia uma SEGUNDA reconexão
    // mais tarde, depois que esta já tiver sucedido.
    this.reconnectionPolicy.cancelPending();
    // Encerra qualquer socket anterior desta mesma instância antes de criar
    // um novo — evita o socket zumbi do BUG-04 quando `connect()` é chamado
    // mais de uma vez ao longo da vida do objeto (reconexões).
    this.teardownSocket();

    // Carrega o Baileys (ESM) UMA vez e reutiliza nas reconexões — o módulo é
    // imutável, não há razão para reimportar. Também mantém o `connect()` de
    // reconexão com o mesmo número de `await`s do original (o import só
    // acontece na primeiríssima conexão), preservando a semântica de timing.
    if (!this.baileys) {
      this.baileys = await import('@whiskeysockets/baileys');
    }

    const namespace = buildWhatsAppCredentialsNamespace(this.sessionName);
    const { state, saveCreds } = await useCredentialsStoreAuthState(
      this.credentialsStore,
      this.tenantId,
      namespace,
    );

    // Sem isto, `makeWASocket` usa a versão do protocolo WhatsApp Web
    // EMBUTIDA no pacote instalado — que fica desatualizada com o tempo (o
    // pacote não é republicado a cada mudança do WhatsApp) e faz o servidor
    // rejeitar o handshake Noise ("Connection Failure" / erro em
    // `decodeFrame`, encontrado em teste manual real). `fetchLatestBaileysVersion()`
    // busca a versão atual publicada pelo próprio WhatsApp em tempo de
    // execução, evitando esse acoplamento a uma versão fixa no código.
    const { version, isLatest } = await this.baileys.fetchLatestBaileysVersion();
    this.logger.debug('Versão do protocolo WhatsApp Web resolvida', {
      tenantId: this.tenantId,
      sessionName: this.sessionName,
      version,
      isLatest,
    });

    // `makeWASocket` é o export DEFAULT do Baileys. `printQRInTerminal` foi
    // removido nas versões novas (o QR já chega via `connection.update.qr`),
    // então não é mais passado — evita erro de tipo na v7.
    const socket = this.baileys.default({
      auth: state,
      version,
    });
    this.socket = socket;

    socket.ev.on('creds.update', () => {
      // Mesmo check de identidade do handler de connection.update abaixo
      // (corrige o BUG-12, auditoria de integração de 2026-07-06, ver
      // DECISIONS.md ADR #26): sem ele, um `creds.update` tardio de um
      // socket já substituído/encerrado (ex.: flush final ao chamar
      // `.end()` durante uma reconexão) sobrescreveria a chave `'creds'`
      // no banco com dados desatualizados, mesmo depois do socket NOVO já
      // ter salvo algo mais recente — perda/corrupção de credenciais.
      if (!this.isCurrentSocket(socket)) {
        return;
      }
      // `saveCreds()` é chamado pelo Baileys de forma fire-and-forget (não
      // aguarda a Promise retornada) — sem este catch, uma falha ao
      // persistir credenciais viraria uma unhandled promise rejection
      // silenciosa, perdendo a atualização sem nenhum registro (mesmo
      // racional que motivou o Logger em M1A.1).
      saveCreds().catch((error) => {
        this.logger.error('Falha ao persistir credenciais do Baileys', {
          tenantId: this.tenantId,
          sessionName: this.sessionName,
          error,
        });
      });
    });
    socket.ev.on('connection.update', (update) => {
      // Este handler está fechado sobre a variável local `socket` (a
      // referência criada por ESTA chamada de connect()). Se, no momento em
      // que o evento chega, `this.socket` já foi substituído por um socket
      // mais novo (outra chamada de connect() aconteceu no meio-tempo), este
      // evento é de um socket obsoleto — ignorar, em vez de deixá-lo
      // sobrescrever o estado do socket atual (corrige o "status flapping"
      // do BUG-04).
      if (!this.isCurrentSocket(socket)) {
        return;
      }
      this.handleConnectionUpdate(update);
    });
    socket.ev.on('messages.upsert', (update: BaileysMessagesUpsertEvent) => {
      // Mesmo check de identidade dos dois handlers acima — um socket
      // substituído não deve repassar mensagens "em nome" da sessão atual.
      if (!this.isCurrentSocket(socket)) {
        return;
      }
      this.handleMessagesUpsert(update);
    });
    this.currentStatus = 'connecting';
    // Limpa o motivo da desconexão anterior (Production Hardening, Bloco
    // 8a) — entrar em 'connecting' é entrar de novo na máquina de estados
    // "viva"; um motivo de queda antigo não é mais informação atual sobre
    // esta instância. Ver `WhatsAppDisconnectReason`.
    this.currentDisconnectReason = undefined;
  }

  async disconnect(): Promise<void> {
    // Desconexão EXPLÍCITA (Production Hardening, Bloco 8b) — cancela
    // qualquer reconexão automática ainda pendente. Sem isto, um `disconnect()`
    // pedido via HTTP logo após uma queda recuperável (mas antes do timer de
    // backoff disparar) seria "desfeito" minutos depois por uma reconexão
    // automática indesejada, contrariando o pedido explícito do usuário.
    this.reconnectionPolicy.cancelPending();
    this.teardownSocket();
    this.currentStatus = 'disconnected';
  }

  /**
   * Encerra o socket atual (se existir) e limpa a referência. Extraído para
   * ser reutilizado tanto por `disconnect()` quanto por `connect()` (que
   * precisa encerrar um socket anterior antes de criar um novo — ver
   * correção do BUG-04). Limpa `this.socket` ANTES de chamar `.end()`, para
   * que, mesmo que `.end()` dispare síncrona/reentrantemente um evento final
   * do socket antigo, o check de identidade em `connect()` já veja
   * `this.socket !== socket` e ignore esse evento corretamente.
   */
  private teardownSocket(): void {
    const staleSocket = this.socket;
    this.socket = undefined;
    if (!staleSocket) {
      return;
    }
    try {
      staleSocket.end(undefined);
    } catch (error) {
      this.logger.warn('Falha ao encerrar socket anterior do Baileys', {
        tenantId: this.tenantId,
        sessionName: this.sessionName,
        error,
      });
    }
  }

  /**
   * Compara `socket` (a referência capturada por um handler no momento em
   * que foi registrado) contra `this.socket` (o socket atual da instância) —
   * verdadeiro somente se `socket` ainda for o socket vigente. Extraído
   * (Milestone 3, Bloco 1 — ajuste de auditoria arquitetural do Claude
   * Design) dos handlers de `creds.update`/`connection.update` (BUG-04/
   * BUG-12), que repetiam a mesma comparação `this.socket !== socket`
   * individualmente; reaproveitado também pelo novo handler de
   * `messages.upsert`. Comportamento idêntico ao anterior — apenas
   * nomeado e compartilhado, nenhuma lógica nova.
   */
  private isCurrentSocket(socket: WASocket): boolean {
    return this.socket === socket;
  }

  async getStatus(): Promise<WhatsAppSession['status']> {
    return this.currentStatus;
  }

  async getQRCode(): Promise<string> {
    if (!this.latestQrCode) {
      // BUG-07 (Item 5, Bloco 4): erro de Domain nomeado no lugar de `Error`
      // genérico, para permitir mapeamento por classe na Presentation
      // (Bloco 7), em vez de comparação de string de mensagem.
      throw new WhatsAppQRCodeNotAvailableError(this.tenantId, this.sessionName);
    }
    return this.latestQrCode;
  }

  async getPhoneNumber(): Promise<string | undefined> {
    return this.currentPhoneNumber;
  }

  /**
   * Envia uma mensagem de texto (Milestone 3, Bloco 1). Exige conexão viva
   * de verdade — socket presente E `currentStatus === 'connected'` (ajuste
   * de auditoria arquitetural do Claude Design): a existência do socket
   * sozinha não basta, porque uma sessão em `'connecting'`/reconectando
   * também tem um socket, mas ainda não está pronta para enviar. Sem essa
   * checagem, uma tentativa de envio nessa janela falharia de forma
   * imprevisível dentro do próprio Baileys, em vez de um erro de Domain
   * claro e mapeável.
   */
  async sendMessage(to: string, content: string): Promise<void> {
    if (!this.socket || this.currentStatus !== 'connected') {
      throw new WhatsAppNotConnectedError(this.tenantId, this.sessionName);
    }
    // ADR #97: captura o key.id retornado pelo Baileys para suprimir o eco
    // em `handleMessagesUpsert` e distingui-lo de mensagens enviadas pelo
    // operador de outro dispositivo (WhatsApp mobile/web).
    const sent = await this.socket.sendMessage(to, { text: content });
    this.recordSentMessageId(sent?.key?.id);
  }

  /**
   * Implementa `WhatsAppProvider.sendMediaMessage` (Fase 1, Bloco F1.3) sobre
   * `sock.sendMessage(jid, { image/audio/video/document: buffer, ... })` do
   * Baileys — cada tipo usa uma chave de payload diferente (não existe um
   * `{ media: buffer, type }` genérico na API do Baileys), montada por
   * `buildBaileysMediaContent` abaixo. Mesma checagem de socket vivo de
   * `sendMessage` — nunca envia "melhor esforço" sobre um socket ausente.
   */
  async sendMediaMessage(
    to: string,
    media: {
      contentType: 'image' | 'audio' | 'video' | 'document';
      buffer: Buffer;
      mimeType: string;
      caption?: string;
      fileName?: string;
    },
  ): Promise<void> {
    if (!this.socket || this.currentStatus !== 'connected') {
      throw new WhatsAppNotConnectedError(this.tenantId, this.sessionName);
    }
    const content = buildBaileysMediaContent(media);
    // ADR #97: mesmo padrão de sendMessage — captura o ID para suprimir eco.
    const sent = await this.socket.sendMessage(to, content);
    this.recordSentMessageId(sent?.key?.id);
  }

  onEvent(listener: (event: WhatsAppProviderEvent) => void): void {
    this.eventListener = listener;
  }

  /**
   * Implementa `WhatsAppProvider.getProfilePictureUrl` (Milestone 6, Bloco
   * M6H-2b) sobre `sock.profilePictureUrl(jid, 'image')` do Baileys — API
   * ao vivo do socket conectado, não um dado persistido. `'image'` (em vez
   * de `'preview'`) pede a resolução alta; a Dashboard já redimensiona por
   * CSS, então não há ganho em pedir a miniatura.
   *
   * Nunca lança: sem socket vivo, OU qualquer erro do Baileys (contato sem
   * foto, privacidade bloqueando, erro de rede — o Baileys não distingue
   * esses casos por tipo de exceção, só lança um erro genérico), resulta em
   * `undefined` com um log em nível `debug` (não `warn`/`error` — ausência
   * de foto é o caso comum, não uma falha do sistema).
   *
   * TIMEOUT PRÓPRIO (achado do teste real, 2026-07-25): `profilePictureUrl`
   * é uma query IQ que espera resposta do WhatsApp sobre O MESMO socket
   * usado para tudo mais (mensagens inbound/outbound, presence, etc.) — o
   * Baileys serializa essas esperas por `msgId`, e quando o WhatsApp demora
   * (ou nunca responde, ex.: limitação silenciosa para consultas em lote de
   * foto de perfil) a Promise interna do Baileys fica pendurada até o
   * timeout INTERNO dele, que é longo (dezenas de segundos). Com a inbox
   * pedindo a foto de VÁRIOS contatos ao abrir a tela (cada linha da lista +
   * o cabeçalho da conversa aberta), várias dessas esperas se acumulavam ao
   * mesmo tempo e a sessão parecia "travada" (mensagens reais de/para o
   * WhatsApp atrasavam junto). `Promise.race` contra um timeout PRÓPRIO,
   * bem mais curto, garante que uma foto lenta nunca seja motivo de
   * lentidão perceptível no resto da sessão — só essa foto específica some
   * mais cedo (cai no fallback de iniciais).
   */
  async getProfilePictureUrl(jid: string): Promise<string | undefined> {
    const lookup = await this.lookupProfilePicture(jid);
    return lookup.outcome === 'found' ? lookup.url : undefined;
  }

  /**
   * Versão INSTRUMENTADA (2026-09-05) — mesma consulta, dizendo o desfecho.
   * `getProfilePictureUrl` acima é um invólucro fino sobre ela, então existe
   * uma única implementação da consulta, não duas que podem divergir.
   */
  async lookupProfilePicture(
    jid: string,
    timeoutMs: number = PROFILE_PICTURE_TIMEOUT_MS,
  ): Promise<ProfilePictureLookup> {
    if (!this.socket || this.currentStatus !== 'connected') {
      // CORREÇÃO 2026-07-30 (bug real: foto de perfil nunca aparece, mesmo
      // em contatos com foto pública confirmada): este retorno antecipado
      // era TOTALMENTE silencioso (nem `debug`) — se a UI pedir a foto num
      // instante em que a sessão está reconectando (comum dado o backoff já
      // documentado nesta classe), a foto nunca é buscada e não sobra
      // nenhum rastro no log para diagnosticar. Log em `warn` (não `debug`)
      // porque, ao contrário de "contato sem foto" (normal, ver `catch`
      // abaixo), "sessão não conectada" é um estado que vale a pena
      // investigar se acontecer com frequência.
      this.logger.warn('Foto de perfil não buscada: sessão sem socket vivo/conectado no momento', {
        tenantId: this.tenantId,
        sessionName: this.sessionName,
        jid,
        currentStatus: this.currentStatus,
      });
      return { outcome: 'unavailable', reason: 'session_not_live' };
    }
    try {
      // A Promise original do Baileys NÃO é cancelável — mesmo perdendo a
      // corrida contra o timeout abaixo, ela continua pendente por trás e
      // pode resolver/rejeitar minutos depois. `.catch(() => {})` nela
      // evita um "unhandled promise rejection" nesse caso tardio; como
      // ninguém mais está esperando por ela, o resultado tardio é
      // descartado sem efeito (a Dashboard já recebeu `undefined` e caiu no
      // fallback de iniciais).
      const liveQuery = this.socket.profilePictureUrl(jid, 'image');
      liveQuery.catch(() => {});
      const url = await Promise.race([
        liveQuery,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Timeout ao buscar foto de perfil')),
            timeoutMs,
          ),
        ),
      ]);
      return url ? { outcome: 'found', url } : { outcome: 'absent' };
    } catch (error) {
      // CORREÇÃO 2026-07-30: diferenciar TIMEOUT (log `warn` — pode indicar
      // um problema real de performance/carga do socket, vale investigar
      // se for frequente) de qualquer outro erro do Baileys (log `debug`
      // como antes — contato sem foto/privacidade é o caso comum, não uma
      // falha). Antes desta mudança, os dois caíam no mesmo `debug`,
      // tornando impossível diagnosticar pelo log se a foto realmente não
      // existe ou se a busca está sistematicamente estourando o timeout.
      const isTimeout =
        error instanceof Error && error.message === 'Timeout ao buscar foto de perfil';
      const logMethod = isTimeout ? 'warn' : 'debug';
      this.logger[logMethod]('Foto de perfil indisponível para o contato', {
        tenantId: this.tenantId,
        sessionName: this.sessionName,
        jid,
        timeout: isTimeout,
        error,
      });
      // Timeout NÃO é resposta: o WhatsApp simplesmente não respondeu a
      // tempo, o que não diz nada sobre o contato ter foto ou não.
      // Qualquer outro erro do Baileys é tratado como "não tem foto" porque
      // é assim que a lib sinaliza ausência/privacidade (ela não distingue
      // por tipo de exceção) — separado em `reason: 'error'` no log para a
      // frequência dos dois casos ficar visível.
      return isTimeout
        ? { outcome: 'unavailable', reason: 'timeout' }
        : { outcome: 'absent' };
    }
  }

  /**
   * Implementa `WhatsAppProvider.downloadMedia` (Fase 1, Bloco F1.1, ADR
   * #90) sobre `downloadContentFromMessage` do Baileys — a MESMA função
   * pública usada internamente pelo próprio Baileys para decodificar mídia
   * recebida; não reimplementamos a criptografia do protocolo Signal aqui.
   *
   * Fluxo: decifra a `mediaKeyEncrypted` (cifrada por este mesmo provider em
   * `extractMediaContent`, nunca guardada em texto plano) de volta para o
   * base64 original, decodifica para `Buffer`, e repassa a
   * `downloadContentFromMessage({ url, mediaKey }, mediaType)` — que devolve
   * um stream assíncrono; concatenamos os chunks num único `Buffer` (mídia
   * de mensagem de WhatsApp tem teto de tamanho conhecido do próprio
   * protocolo, nunca um stream de tamanho ilimitado).
   *
   * SEM CIPHER configurado: devolve `undefined` imediatamente — não há como
   * decifrar a `mediaKeyEncrypted` sem ele (mesmo racional de
   * `extractMediaContent`: nunca tenta adivinhar/pular a criptografia).
   *
   * `contentType` é repassado direto como `mediaType` a
   * `downloadContentFromMessage` — mesmo vocabulário
   * (`'image'|'audio'|'video'|'document'|'sticker'`), nenhum mapeamento
   * necessário.
   *
   * Nunca lança: URL expirada, chave inválida, erro de rede ou timeout
   * resultam em `undefined` com log `debug`/`warn` (mesma política de
   * `getProfilePictureUrl`) — a Dashboard trata a ausência como "mídia
   * indisponível", nunca como erro fatal da tela de conversa.
   */
  async downloadMedia(media: {
    contentType: 'image' | 'audio' | 'video' | 'document' | 'sticker';
    mimeType: string;
    url: string;
    mediaKeyEncrypted: string;
  }): Promise<Buffer | undefined> {
    if (!this.cipher) {
      this.logger.warn(
        'Download de mídia pedido sem Cipher configurado — impossível decifrar mediaKey',
        {
          tenantId: this.tenantId,
          sessionName: this.sessionName,
        },
      );
      return undefined;
    }
    try {
      const mediaKeyBase64 = this.cipher.decrypt(this.tenantId, media.mediaKeyEncrypted);
      const mediaKey = Buffer.from(mediaKeyBase64, 'base64');

      const download = async (): Promise<Buffer> => {
        const stream = await this.baileys.downloadContentFromMessage(
          { url: media.url, mediaKey },
          media.contentType,
        );
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk as Buffer);
        }
        return Buffer.concat(chunks);
      };

      return await Promise.race([
        download(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout ao baixar mídia')), MEDIA_DOWNLOAD_TIMEOUT_MS),
        ),
      ]);
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'Timeout ao baixar mídia';
      this.logger[isTimeout ? 'warn' : 'debug']('Mídia indisponível para download', {
        tenantId: this.tenantId,
        sessionName: this.sessionName,
        timeout: isTimeout,
        error,
      });
      return undefined;
    }
  }

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.latestQrCode = qr;
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = statusCode === this.baileys.DisconnectReason.loggedOut;
      const restartRequired = statusCode === this.baileys.DisconnectReason.restartRequired;

      this.currentStatus = 'disconnected';
      this.currentDisconnectReason = this.mapDisconnectReason(statusCode);
      this.logger.warn('Conexão Baileys encerrada', {
        tenantId: this.tenantId,
        sessionName: this.sessionName,
        statusCode,
        loggedOut,
        restartRequired,
      });

      if (loggedOut) {
        // Corrige o BUG-13 (auditoria de integração de 2026-07-06, ver
        // DECISIONS.md ADR #26): `loggedOut` significa que o usuário
        // desvinculou o dispositivo pelo celular — as credenciais
        // persistidas agora são inválidas. Sem limpá-las, uma tentativa
        // futura de `connect()` carregaria essas credenciais mortas em vez
        // de gerar um QR novo, e o WhatsApp rejeitaria a reconexão de novo
        // (reconexão incorreta, sessão presa tentando reautenticar com
        // credenciais que o próprio WhatsApp já invalidou).
        const namespace = buildWhatsAppCredentialsNamespace(this.sessionName);
        this.credentialsStore.clear(this.tenantId, namespace).catch((error) => {
          this.logger.error('Falha ao limpar credenciais após logout', {
            tenantId: this.tenantId,
            sessionName: this.sessionName,
            error,
          });
        });
      }

      this.emitStatusChanged();

      // Reconexão automática (Production Hardening, Bloco 8b — generaliza o
      // que antes só cobria `restartRequired`/515, ver BUG-14): a decisão de
      // TENTAR (e quando) fica inteiramente a cargo de `reconnectionPolicy` —
      // este método só entrega o motivo já classificado e o que fazer quando
      // a política decidir tentar (`connect()`). Nenhum `if (restartRequired)`
      // especial nem timer aqui; a política decide "não" para `logged_out`
      // (via `isDisconnectReasonRecoverable`) e para circuito aberto, e
      // decide "sim, daqui a Xms" para os demais casos.
      this.reconnectionPolicy.scheduleReconnect(this.currentDisconnectReason, () => {
        this.connect().catch((error) => {
          this.logger.error('Falha ao reconectar automaticamente', {
            tenantId: this.tenantId,
            sessionName: this.sessionName,
            disconnectReason: this.currentDisconnectReason,
            error,
          });
        });
      });

      return;
    }

    if (connection === 'open') {
      this.currentStatus = 'connected';
      // Limpa o motivo da desconexão anterior (Production Hardening, Bloco
      // 8a) — ver justificativa em `connect()`.
      this.currentDisconnectReason = undefined;
      // Conexão bem-sucedida: reseta o circuit breaker/contador de falhas
      // consecutivas (Production Hardening, Bloco 8b) — uma sessão que
      // volta a conectar não deve carregar o histórico de falhas de antes.
      this.reconnectionPolicy.reset();
      this.currentPhoneNumber = this.socket?.user?.id?.split(':')[0];
      this.logger.info('Conexão Baileys estabelecida', {
        tenantId: this.tenantId,
        sessionName: this.sessionName,
        phoneNumber: this.currentPhoneNumber,
      });
      this.emitStatusChanged();
      return;
    }

    if (connection === 'connecting') {
      this.currentStatus = 'connecting';
      // Limpa o motivo da desconexão anterior (Production Hardening, Bloco
      // 8a) — ver justificativa em `connect()`.
      this.currentDisconnectReason = undefined;
      this.emitStatusChanged();
    }
  }

  /**
   * Traduz o `statusCode` do Baileys (`DisconnectReason.*`) para o tipo de
   * Domain `WhatsAppDisconnectReason` (Production Hardening, Bloco 8a).
   *
   * `DisconnectReason.connectionLost` e `DisconnectReason.timedOut` são o
   * MESMO valor numérico (408) na biblioteca real (verificado em
   * `node_modules/@whiskeysockets/baileys/lib/Types/index.d.ts`) — por isso
   * um único `case` cobre ambos, mapeado para `'connection_lost'`.
   * `'timed_out'` permanece no tipo de Domain por completude/documentação,
   * mas é estruturalmente INALCANÇÁVEL a partir deste provider hoje (ver
   * `WhatsAppDisconnectReason`).
   *
   * Qualquer `statusCode` não listado explicitamente (`badSession`,
   * `multideviceMismatch`, `forbidden`, `unavailableService`,
   * `connectionClosed`, `connectionReplaced`, ou a ausência de `statusCode`)
   * cai em `'unknown'` — fallback deliberado, não uma expansão especulativa
   * desta função para cada código já existente na biblioteca sem um
   * consumidor real que precise distingui-los (mesmo racional do achado F6).
   */
  private mapDisconnectReason(statusCode: number | undefined): WhatsAppDisconnectReason {
    const reasons = this.baileys.DisconnectReason;
    switch (statusCode) {
      case reasons.loggedOut:
        return 'logged_out';
      case reasons.restartRequired:
        return 'restart_required';
      case reasons.connectionLost:
        return 'connection_lost';
      default:
        return 'unknown';
    }
  }

  private emitStatusChanged(): void {
    this.eventListener?.({
      type: 'status_changed',
      status: this.currentStatus,
      phoneNumber: this.currentPhoneNumber,
      disconnectReason: this.currentDisconnectReason,
    });
  }

  /**
   * Extrai tipo de conteúdo + texto/legenda + referência de mídia (se
   * houver) de UMA mensagem do Baileys — Fase 1, Bloco F1.1 (ADR #90).
   * Antes deste bloco, só `conversation`/`extendedTextMessage.text` eram
   * reconhecidos; qualquer outra mensagem (imagem, áudio, vídeo, documento,
   * figurinha) devolvia `content` vazio e era silenciosamente descartada por
   * `handleMessagesUpsert` (ver `if (!content) continue`).
   *
   * Devolve `undefined` quando NENHUM conteúdo reconhecido foi encontrado
   * (ex.: mensagem de sistema, reação, enquete — ainda fora de escopo) —
   * `handleMessagesUpsert` continua descartando esses casos exatamente como
   * antes.
   *
   * A `mediaKey` só é cifrada (via `this.cipher`) quando o cipher está
   * disponível; sem ele, a mensagem de mídia é tratada como sem conteúdo
   * extraível (mesmo efeito de "não reconhecida" — nunca persiste uma
   * `mediaKey` em texto plano por engano).
   */
  private extractMediaContent(message: BaileysInboundMessage):
    | {
        content: string;
        contentType: WhatsAppMessageContentTypeEvent;
        media?: WhatsAppMediaReferenceEvent;
      }
    | undefined {
    const textContent = message.message?.conversation ?? message.message?.extendedTextMessage?.text;
    if (textContent) {
      return { content: textContent, contentType: 'text' };
    }

    for (const { contentType, field } of MEDIA_MESSAGE_FIELDS) {
      const mediaMessage = message.message?.[field];
      if (!mediaMessage) {
        continue;
      }
      // Sem os 3 campos mínimos (mimetype/url/mediaKey), não há como montar
      // uma referência de mídia utilizável — trata como "não reconhecida"
      // (mesmo efeito de antes do F1.1), em vez de gravar uma referência
      // quebrada.
      if (!mediaMessage.mimetype || !mediaMessage.url || !mediaMessage.mediaKey || !this.cipher) {
        if (mediaMessage.mimetype && mediaMessage.url && mediaMessage.mediaKey && !this.cipher) {
          this.logger.warn(
            'Mensagem de mídia recebida sem Cipher configurado — descartada (ver ADR #90)',
            {
              tenantId: this.tenantId,
              sessionName: this.sessionName,
              contentType,
            },
          );
        }
        continue;
      }
      // `mediaKey` chega como `Uint8Array` do Baileys real — converte para
      // base64 antes de cifrar (`Cipher.encrypt` espera `string`); aceita
      // `string` direto quando já vier assim (fixtures de teste).
      const mediaKeyBase64 =
        typeof mediaMessage.mediaKey === 'string'
          ? mediaMessage.mediaKey
          : Buffer.from(mediaMessage.mediaKey).toString('base64');
      return {
        // Legenda quando houver; string vazia caso contrário (nunca
        // undefined — ver docstring de `Message.content` no Domain).
        content: mediaMessage.caption ?? '',
        contentType,
        media: {
          mimeType: mediaMessage.mimetype,
          url: mediaMessage.url,
          mediaKeyEncrypted: this.cipher.encrypt(this.tenantId, mediaKeyBase64),
          fileName: mediaMessage.fileName ?? undefined,
        },
      };
    }

    return undefined;
  }

  /**
   * Processa um lote de `messages.upsert` (Milestone 3, Bloco 1), emitindo
   * `message_received` para mensagens de texto E, desde a Fase 1/Bloco F1.1
   * (ADR #90), também de imagem/áudio/vídeo/documento/figurinha. Descarta:
   * - `type !== 'notify'` — sincronização de histórico ao reconectar, não
   *   mensagem nova chegando agora;
   * - `key.fromMe === true` — eco de uma mensagem enviada pelo próprio
   *   número (inclusive por este autoresponder, no futuro);
   * - `remoteJid` de grupo (`@g.us`), canal (`@newsletter`) ou broadcast/
   *   STATUS (`@broadcast`, inclui `status@broadcast`) — ver `isIgnoredChatJid`,
   *   que documenta a causa raiz verificada no fonte do Baileys. Reforçado
   *   por `message.broadcast === true` (defesa em profundidade). HOTFIX
   *   2026-07-31: o Status publicado por um contato chega justamente com
   *   `key.remoteJid === 'status@broadcast'`, e era isso que criava (todas
   *   colapsadas numa só) as "conversas fantasma" na Dashboard;
   * - resposta/reação a um STATUS (Stories) — chega no chat 1:1 NORMAL do
   *   contato, então o filtro de sufixo acima não a alcança; detectada via
   *   `isStatusReply` pelo `contextInfo` que aponta para `status@broadcast`;
   * - mensagens sem nenhum conteúdo reconhecido (ver `extractMediaContent`)
   *   — mensagem de sistema, reação, enquete, ou mídia sem Cipher
   *   configurado.
   */
  private handleMessagesUpsert(update: BaileysMessagesUpsertEvent): void {
    if (update.type !== 'notify' && update.type !== 'append') {
      return;
    }
    for (const message of update.messages) {
      // HOTFIX 2026-08-25 (episódios 1 e 2) — ver docstring de
      // `isStaleQueuedMessage`: vale para QUALQUER mensagem aceita
      // ('notify' OU 'append'), não só 'append' — um 'notify' com
      // `messageTimestamp` de dias atrás (mensagem não lida reentregue
      // numa reconexão) é rejeitado do mesmo jeito que um 'append' velho
      // de sincronização de histórico.
      if (isStaleQueuedMessage(message, () => new Date())) {
        this.logger.debug(
          'Mensagem antiga ignorada (fora da janela de frescor — histórico de sincronização ou reentrega de mensagem velha, não mensagem nova)',
          {
            tenantId: this.tenantId,
            sessionName: this.sessionName,
            eventType: update.type,
          },
        );
        continue;
      }
      if (message.key.fromMe) {
        // ADR #97: distinguir eco do nosso próprio stack (já persistido por
        // `OutboundCommandConsumer`/`sendAgentMediaMessage`) de mensagem
        // enviada pelo operador de OUTRO dispositivo (WhatsApp mobile/web).
        const msgId = message.key.id;
        if (msgId && this.sentMessageIds.has(msgId)) {
          // Eco de um envio nosso — consumir a entrada e descartar.
          clearTimeout(this.sentMessageIds.get(msgId));
          this.sentMessageIds.delete(msgId);
          continue;
        }
        // fromMe mas ID não no cache → operador enviou de outro dispositivo.
        // Cai no fluxo normal abaixo, mas será emitido como direction='outbound'.
      }
      const remoteJid = message.key.remoteJid;
      if (!remoteJid || isIgnoredChatJid(remoteJid) || message.broadcast === true) {
        continue;
      }
      if (isStatusReply(message)) {
        continue;
      }
      const extracted = this.extractMediaContent(message);
      if (!extracted) {
        continue;
      }

      if (message.key.fromMe) {
        // Mensagem enviada pelo operador de outro dispositivo (ADR #97).
        // `remoteJid` identifica o CONTATO (destino do envio). Quando o
        // destinatário tem LID (`@lid`), `remoteJid` é o LID bruto — responder
        // e chavear a conversa por ele resultaria num nome buggado (o número
        // longo do LID em vez do telefone real). `remoteJidAlt` (Baileys v7)
        // traz o `@s.whatsapp.net` nesses casos — mesma estratégia do fix de
        // LID inbound (`senderPn || remoteJid`), só o campo muda.
        // `pushName` em mensagens `fromMe` refere-se ao nosso próprio nome de
        // exibição, não ao do contato — omitimos para não sobrescrever o nome
        // já salvo da conversa.
        const from = this.baileys.jidNormalizedUser(message.key.remoteJidAlt || remoteJid);
        this.eventListener?.({
          type: 'message_received',
          direction: 'outbound',
          from,
          content: extracted.content,
          receivedAt: new Date(),
          contentType: extracted.contentType,
          media: extracted.media,
        });
        continue;
      }

      // Mensagem inbound (padrão histórico).
      // Endereço para RESPONDER e para chavear a conversa: quando a mensagem
      // vem de um LID (`@lid`), `remoteJidAlt` traz o número real
      // (`@s.whatsapp.net`). Preferimos ele — responder ao `@lid` é aceito pelo
      // Baileys mas não entrega (achado do teste ponta a ponta com número novo).
      // `jidNormalizedUser` remove sufixo de device/agente do JID escolhido.
      // Sem LID (mensagem já em `@s.whatsapp.net`), `remoteJidAlt` é ausente e
      // cai no `remoteJid` de sempre — comportamento inalterado.
      //
      // CORREÇÃO 2026-08-07 (achado real: conversas duplicadas por `@lid`,
      // registrado em PRODUCT_BACKLOG.md §2): este campo usava `senderPn`
      // (nome do Baileys 6.7.23) — no Baileys 7.0.0-rc13 REALMENTE instalado
      // (`WAMessageKey` de `node_modules/@whiskeysockets/baileys/lib/Types/
      // Message.d.ts`), esse campo não existe mais (renomeado para
      // `remoteJidAlt`, mesmo nome já usado no caminho outbound do ADR #97,
      // logo abaixo). `senderPn` era sempre `undefined` em tempo de execução
      // desde o upgrade para v7 — o fallback para o `@lid` bruto acontecia
      // SEMPRE, silenciosamente, para todo contato cujo JID canônico é um LID.
      const from = this.baileys.jidNormalizedUser(message.key.remoteJidAlt || remoteJid);
      // Milestone 6, Bloco M6H-2b: `pushName` vem vazio como string `''` em
      // alguns eventos do Baileys (não só ausente) — `|| undefined` trata os
      // dois casos como "sem nome", em vez de propagar uma string vazia que
      // a UI exibiria como nome em branco.
      const contactName = message.pushName || undefined;
      this.eventListener?.({
        type: 'message_received',
        from,
        content: extracted.content,
        receivedAt: new Date(),
        contactName,
        contentType: extracted.contentType,
        media: extracted.media,
      });
    }
  }
}
