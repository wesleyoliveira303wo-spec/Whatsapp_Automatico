import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { CredentialsStore } from '../../../shared/security/domain/CredentialsStore';
import { AuditLogRepository } from '../../auth/domain/repositories/AuditLogRepository';
import { WhatsAppSession } from '../domain/entities/WhatsAppSession';
import { WhatsAppSessionEvent } from '../domain/entities/WhatsAppSessionEvent';
import { WhatsAppSessionRepository } from '../domain/repositories/WhatsAppSessionRepository';
import { WhatsAppSessionEventRepository } from '../domain/repositories/WhatsAppSessionEventRepository';
import { buildWhatsAppCredentialsNamespace } from '../domain/credentialsNamespace';
import { WhatsAppConnectionRegistry } from './WhatsAppConnectionRegistry';

/** M2, Fase 2 — quantidade padrão de eventos devolvidos por `getSessionHistory()` quando o chamador não especifica `limit`. */
const DEFAULT_HISTORY_LIMIT = 50;
/** M2, Fase 2 — teto de `limit` aceito por `getSessionHistory()`, independentemente do que o chamador pedir. */
const MAX_HISTORY_LIMIT = 200;

/**
 * DTO de resposta de `getSessionStatus()` (M2, Fase 1) — estende
 * `WhatsAppSession` com `generation`, um dado que existe DELIBERADAMENTE só
 * em memória (Production Hardening, Bloco 4 — ver `SessionManager.generation`
 * e ADR #42) e nunca deve ser persistido em `WhatsAppSession`/Prisma. Vive
 * aqui, na Application, como um tipo de saída — não uma mudança na entidade
 * de Domain, que continua representando só o estado durável da sessão.
 */
export interface WhatsAppSessionDetails extends WhatsAppSession {
  generation: number;
}

/**
 * Quem está executando a ação (Milestone 5, Bloco M5D-3). A Presentation
 * traduz o `principal` (crachá ou chave da empresa) para este primitivo. As
 * sessões NÃO têm enforcement de dono por usuário (são infra compartilhada do
 * tenant — qualquer um com a permissão de cargo age); o `userId` serve só para
 * ATRIBUIR a ação na auditoria (`undefined` = plano máquina/chave da empresa).
 */
export interface WhatsAppSessionActor {
  userId?: string;
}

/** Metadados de origem (só auditoria/diagnóstico). */
export interface WhatsAppSessionActionMeta {
  userAgent?: string;
  ip?: string;
}

/**
 * Application Service que orquestra as quatro operações de sessão do
 * WhatsApp (init/status/qrcode/disconnect) validando a existência do tenant
 * ANTES de delegar ao `WhatsAppConnectionRegistry` (Production Hardening,
 * Bloco 5 — decisão arquitetural fechada após múltiplas rodadas de auditoria
 * adversarial, ver DECISIONS.md).
 *
 * Por que este Service existe (e por que a validação não fica no Registry
 * nem no Router):
 *
 * - O `WhatsAppConnectionRegistry` continua sendo EXCLUSIVAMENTE um pool de
 *   `SessionManager` (criar/reaproveitar/remover) — nunca validou tenant,
 *   nunca autenticou, nunca conheceu regra de negócio nenhuma, e continua
 *   assim. Colocar a validação de tenant ali violaria SRP (o Registry
 *   ganharia uma segunda razão para mudar: "como o pool funciona" E "como um
 *   tenant é validado").
 * - O Router (Presentation, Bloco 7) não deve tocar `TenantRepository` nem
 *   `WhatsAppConnectionRegistry` diretamente — só conhece este Service, mesmo
 *   padrão já usado para justificar a extração da função pura de autenticação
 *   no middleware (`resolveTenantFromApiKey`, Bloco 6).
 * - Um único caso de uso concreto (4 operações HTTP, mesma dependência dupla
 *   — `TenantRepository` + `Registry`) justifica uma classe coesa aqui,
 *   diferente do caso da autenticação (Bloco 6), que foi resolvido com uma
 *   função pura por ter uma única responsabilidade minúscula: aqui há quatro
 *   operações relacionadas compartilhando a mesma orquestração
 *   (validar tenant, então delegar), o que é exatamente o critério de coesão
 *   que justifica uma classe (mesma "razão para mudar": layout de validação +
 *   delegação, replicado de forma idêntica nas quatro).
 *
 * `disconnectSession()` implementa a orquestração de evicção segura (Bloco
 * 4): captura a geração ANTES de desconectar, e só evicta do Registry se essa
 * geração ainda for a atual — ver docstring de `SessionManager.generation` e
 * `WhatsAppConnectionRegistry.evictIfCurrent()` para a análise completa da
 * race condition que isso fecha.
 *
 * M2, Fase 1 — duas novas dependências, ambas ports já existentes no projeto
 * (nenhuma peça nova de Infrastructure foi inventada para isto):
 * - `sessionRepository` (`WhatsAppSessionRepository`): usado SÓ por
 *   `listSessions()`/`removeSession()`. Deliberadamente NÃO usado pelas
 *   quatro operações originais (`init`/`getStatus`/`getQRCode`/`disconnect`),
 *   que continuam delegando exclusivamente ao Registry/SessionManager — dar a
 *   este Service acesso de leitura direto ao repositório só faz sentido para
 *   `listSessions()`, que precisa responder sem instanciar um
 *   `SessionManager`/`WhatsAppProvider` por sessão listada (o Registry não
 *   tem — e não deveria ganhar — uma forma de "listar tudo que existe no
 *   banco para um tenant"; isso é uma leitura pura de Infrastructure, sem
 *   nenhum ciclo de vida de conexão envolvido).
 * - `credentialsStore` (`CredentialsStore`): usado só por `removeSession()`,
 *   para limpar as credenciais persistidas da sessão removida — mesma porta
 *   já usada por `BaileysProvider` para o mesmo fim no logout (BUG-13, ADR
 *   #26), aqui reaproveitada para um gatilho diferente (remoção explícita via
 *   Dashboard, não detecção de `loggedOut` pelo protocolo).
 *
 * M2, Fase 2 — `eventRepository` (`WhatsAppSessionEventRepository`, novo
 * port): usado só por `getSessionHistory()`, mesma leitura direta (sem
 * passar pelo Registry) já usada por `listSessions()` — não há ciclo de
 * vida de conexão nenhum envolvido em consultar o log de transições
 * passadas de uma sessão, viva ou já removida.
 */
export class WhatsAppSessionService {
  constructor(
    private readonly registry: WhatsAppConnectionRegistry,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: Logger,
    private readonly sessionRepository: WhatsAppSessionRepository,
    private readonly credentialsStore: CredentialsStore,
    private readonly eventRepository: WhatsAppSessionEventRepository,
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  /**
   * `POST /` — sobe/reconecta a sessão. Milestone 5, Bloco M5D-3: registra
   * `session.created` na auditoria com o ator. `actor`/`meta` são opcionais
   * (default plano máquina) para não quebrar chamadores/testes antigos.
   */
  async initSession(
    tenantId: string,
    sessionName: string,
    actor: WhatsAppSessionActor = {},
    meta: WhatsAppSessionActionMeta = {},
  ): Promise<WhatsAppSession> {
    await this.assertTenantExists(tenantId);
    const sessionManager = this.registry.getOrCreate(tenantId, sessionName);
    const session = await sessionManager.init();
    await this.audit(tenantId, actor.userId, 'session.created', sessionName, meta);
    return session;
  }

  /**
   * Status atual da sessão, enriquecido com `generation` (M2, Fase 1) — ver
   * docstring de `WhatsAppSessionDetails`. Extensão aditiva do tipo de
   * retorno (todos os campos de `WhatsAppSession` continuam presentes,
   * inalterados) — nenhum consumidor existente que apenas leia campos
   * conhecidos de `WhatsAppSession` é afetado.
   */
  async getSessionStatus(tenantId: string, sessionName: string): Promise<WhatsAppSessionDetails> {
    await this.assertTenantExists(tenantId);
    const sessionManager = this.registry.getOrCreate(tenantId, sessionName);
    const session = await sessionManager.getStatus();
    return { ...session, generation: sessionManager.getGeneration() };
  }

  /**
   * Lista todas as sessões de um tenant (M2, Fase 1 — suporte à tela de
   * lista do Dashboard). Leitura de base do repositório — deliberadamente NÃO
   * usa `Registry.getOrCreate()`: instanciar um `SessionManager` (e, por trás
   * dele, um `WhatsAppProvider`/socket Baileys) para CADA sessão só para
   * listá-las teria um efeito colateral real e indesejado (abrir recursos de
   * conexão que ninguém pediu). Por isso esta lista não inclui `generation`
   * (que só existe em instâncias de `SessionManager` já vivas no Registry) —
   * quem quiser esse dado consulta `getSessionStatus()` para a sessão
   * específica.
   *
   * Status ao vivo quando disponível (2026-07-25, correção de bug real):
   * antes, o `status` devolvido aqui era só o valor CRU do banco — que só é
   * atualizado de forma assíncrona por `SessionManager.subscribeToProviderEvents`
   * enquanto uma instância dessa sessão está viva no Registry (ver docstring
   * de `SessionManager`). Se o processo da API reinicia (ou uma sessão nunca
   * foi tocada de novo depois de cair), o banco fica com o ÚLTIMO status
   * conhecido — podendo mostrar "Conectado" na tela "Seus WhatsApps" muito
   * depois de a conexão real ter caído, enquanto `getSessionStatus()` (usado
   * em Configurações) já mostrava o valor correto por consultar o provider
   * ao vivo. Correção: para cada sessão, `registry.peek()` (leitura pura, sem
   * criar nada — ver docstring do método) tenta achar uma instância JÁ viva;
   * se achar, sobrepõe `status` com `sessionManager.getStatus()` (a mesma
   * fonte de verdade de `getSessionStatus()`). Sem instância viva, mantém o
   * valor do banco como estava (nenhuma sessão nova é instanciada só para
   * listar — a garantia original desta função continua intacta).
   */
  async listSessions(tenantId: string): Promise<WhatsAppSession[]> {
    await this.assertTenantExists(tenantId);
    const sessions = await this.sessionRepository.findAllByTenant(tenantId);
    return Promise.all(
      sessions.map(async (session) => {
        const live = this.registry.peek(tenantId, session.sessionName);
        if (!live) {
          return session;
        }
        try {
          const liveSession = await live.getStatus();
          return {
            ...session,
            status: liveSession.status,
            phoneNumber: liveSession.phoneNumber ?? session.phoneNumber,
          };
        } catch (error) {
          // getStatus() pode lançar WhatsAppSessionNotFoundError num caso
          // extremo de dessincronia (sessão removida do banco entre o
          // findAllByTenant acima e este ponto) — nunca deve derrubar a
          // listagem inteira por causa de UMA sessão; cai para o valor do
          // banco, mesma política de resiliência já usada em
          // `getProfilePictureUrl`/demais leituras auxiliares deste bounded
          // context.
          this.logger.debug(
            'Falha ao consultar status ao vivo de uma sessão em listSessions() — usando valor do banco',
            {
              tenantId,
              sessionName: session.sessionName,
              error,
            },
          );
          return session;
        }
      }),
    );
  }

  /**
   * Histórico recente de transições de status de uma sessão (M2, Fase 2 —
   * M2-B5), do mais novo para o mais antigo. Leitura direta do
   * `eventRepository` — mesmo motivo de `listSessions()` para não passar
   * pelo Registry (nenhum ciclo de vida de conexão envolvido).
   *
   * Deliberadamente NÃO valida que a sessão (`sessionName`) ainda existe em
   * `WhatsAppSession` — só que o TENANT existe. Ver docstring de
   * `WhatsAppSessionEvent`: o histórico é projetado para sobreviver à
   * remoção da sessão (`removeSession()`), então consultá-lo para uma
   * sessão já removida é um caso de uso válido, não um erro.
   *
   * `limit` é limitado a `MAX_HISTORY_LIMIT` independentemente do que o
   * chamador pedir — protege contra uma requisição HTTP pedindo um `limit`
   * arbitrariamente grande (`?limit=999999`) forçar uma consulta sem
   * controle de tamanho (CLAUDE.md §15, "Segurança primeiro").
   */
  async getSessionHistory(
    tenantId: string,
    sessionName: string,
    limit: number = DEFAULT_HISTORY_LIMIT,
  ): Promise<WhatsAppSessionEvent[]> {
    await this.assertTenantExists(tenantId);
    const effectiveLimit = Math.min(limit, MAX_HISTORY_LIMIT);
    return this.eventRepository.listRecentByTenantAndSessionName(
      tenantId,
      sessionName,
      effectiveLimit,
    );
  }

  async getSessionQRCode(tenantId: string, sessionName: string): Promise<string> {
    await this.assertTenantExists(tenantId);
    const sessionManager = this.registry.getOrCreate(tenantId, sessionName);
    return sessionManager.getQRCode();
  }

  /**
   * Foto de perfil de um contato (Milestone 6, Bloco M6H-2b) — mesmo padrão
   * de `getSessionQRCode()` (valida tenant, delega ao `SessionManager` via
   * Registry). `undefined` é uma resposta válida (contato sem foto, sessão
   * sem conexão viva, privacidade) — nunca lança por ausência de foto, só
   * por tenant inexistente (`assertTenantExists`).
   */
  async getContactAvatarUrl(
    tenantId: string,
    sessionName: string,
    contactJid: string,
  ): Promise<string | undefined> {
    await this.assertTenantExists(tenantId);
    const sessionManager = this.registry.getOrCreate(tenantId, sessionName);
    return sessionManager.getProfilePictureUrl(contactJid);
  }

  async disconnectSession(
    tenantId: string,
    sessionName: string,
    actor: WhatsAppSessionActor = {},
    meta: WhatsAppSessionActionMeta = {},
  ): Promise<void> {
    await this.assertTenantExists(tenantId);
    await this.evictAndDisconnect(tenantId, sessionName);
    await this.audit(tenantId, actor.userId, 'session.disconnected_by_user', sessionName, meta);
  }

  /**
   * Orquestração de desconexão/evicção segura (Bloco 4), SEM auditoria —
   * extraída para ser reaproveitada por `disconnectSession` (público, audita)
   * e `removeSession` (audita `session.removed`, não `disconnected`, para não
   * emitir dois eventos por uma única remoção). Captura a geração ANTES de
   * desconectar: se uma reconexão concorrente acontecer entre o `disconnect()`
   * e a evicção, `evictIfCurrent()` detecta a divergência e NÃO remove a
   * instância (já reutilizada por outra chamada).
   */
  private async evictAndDisconnect(tenantId: string, sessionName: string): Promise<void> {
    const sessionManager = this.registry.getOrCreate(tenantId, sessionName);
    const generation = sessionManager.getGeneration();
    await sessionManager.disconnect();
    this.registry.evictIfCurrent(tenantId, sessionName, generation);
  }

  /**
   * Remove definitivamente uma sessão (M2, Fase 1) — distinta de
   * `disconnectSession()`: desconectar mantém o registro (permite reconectar
   * depois); remover apaga o registro e as credenciais associadas, como se a
   * sessão nunca tivesse existido. Reaproveita `disconnectSession()` (não
   * duplica a orquestração de desconexão/evicção segura) e só ACRESCENTA os
   * dois passos de limpeza que a remoção exige.
   *
   * Ordem deliberada: desconectar+evictar primeiro (garante que nenhum
   * socket/timer de reconexão fique tentando reviver uma sessão que está
   * prestes a deixar de existir), depois limpar credenciais, depois apagar o
   * registro — se qualquer passo intermediário falhar, o pior cenário é uma
   * sessão desconectada com credenciais/registro ainda presentes (estado
   * seguro e consistente para tentar de novo), nunca um registro apagado com
   * uma conexão ainda viva por trás dele.
   *
   * Idempotente por construção: `disconnectSession()` já é idempotente,
   * `CredentialsStore.clear()` e `deleteByTenantAndSessionName()` também são
   * (ver suas respectivas docstrings) — chamar `removeSession()` duas vezes
   * para a mesma sessão nunca lança na segunda vez.
   */
  async removeSession(
    tenantId: string,
    sessionName: string,
    actor: WhatsAppSessionActor = {},
    meta: WhatsAppSessionActionMeta = {},
  ): Promise<void> {
    await this.assertTenantExists(tenantId);
    await this.evictAndDisconnect(tenantId, sessionName);

    const namespace = buildWhatsAppCredentialsNamespace(sessionName);
    await this.credentialsStore.clear(tenantId, namespace);

    await this.sessionRepository.deleteByTenantAndSessionName(tenantId, sessionName);

    await this.audit(tenantId, actor.userId, 'session.removed', sessionName, meta);
    this.logger.info('Sessão do WhatsApp removida definitivamente', { tenantId, sessionName });
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de sessão do WhatsApp recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }

  private async audit(
    tenantId: string,
    actorUserId: string | undefined,
    action: string,
    sessionName: string,
    meta: WhatsAppSessionActionMeta,
  ): Promise<void> {
    await this.auditLogRepository.record({
      tenantId,
      actorUserId,
      action,
      targetType: 'whatsapp_session',
      targetId: sessionName,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
