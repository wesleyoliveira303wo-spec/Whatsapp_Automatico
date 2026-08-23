import {
  Campaign,
  CampaignRecipient,
  CampaignRecipientSummary,
  CampaignStatus,
  CampaignMetrics,
  CampaignSessionOverview,
  CampaignMediaContentType,
} from '../entities/Campaign';
import { RecipientEligibility } from '../policies/determineSkipReason';
import { CampaignSendOutcome } from '../policies/shouldTripCircuitBreaker';

/** Dados para criar a campanha (sempre `DRAFT` — este bloco não agenda/inicia envio). */
export interface CreateCampaignData {
  tenantId: string;
  sessionName: string;
  name: string;
  description?: string;
  messageTemplate: string;
  createdByUserId?: string;
}

/**
 * Uma linha pronta para inserção em lote — já com o motivo de supressão
 * decidido pelo Domain. Sempre `contactId` OU `phoneE164` (nunca os dois,
 * nunca nenhum) — ver docstring de `CampaignRecipient`.
 */
export interface CampaignRecipientDraft {
  contactId?: string;
  phoneE164?: string;
  name?: string;
  status: 'pending' | 'skipped';
  skipReason?: string;
}

/** Paginação por cursor — mesmo padrão de `ContactPage`/`AuditLogPage`. */
export interface ListCampaignsOptions {
  limit: number;
  cursor?: string;
  /** Aditivo (2026-08-18) — filtra pelo lado do SERVIDOR (a tela de Campanhas é sempre de UMA sessão). */
  sessionName?: string;
}

export interface CampaignPage {
  campaigns: Campaign[];
  nextCursor?: string;
}

export interface ListCampaignRecipientsOptions {
  limit: number;
  cursor?: string;
  /** Filtra por status — usado pela UI para separar "elegíveis" de "suprimidos" na tela de detalhe. */
  status?: 'pending' | 'sent' | 'failed' | 'skipped' | 'replied';
}

export interface CampaignRecipientPage {
  recipients: CampaignRecipient[];
  nextCursor?: string;
}

/**
 * Porta (port) de persistência de campanhas — Fase L, Bloco L3.
 *
 * `fetchEligibility` é o único método que olha PARA FORA do próprio bounded
 * context (`whatsapp_contacts`/`whatsapp_conversations`/`campaign_recipients`
 * de outras campanhas) — mesmo racional já usado por `PrismaAnalyticsRepository`
 * (M6H-4/F1.6): é uma consulta de LEITURA que cruza tabelas para produzir um
 * relatório, não uma dependência de escrita entre domínios. Um port dedicado
 * (`ContactResolver`-style) seria mais "puro", mas replicaria a mesma
 * consulta em três interfaces estreitas só para evitar um JOIN — YAGNI dado
 * que nenhum outro contexto precisa desta leitura.
 */
export interface CampaignRepository {
  create(data: CreateCampaignData): Promise<Campaign>;

  findById(tenantId: string, campaignId: string): Promise<Campaign | undefined>;

  listByTenant(tenantId: string, options: ListCampaignsOptions): Promise<CampaignPage>;

  /**
   * Para cada `contactId` informado, resolve a elegibilidade (opt-out,
   * conversa ativa com humano, contato recente por outra campanha) — ver
   * `RecipientEligibility`. Contatos que não existem/não pertencem ao tenant
   * simplesmente não aparecem no mapa devolvido (o chamador decide o que
   * fazer com um id desconhecido).
   *
   * `sessionName` (2026-08-20, correção pós-L5): "conversa ativa com humano"
   * e "contatado recentemente" são checados só DENTRO desta sessão, não em
   * qualquer WhatsApp do tenant — mesmo racional já usado por toda a
   * navegação do produto desde a M6H-1 ("cada WhatsApp é uma empresa
   * independente"). Alguém sendo atendido por um humano no WhatsApp A não
   * deveria bloquear uma campanha no WhatsApp B — são relações distintas.
   */
  fetchEligibility(
    tenantId: string,
    sessionName: string,
    contactIds: string[],
  ): Promise<Map<string, RecipientEligibility>>;

  /**
   * Insere os destinatários calculados em lote. `skipDuplicates: true`
   * (apoiado no `@@unique([campaignId, contactId])`) torna uma segunda
   * chamada para a MESMA campanha um no-op para quem já existe — a
   * materialização nunca duplica.
   */
  createRecipients(
    tenantId: string,
    campaignId: string,
    recipients: CampaignRecipientDraft[],
  ): Promise<void>;

  /** Contagens por status/motivo — o "63 de 100, eis os motivos" da tela de detalhe. */
  summarizeRecipients(tenantId: string, campaignId: string): Promise<CampaignRecipientSummary>;

  /**
   * Lista destinatários, paginado — a tela de detalhe da campanha
   * (`GET .../campaigns/:id/recipients`).
   *
   * Padronização de exibição de contato (2026-08-20): implementações devem
   * resolver `CampaignRecipient.contact` (nome salvo + telefone + apelido do
   * WhatsApp) EM LOTE para a página inteira — nunca uma consulta por linha —
   * para todo destinatário com `contactId` definido. Sem isso, a UI não tem
   * como identificar quem é um destinatário vinculado a um Contato salvo sem
   * nome ainda (o bug original: mostrava o `contactId`, um UUID cru).
   */
  listRecipients(
    tenantId: string,
    campaignId: string,
    options: ListCampaignRecipientsOptions,
  ): Promise<CampaignRecipientPage>;

  // --- Fase L, Bloco L4 (motor de envio) ---

  /** Busca UM destinatário pelo id, escopado ao tenant — usado pelo `CampaignSendJobProcessor` a cada job (camada 3 de idempotência: só envia se ainda `PENDING`). */
  findRecipientById(tenantId: string, recipientId: string): Promise<CampaignRecipient | undefined>;

  /** Todos os destinatários `PENDING` de uma campanha, na ordem em que foram materializados — a ordem que `computeSendDelayMs` usa para calcular `n`. */
  listPendingRecipients(tenantId: string, campaignId: string): Promise<CampaignRecipient[]>;

  /** Quantos destinatários `SENT` HOJE (dia corrente, horário do servidor) nesta campanha — o teto diário (`Campaign.dailyLimit`). */
  countSentToday(tenantId: string, campaignId: string): Promise<number>;

  /** Quantos destinatários ainda `PENDING` nesta campanha — usado para decidir se a campanha terminou (0 = `COMPLETED`). */
  countPending(tenantId: string, campaignId: string): Promise<number>;

  /** Marca um destinatário como enviado com sucesso — grava `sentAt`/`attemptedAt`/`conversationId`. */
  markRecipientSent(
    tenantId: string,
    recipientId: string,
    data: { attemptedAt: Date; conversationId: string },
  ): Promise<void>;

  /** Marca um destinatário como falho — grava `attemptedAt`/`errorMessage`, nunca `sentAt`. */
  markRecipientFailed(
    tenantId: string,
    recipientId: string,
    data: { attemptedAt: Date; errorMessage: string },
  ): Promise<void>;

  /**
   * Reabrir campanha (2026-08-18, pedido do fundador — não havia botão para
   * retomar uma campanha `completed`/`cancelled` com destinatários que
   * falharam por um problema transitório, ex.: a sessão do WhatsApp
   * reconectando bem na hora do envio). Devolve `FAILED` para `PENDING`
   * (limpa `errorMessage`), tornando-os candidatos de novo a
   * `listPendingRecipients`/`countPending`.
   *
   * NUNCA toca `SKIPPED` — quem foi suprimido na materialização (opt-out,
   * conversa ativa com humano, contatado recentemente por outra campanha)
   * continua suprimido; reabrir uma campanha não pode ser um jeito indireto
   * de burlar essas regras de segurança. Devolve quantos destinatários foram
   * resetados (para o Service decidir se há algo para agendar).
   */
  resetFailedRecipientsToPending(tenantId: string, campaignId: string): Promise<number>;

  /** As últimas `limit` tentativas (`SENT`/`FAILED`, ordenadas por `attemptedAt` DESC) desta campanha — alimenta `shouldTripCircuitBreaker`. */
  listRecentOutcomes(
    tenantId: string,
    campaignId: string,
    limit: number,
  ): Promise<CampaignSendOutcome[]>;

  /** Muda `Campaign.status` (e opcionalmente `pausedReason`, só relevante ao pausar). `undefined` se a campanha não existir/não pertencer ao tenant. */
  updateCampaignStatus(
    tenantId: string,
    campaignId: string,
    status: CampaignStatus,
    pausedReason?: string,
  ): Promise<Campaign | undefined>;

  /**
   * Remove a campanha definitivamente — retrofit visual 2026-08-18 (pedido
   * do fundador, menu "⋮" da lista). `CampaignRecipient.onDelete: Cascade`
   * cuida de apagar os destinatários junto, sem precisar de uma segunda
   * chamada. Devolve `true` se algo foi apagado, `false` se a campanha não
   * existia/não pertencia ao tenant (mesmo padrão de `ContactRepository.deleteById`).
   *
   * `CampaignService.deleteCampaign` é quem recusa apagar uma campanha
   * `running` (aqui o método só executa — a regra de negócio não mora no
   * repositório).
   */
  deleteById(tenantId: string, campaignId: string): Promise<boolean>;

  // --- Fase L, Bloco L6 (IA reconhece origem de campanha + marca resposta) ---

  /**
   * Marca `REPLIED` (+ `repliedAt`) em todo `CampaignRecipient` ainda `SENT`
   * cujo `conversationId` seja este — implementação de
   * `CampaignReplyTracker.markRepliedIfCampaignOrigin` (`services/conversations/domain`).
   * No-op se não houver nenhum `SENT` para essa conversa (não é origem de
   * campanha, ou já foi marcada antes).
   */
  markRepliedByConversationId(tenantId: string, conversationId: string): Promise<void>;

  /**
   * Para uma `conversationId`, devolve o texto que a campanha MAIS RECENTE
   * enviou primeiro (`Campaign.messageTemplate`), ou `undefined` se a
   * conversa nunca recebeu campanha nenhuma — implementação de
   * `CampaignOriginResolver.findOrigin` (`services/ai/domain`). Considera
   * `SENT` e `REPLIED` (uma conversa que já respondeu continua "de origem
   * de campanha" para efeito de contexto da IA).
   */
  findOriginByConversationId(
    tenantId: string,
    conversationId: string,
  ): Promise<{ messageSent: string } | undefined>;

  // --- Fase L, Bloco L7 (métricas) ---

  /**
   * Métricas de campanha (ver `CampaignMetrics`) — cruza
   * `campaign_recipients` (desta campanha) com `whatsapp_conversations`/
   * `ai_interactions` (das conversas VINCULADAS, via `conversationId`).
   * Mesmo racional de `fetchEligibility`: leitura de RELATÓRIO cruzando
   * tabelas, não dependência de escrita entre domínios (ver docstring do
   * port). `undefined` se a campanha não existir/não pertencer ao tenant.
   */
  getMetrics(tenantId: string, campaignId: string): Promise<CampaignMetrics | undefined>;

  // --- Retrofit visual 2026-08-18 (réplica de imagem) ---

  /**
   * Visão geral de campanhas de uma sessão — cards do topo + donut "Status
   * das campanhas". Ver docstring de `CampaignSessionOverview`.
   */
  getSessionOverview(tenantId: string, sessionName: string): Promise<CampaignSessionOverview>;

  // --- Fase L, Bloco L8 (mídia na campanha) ---

  /**
   * Anexa (ou SUBSTITUI, se já havia uma) mídia à campanha — grava as quatro
   * colunas de uma vez. A regra "só DRAFT pode ter mídia anexada/trocada" NÃO
   * mora aqui (mesmo racional já usado em `updateCampaignStatus`/
   * `deleteById`: regra de negócio fica no Service, o repositório só
   * executa). `undefined` se a campanha não existir/não pertencer ao tenant.
   */
  attachMedia(
    tenantId: string,
    campaignId: string,
    media: { contentType: CampaignMediaContentType; buffer: Buffer; mimeType: string; fileName?: string },
  ): Promise<Campaign | undefined>;

  /** Remove a mídia anexada (as quatro colunas voltam a `NULL`) — no-op silencioso se a campanha não tinha nenhuma. `undefined` se a campanha não existir/não pertencer ao tenant. */
  removeMedia(tenantId: string, campaignId: string): Promise<Campaign | undefined>;

  /**
   * Devolve o BINÁRIO da mídia anexada — usado por dois consumidores: a rota
   * de download (`GET .../campaigns/:id/media`, preview na Dashboard) e
   * `CampaignSendJobProcessor` (busca o binário a cada envio; ver docstring
   * do processor para o porquê disso ser aceitável neste volume). `undefined`
   * se a campanha não existir/não pertencer ao tenant OU não tiver mídia.
   */
  getMediaContent(
    tenantId: string,
    campaignId: string,
  ): Promise<
    | { contentType: CampaignMediaContentType; buffer: Buffer; mimeType: string; fileName?: string }
    | undefined
  >;
}
