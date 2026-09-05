/**
 * Desfecho de uma consulta de foto de perfil (2026-09-05).
 *
 * `absent` é uma resposta: perguntamos e não há foto (ou a privacidade do
 * contato bloqueia). `unavailable` NÃO é resposta: não houve pergunta, ou
 * ela não voltou — e por isso nunca deve ser confundida com a primeira.
 */
export type ProfilePictureLookup =
  | { outcome: 'found'; url: string }
  | { outcome: 'absent' }
  | { outcome: 'unavailable'; reason: 'session_not_live' | 'timeout' | 'error' };

import { WhatsAppSession } from '../entities/WhatsAppSession';
import { WhatsAppProviderEvent } from './WhatsAppProviderEvent';

/**
 * Porta (port) do Domain para qualquer provedor de conexão WhatsApp.
 * A Application (SessionManager) depende apenas deste contrato — nunca de
 * uma implementação concreta. A Infrastructure (ex.: um provider baseado em
 * Baileys) implementa esta interface, respeitando a direção de dependência
 * da Clean Architecture (Infrastructure → Domain, nunca o inverso).
 */
export interface WhatsAppProvider {
  /** Inicia a conexão com o WhatsApp (ex.: abre o socket do Baileys). */
  connect(): Promise<void>;

  /** Encerra a conexão ativa. */
  disconnect(): Promise<void>;

  /**
   * Status atual da conexão, no mesmo vocabulário de `WhatsAppSession.status`.
   * Uso: leitura pontual/síncrona (ex.: logo após `connect()`). Para reagir a
   * mudanças que acontecem depois, sem nova chamada da Application, use
   * `onEvent`.
   */
  getStatus(): Promise<WhatsAppSession['status']>;

  /** QR Code atual para pareamento (string a ser renderizada como imagem/ASCII). */
  getQRCode(): Promise<string>;

  /** Número de telefone associado à sessão conectada, se disponível. */
  getPhoneNumber(): Promise<string | undefined>;

  /**
   * Envia uma mensagem de texto para `to` (JID do destinatário, ex.:
   * `"5511999999999@s.whatsapp.net"`) através da sessão desta instância
   * (Milestone 3, Bloco 1). `to` é um dado de CADA chamada (o destinatário
   * varia por mensagem), não uma identidade da instância — diferente de
   * `tenantId`/`sessionName`, que continuam fixados na construção (ver
   * restrição da ADR #29 sobre `SessionManager`, que não se aplica aqui: o
   * destinatário nunca foi a identidade que este port fixa).
   *
   * Lança `WhatsAppNotConnectedError` se a sessão não estiver com uma
   * conexão viva no momento da chamada — nunca envia "melhor esforço" sobre
   * um socket ausente ou parcialmente conectado.
   */
  sendMessage(to: string, content: string): Promise<void>;

  /**
   * Registra um listener para eventos assíncronos do provider (ex.: Baileys
   * confirmando pareamento após o QR ser escaneado, uma queda inesperada de
   * sessão, ou — no futuro — QR atualizado, mensagem recebida, presence).
   * Necessário porque provedores reais são orientados a eventos, não a
   * request/response puro.
   *
   * Recebe uma união discriminada (`WhatsAppProviderEvent`) em vez de um
   * método dedicado por tipo de evento — assim, novos tipos de evento se
   * tornam apenas um novo membro da união, sem exigir um novo método aqui
   * nem mudar a assinatura deste método (Open/Closed Principle; corrige o
   * achado F2 do Architecture Gate Review, que apontou o desenho anterior
   * como falso-OCP).
   *
   * Cada instância de `WhatsAppProvider` corresponde a exatamente uma
   * sessão/socket, então há apenas um listener ativo por vez — chamar este
   * método novamente substitui o listener anterior, não acumula (evita a
   * complexidade de um EventEmitter multi-assinante, desnecessária neste
   * escopo; revisitar se um dia houver múltiplos consumidores).
   */
  onEvent(listener: (event: WhatsAppProviderEvent) => void): void;

  /**
   * URL da foto de perfil de `jid` (Milestone 6, Bloco M6H-2b), consultada
   * AO VIVO no socket conectado — diferente de `contactName`/`pushName`
   * (Domain, persistido em `WhatsAppConversation` a cada mensagem), a foto
   * NUNCA é persistida por este projeto: é buscada sob demanda a cada
   * chamada, porque pode mudar a qualquer momento e porque a URL que o
   * WhatsApp devolve já é pública/temporária por natureza (mesmo racional de
   * "não duplicar o que o próprio WhatsApp já serve").
   *
   * Devolve `undefined` — nunca lança — quando a foto não está disponível
   * por QUALQUER motivo (sessão sem conexão viva, contato sem foto,
   * privacidade do contato bloqueando, erro de rede): a ausência de avatar é
   * um resultado normal e esperado (a maioria dos contatos pode não ter foto
   * ou ter privacidade restrita), nunca deveria quebrar a tela de conversa.
   * Implementações devem logar a falha em nível `debug`/`warn`, não `error`.
   */
  getProfilePictureUrl(jid: string): Promise<string | undefined>;

  /**
   * Mesma consulta de `getProfilePictureUrl`, mas dizendo O QUE ACONTECEU —
   * instrumentação pedida pelo fundador em 2026-09-05.
   *
   * Existe porque `undefined` colapsava três situações muito diferentes:
   * "perguntamos e esta pessoa não tem foto", "não deu para perguntar
   * (sessão fora do ar)" e "perguntamos e o WhatsApp não respondeu a tempo".
   * A primeira é informação e merece ser guardada; as outras duas são
   * ausência de resposta, e guardá-las como se fossem "sem foto" esconde a
   * foto de todo mundo por horas (foi exatamente o que aconteceu).
   *
   * `getProfilePictureUrl` continua existindo e é implementado SOBRE este
   * método — nenhuma consulta duplicada.
   */
  lookupProfilePicture(
    jid: string,
    /**
     * Teto de espera desta consulta. O default (6s) protege quem está
     * ESPERANDO na tela. A atualização em segundo plano do cache passa um
     * valor bem maior: ninguém está esperando por ela, e a medição de
     * 2026-09-05 mostrou que 6s derrubava 89% das consultas por tempo — não
     * por ausência de foto.
     */
    timeoutMs?: number,
  ): Promise<ProfilePictureLookup>;

  /**
   * Baixa e descriptografa o binário de uma mídia de mensagem (Fase 1,
   * Bloco F1.1, ADR #90) — a contrapartida de leitura de
   * `extractMediaContent`/`WhatsAppMediaReferenceEvent` em `BaileysProvider`.
   *
   * Recebe a MESMA referência persistida em `Message.media`
   * (`mimeType`/`url`/`mediaKeyEncrypted`), nunca um `messageId` — este port
   * não conhece `services/conversations` (mesma disciplina de fronteira já
   * documentada em `MessageReceivedHandler`/`WhatsAppProviderEvent`); quem
   * traduz `messageId` → referência de mídia é a camada de Presentation
   * (rota REST), não este provider.
   *
   * ADR #90, Alternativa B (proxy sob demanda): o binário NUNCA é persistido
   * em disco/storage de objetos por este projeto — é buscado e
   * descriptografado a cada chamada, exatamente como `getProfilePictureUrl`
   * nunca persiste a foto. Devolve `undefined` — nunca lança — quando a
   * mídia não pôde ser obtida por QUALQUER motivo (URL expirada, erro de
   * rede, chave inválida, timeout): ausência de mídia recuperável é um
   * resultado normal (arquivos do WhatsApp expiram), nunca deveria quebrar a
   * tela de conversa.
   *
   * `contentType` (Exclude de `'text'`) decide o algoritmo de decodificação
   * do protocolo Signal — cada tipo de mídia usa uma derivação de chave
   * diferente internamente no Baileys; nunca inferido do `mimeType` (um
   * `image/jpeg` sempre é `contentType: 'image'`, mas o inverso não é
   * confiável o bastante para decidir criptografia).
   */
  downloadMedia(media: {
    contentType: 'image' | 'audio' | 'video' | 'document' | 'sticker';
    mimeType: string;
    url: string;
    mediaKeyEncrypted: string;
  }): Promise<Buffer | undefined>;

  /**
   * Envia uma mensagem de MÍDIA (imagem/áudio/vídeo/documento) para `to`,
   * pelo mesmo socket de `sendMessage` — Fase 1, Bloco F1.3 (a contrapartida
   * de envio de `downloadMedia`, que só lê). Diferente de `sendMessage`, que
   * hoje só existe para texto, este método recebe o BINÁRIO já em memória
   * (`Buffer`) — quem chama (`ConversationsService.sendAgentMediaMessage`) já
   * leu o corpo bruto da requisição HTTP antes de chegar aqui; este port não
   * conhece upload/multipart, só bytes.
   *
   * `contentType: 'sticker'` deliberadamente FORA da união aceita aqui (ao
   * contrário de `downloadMedia`): o WhatsApp exige figurinhas num formato
   * WebP específico com metadados próprios — enviar uma imagem comum como
   * `sticker` não funciona no protocolo. Enviar figurinhas teria que tratar
   * essa conversão, fora do escopo de F1.3 (só paridade de imagem/áudio/
   * vídeo/documento com o que um atendente humano faria pelo WhatsApp Web).
   *
   * Lança `WhatsAppNotConnectedError` nas mesmas condições de `sendMessage`
   * (sem sessão viva) — mesma disciplina de "nunca envia melhor esforço sobre
   * um socket ausente".
   */
  sendMediaMessage(
    to: string,
    media: {
      contentType: 'image' | 'audio' | 'video' | 'document';
      buffer: Buffer;
      mimeType: string;
      caption?: string;
      fileName?: string;
    },
  ): Promise<void>;
}
