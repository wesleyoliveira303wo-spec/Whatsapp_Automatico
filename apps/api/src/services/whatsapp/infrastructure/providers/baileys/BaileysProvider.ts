import makeWASocket, {
  ConnectionState,
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';
// `import type` — apagado em tempo de compilação, sem `require()` em
// runtime. `Boom` só é usado como anotação de tipo abaixo (cast), nunca
// instanciado; isso evita uma dependência de runtime desnecessária em
// `@hapi/boom` só para um cast de tipo.
import type { Boom } from '@hapi/boom';

import { Logger } from '../../../../../shared/domain/Logger';
import { CredentialsStore } from '../../../../../shared/security/domain/CredentialsStore';
import { WhatsAppSession } from '../../../domain/entities/WhatsAppSession';
import { WhatsAppDisconnectReason } from '../../../domain/entities/WhatsAppDisconnectReason';
import { WhatsAppProvider } from '../../../domain/providers/WhatsAppProvider';
import { WhatsAppProviderEvent } from '../../../domain/providers/WhatsAppProviderEvent';
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
interface BaileysInboundMessage {
  key: {
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
  };
  message?: {
    conversation?: string | null;
    extendedTextMessage?: { text?: string | null } | null;
  } | null;
}

interface BaileysMessagesUpsertEvent {
  type: string;
  messages: BaileysInboundMessage[];
}

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
 * membro de `WhatsAppProviderEvent`) para mensagens de texto 1:1 reais —
 * descarta silenciosamente `fromMe` (eco do próprio número), mensagens de
 * grupo (`remoteJid` terminado em `@g.us`), eventos que não são `type ===
 * 'notify'` (sincronização de histórico, não mensagem nova) e mensagens sem
 * conteúdo de texto extraível (mídia/figurinha — fora de escopo desta
 * milestone). `sendMessage()` é a contrapartida de saída: só envia com uma
 * conexão viva de verdade (socket presente E `currentStatus === 'connected'`
 * — ajuste de auditoria arquitetural do Claude Design), lançando
 * `WhatsAppNotConnectedError` caso contrário. O check de identidade de
 * socket (`this.socket !== socket`, usado por `creds.update` e
 * `connection.update` desde o BUG-04/BUG-12) passa a ser compartilhado pelos
 * três handlers via `isCurrentSocket()`, extraído nesta Milestone para
 * eliminar a duplicação que um terceiro handler (`messages.upsert`)
 * tornaria ainda mais evidente.
 */
export class BaileysProvider implements WhatsAppProvider {
  private socket: WASocket | undefined;
  private eventListener: ((event: WhatsAppProviderEvent) => void) | undefined;
  private currentStatus: WhatsAppSession['status'] = 'disconnected';
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

    const namespace = buildWhatsAppCredentialsNamespace(this.sessionName);
    const { state, saveCreds } = await useCredentialsStoreAuthState(this.credentialsStore, this.tenantId, namespace);

    // Sem isto, `makeWASocket` usa a versão do protocolo WhatsApp Web
    // EMBUTIDA no pacote instalado — que fica desatualizada com o tempo (o
    // pacote não é republicado a cada mudança do WhatsApp) e faz o servidor
    // rejeitar o handshake Noise ("Connection Failure" / erro em
    // `decodeFrame`, encontrado em teste manual real). `fetchLatestBaileysVersion()`
    // busca a versão atual publicada pelo próprio WhatsApp em tempo de
    // execução, evitando esse acoplamento a uma versão fixa no código.
    const { version, isLatest } = await fetchLatestBaileysVersion();
    this.logger.debug('Versão do protocolo WhatsApp Web resolvida', {
      tenantId: this.tenantId,
      sessionName: this.sessionName,
      version,
      isLatest,
    });

    const socket = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
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
    // [OUTBOUND-DEBUG] listener temporário de ACK de entrega. Quando enviamos
    // uma mensagem, o WhatsApp responde com atualizações de status:
    // 1=PENDING, 2=SERVER_ACK (servidor recebeu), 3=DELIVERY_ACK (entregue no
    // aparelho), 4=READ. Se a nossa mensagem NUNCA passa de PENDING/nunca
    // recebe SERVER_ACK, o servidor não roteou (endereço/rota) — se recebe
    // SERVER_ACK mas nunca DELIVERY_ACK, entregou ao servidor mas não ao
    // aparelho. É o dado que falta para saber onde o envio morre.
    socket.ev.on('messages.update', (updates) => {
      if (!this.isCurrentSocket(socket)) {
        return;
      }
      for (const u of updates) {
        this.logger.info('[OUTBOUND-DEBUG] messages.update (ACK)', {
          tenantId: this.tenantId,
          sessionName: this.sessionName,
          messageId: u.key?.id,
          toJid: u.key?.remoteJid,
          ackStatus: u.update?.status,
        });
      }
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
    // [OUTBOUND-DEBUG] diagnóstico temporário do bug de entrega (número novo /
    // LID). Loga o endereço exato para onde estamos enviando + a identidade do
    // socket. Comparar `to` com `socketUser` e com o ACK em `messages.update`
    // abaixo diz se o problema é endereço errado ou socket que não entrega.
    this.logger.info('[OUTBOUND-DEBUG] enviando mensagem', {
      tenantId: this.tenantId,
      sessionName: this.sessionName,
      to,
      status: this.currentStatus,
      socketUser: (this.socket as unknown as { user?: { id?: string } }).user?.id,
    });
    const result = await this.socket.sendMessage(to, { text: content });
    this.logger.info('[OUTBOUND-DEBUG] sendMessage retornou', {
      to,
      messageId: (result as unknown as { key?: { id?: string } } | undefined)?.key?.id,
      ackStatus: (result as unknown as { status?: number } | undefined)?.status,
    });
  }

  onEvent(listener: (event: WhatsAppProviderEvent) => void): void {
    this.eventListener = listener;
  }

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.latestQrCode = qr;
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const restartRequired = statusCode === DisconnectReason.restartRequired;

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
    switch (statusCode) {
      case DisconnectReason.loggedOut:
        return 'logged_out';
      case DisconnectReason.restartRequired:
        return 'restart_required';
      case DisconnectReason.connectionLost:
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
   * Processa um lote de `messages.upsert` (Milestone 3, Bloco 1), emitindo
   * `message_received` só para mensagens de texto 1:1 reais. Descarta:
   * - `type !== 'notify'` — sincronização de histórico ao reconectar, não
   *   mensagem nova chegando agora;
   * - `key.fromMe === true` — eco de uma mensagem enviada pelo próprio
   *   número (inclusive por este autoresponder, no futuro);
   * - `remoteJid` de grupo (sufixo `@g.us`) — fora de escopo desta
   *   milestone (ver §0 do `MILESTONE_003_AI_AUTORESPONDER.md`);
   * - mensagens sem texto extraível (`conversation`/`extendedTextMessage.text`
   *   ausentes — mídia, figurinha, etc., também fora de escopo).
   */
  private handleMessagesUpsert(update: BaileysMessagesUpsertEvent): void {
    if (update.type !== 'notify') {
      return;
    }
    for (const message of update.messages) {
      if (message.key.fromMe) {
        continue;
      }
      const remoteJid = message.key.remoteJid;
      if (!remoteJid || remoteJid.endsWith('@g.us')) {
        continue;
      }
      const content = message.message?.conversation ?? message.message?.extendedTextMessage?.text;
      if (!content) {
        continue;
      }
      // Endereço para RESPONDER e para chavear a conversa: quando a mensagem
      // vem de um LID (`@lid`), `senderPn` traz o número real
      // (`@s.whatsapp.net`). Preferimos ele — responder ao `@lid` é aceito pelo
      // Baileys mas não entrega (achado do teste ponta a ponta com número novo).
      // `jidNormalizedUser` remove sufixo de device/agente do JID escolhido.
      // Sem LID (mensagem já em `@s.whatsapp.net`), `senderPn` é ausente e cai
      // no `remoteJid` de sempre — comportamento inalterado.
      const from = jidNormalizedUser(message.key.senderPn || remoteJid);
      this.eventListener?.({
        type: 'message_received',
        from,
        content,
        receivedAt: new Date(),
      });
    }
  }
}
