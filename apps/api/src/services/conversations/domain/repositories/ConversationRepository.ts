import { Conversation } from '../entities/Conversation';

/**
 * Opções de listagem paginada de `findAllByTenant` — Milestone 3, Bloco 5
 * (D11 do levantamento arquitetural: primeira decisão de paginação real do
 * projeto). `limit` é OBRIGATÓRIO aqui (nunca opcional no port) — quem aplica
 * o default/teto (`DEFAULT_LIST_LIMIT`/`MAX_LIST_LIMIT`) é a Application
 * (`ConversationsService`), mesmo padrão já usado por
 * `WhatsAppSessionService.getSessionHistory()`. `cursor` é o `id` da última
 * `Conversation` da página anterior (paginação por cursor, não por offset —
 * evita o problema de "deslocamento" quando linhas são inseridas entre
 * páginas, relevante aqui porque `Conversation` não tem teto natural de
 * volume, diferente de `WhatsAppSession`).
 */
export interface FindAllByTenantOptions {
  status?: Conversation['status'];
  limit: number;
  cursor?: string;
  /**
   * Milestone 6, Bloco M6H-2 — filtra pela sessão de WhatsApp específica
   * (`WhatsAppConversation.sessionName`, já existe no schema desde o Bloco 2
   * — sem migration). Ausente = todas as sessões do tenant (comportamento
   * anterior, ainda usado por nada hoje — todas as telas passaram a viver
   * dentro de uma sessão na Milestone 6, ADR #74).
   */
  sessionName?: string;
  /**
   * Reforma do escalonamento (2026-07-25) — quando `true`, filtra só
   * conversas com `escalatedAt` definido (a IA pediu ajuda humana e ninguém
   * assumiu ainda), independentemente de `status` (que agora continua
   * `'bot'` nesse caso — ver `Conversation.escalatedAt`). Substitui, para
   * este fim, o antigo filtro `status: 'human'` + `!assignedToUserId` no
   * cliente (`useWaitingForHuman`) — que parava de funcionar com a IA não
   * mudando mais `status` ao escalar. Combinável com `status`/`sessionName`
   * (todos os filtros se combinam com E).
   */
  needsHumanAttention?: boolean;
  /**
   * ADR #94 (2026-08-01) — quando `false` (default de todo consumidor
   * comercial: board Kanban, Analytics), filtra fora as conversas com
   * `excludedFromPipeline: true`. Ausente/`undefined` = sem filtro (usado
   * pela listagem geral da inbox, que deve continuar mostrando TODAS as
   * conversas, incluindo as marcadas — só o Pipeline/Analytics as escondem).
   */
  excludedFromPipeline?: boolean;
  /**
   * Menu "⋮" da conversa (2026-08-29) — quando `false` (default do
   * consumidor padrão, a inbox geral), filtra fora as conversas com
   * `archived: true`. `true` = só as arquivadas (aba "Arquivadas").
   * Diferente de `excludedFromPipeline` (que é opt-in/sem filtro por
   * padrão): aqui o CHAMADOR (`ConversationsService.listConversations`)
   * sempre passa um valor explícito, nunca `undefined` — não existe hoje
   * nenhum consumidor que precise ver arquivadas e não-arquivadas juntas
   * numa mesma lista.
   */
  archived: boolean;
}

/** Página de resultado de `findAllByTenant` — `nextCursor` ausente indica que não há próxima página. */
export interface ConversationPage {
  conversations: Conversation[];
  nextCursor?: string;
}

/**
 * Opções de mudança de dono junto com a mudança de status (Milestone 5, Bloco
 * M5D — ownership, D57). `assignedToUserId`:
 * - `string` → define o dono (ex.: `escalate` grava quem assumiu);
 * - `null` → limpa o dono (ex.: `resume` devolve ao bot);
 * - ausente/`undefined` → NÃO altera o dono (retrocompatível: chamadores
 *   antigos que passam só 3 argumentos continuam mudando só o status).
 */
export interface UpdateConversationStatusOptions {
  assignedToUserId?: string | null;
  /**
   * Reforma do escalonamento (2026-07-25) — mesmo padrão de
   * `assignedToUserId` (`null` limpa, ausente não mexe), mas só `null` é um
   * valor válido aqui: quem PÕE `escalatedAt` é sempre
   * `flagNeedsHumanAttention` (a IA), nunca `updateStatus` — este método só
   * precisa saber LIMPAR o campo quando um humano assume/devolve a
   * conversa (`ConversationsService.escalateConversation`/`resumeConversation`).
   */
  escalatedAt?: null;
}

/**
 * Porta (port) de persistência de `Conversation` — Milestone 3, Bloco 2
 * (`upsertByTenantSessionAndContact`) + Bloco 4 (`findById`, aditivo) +
 * Bloco 5 (`updateStatus`/`findAllByTenant`, aditivos).
 */
export interface ConversationRepository {
  /**
   * Cria a conversa lógica de (`tenantId`, `sessionName`, `contactJid`) se
   * ainda não existir, ou devolve a existente — operação atômica no nível do
   * banco (implementações reais devem usar um `upsert` real, mesmo racional
   * já aplicado a `WhatsAppSessionRepository.upsertByTenantAndSessionName`,
   * ver ADR #25/P6).
   *
   * Sem essa atomicidade, duas mensagens do mesmo contato chegando quase ao
   * mesmo tempo (perfeitamente plausível no WhatsApp) poderiam colidir na
   * constraint de unicidade (`@@unique([tenantId, sessionName, contactJid])`)
   * entre a leitura e a escrita — a mesma classe de bug (TOCTOU) já corrigida
   * uma vez neste projeto.
   *
   * Diferente de `WhatsAppSessionRepository.upsertByTenantAndSessionName`,
   * não recebe um `update: Partial<Conversation>` separado: nenhum campo de
   * negócio muda quando a conversa já existe e uma nova mensagem chega (só
   * `updatedAt`, atualizado implicitamente pela implementação real via
   * `@updatedAt` do Prisma) — mudar `status` é uma operação distinta,
   * própria do Bloco 5 (escalonamento), não deste método.
   *
   * Retorna a conversa resultante (id definitivo — pode não ser o mesmo `id`
   * sugerido em `create`, se outra chamada concorrente já tiver inserido a
   * linha primeiro). Chamadores devem sempre usar o `id` do retorno.
   */
  upsertByTenantSessionAndContact(
    tenantId: string,
    sessionName: string,
    contactJid: string,
    create: Conversation,
  ): Promise<Conversation>;

  /**
   * Busca uma conversa pelo `id` — Milestone 3, Bloco 4 (gap aditivo
   * encontrado no levantamento arquitetural pré-Bloco 4: o worker de IA
   * precisa RE-CHECAR `shouldAutoRespond()` no momento de processar o job
   * `ai-reply`, não só no momento em que `MessageIngestionService` o
   * agendou — ver `MILESTONE_003_AI_AUTORESPONDER.md` §5, risco "Job na
   * fila processado depois que a conversa já foi escalonada", e §6,
   * critério de aceite correspondente. Sem este método não havia como
   * buscar a `Conversation` de novo a partir de só um `conversationId`.
   *
   * Devolve `undefined` (não lança) se não existir — mesmo padrão já usado
   * por `WhatsAppSessionRepository.findByTenantAndSessionName` (que devolve
   * `null`; aqui `undefined` para acompanhar o resto deste bounded context,
   * ex.: `AiInteraction.messageId?`). Quem chama decide o que fazer com a
   * ausência (o worker do Bloco 4 trata como "não processar", não como
   * erro — uma conversa pode ter sido legitimamente removida entre o
   * agendamento e o processamento).
   */
  findById(id: string): Promise<Conversation | undefined>;

  /**
   * Busca a conversa de UM contato numa sessão específica — Fase L, Bloco L4.
   * Único consumidor: `WhatsAppCampaignMessageSender` (implementação real do
   * port `CampaignMessageSender`, `services/campaigns/domain`), que precisa
   * do `contactJid` REAL da conversa já existente para enviar uma mensagem
   * de campanha — nunca reconstruído a partir de `phoneE164` (identidade
   * ≠ endereço de envio, ver docstring de `normalizePhoneToE164`: mandar
   * para a forma canônica poderia entregar a outro número). `undefined` se
   * este contato nunca teve conversa nesta sessão — é exatamente esse o
   * sinal que a Fase L usa para recusar enviar campanha a quem não tem
   * histórico real ali (reengajamento, não lista fria).
   */
  findByContactAndSession(
    tenantId: string,
    sessionName: string,
    contactId: string,
  ): Promise<Conversation | undefined>;

  /**
   * Muda `status` de uma conversa existente (Milestone 3, Bloco 5 — suporta
   * `POST .../conversations/:id/escalate` e `.../resume`, D10 do levantamento
   * arquitetural: um único método genérico por valor de enum, em vez de dois
   * métodos dedicados `escalateConversation()`/`resumeConversation()` —
   * evita duplicar a mesma lógica de "achar por id+tenantId, atualizar,
   * devolver" por uma diferença de um valor).
   *
   * `tenantId` explícito por defesa em profundidade (mesmo racional de
   * `upsertByTenantSessionAndContact`/`findAllByTenant`): a implementação
   * real filtra por AMBOS (`id` E `tenantId`), nunca confia só no `id` vindo
   * de fora para decidir se o chamador tem permissão de alterar aquela
   * conversa.
   *
   * Idempotente por construção: chamar com um `status` igual ao atual apenas
   * reafirma o estado (não é erro). Devolve `undefined` (não lança) se a
   * conversa não existir OU não pertencer a `tenantId` — mesmo padrão de
   * `findById`; quem chama decide o que fazer com a ausência (o Application
   * Service lança `ConversationNotFoundError`).
   */
  updateStatus(
    tenantId: string,
    conversationId: string,
    status: Conversation['status'],
    options?: UpdateConversationStatusOptions,
  ): Promise<Conversation | undefined>;

  /**
   * Lista as conversas de um tenant, paginada por cursor (Milestone 3, Bloco
   * 5 — D11: suporta `GET .../conversations`). Ordenação fixa e estável
   * (`updatedAt` DESC, com `id` DESC como desempate — necessário para que o
   * cursor produza uma ordem determinística mesmo quando duas conversas têm
   * o mesmo `updatedAt`): mais recente ATIVIDADE primeiro (não mais criação —
   * ver decisão de 2026-07-25 abaixo), mesma convenção de "recente primeiro"
   * já usada em todo `listRecentBy*`/`getSessionHistory` deste projeto.
   *
   * Ordenação por `updatedAt` (não `createdAt`) desde 2026-07-25 — pedido do
   * fundador: a inbox deve funcionar como WhatsApp/Telegram, com a conversa
   * de atividade mais recente no topo (mensagem nova, escalada, mudança de
   * status), não fixada pela ordem de criação. Nenhuma migration necessária:
   * `updatedAt` já é `@updatedAt` no schema e já é tocado em todo
   * `upsertByTenantSessionAndContact` (mensagem nova)/`updateStatus`/
   * `flagNeedsHumanAttention` — só a leitura mudou de campo.
   *
   * `options.status`, se informado, filtra por `bot`/`human` — suporta uma
   * futura tela de "conversas assumidas por humano" (Bloco 6) sem precisar
   * reabrir este contrato.
   */
  findAllByTenant(tenantId: string, options: FindAllByTenantOptions): Promise<ConversationPage>;

  /**
   * Marca que a IA pediu atenção humana AGORA (reforma do escalonamento,
   * 2026-07-25) — grava `escalatedAt = at`, sem tocar `status` nem
   * `assignedToUserId`. Chamado tanto na primeira escalada de uma conversa
   * quanto em escaladas REPETIDAS (a conversa já estava sinalizada, mas o
   * cliente mandou outra mensagem que a IA também não soube responder) —
   * sempre reescreve o timestamp, nunca é um no-op na segunda chamada, para
   * sustentar um novo alerta na Dashboard a cada pedido de ajuda (não só no
   * primeiro). Único ponto de escrita deste campo para `Date` — a limpeza
   * (`null`) é responsabilidade de `updateStatus` (ver
   * `UpdateConversationStatusOptions.escalatedAt`).
   *
   * `tenantId` explícito por defesa em profundidade, mesmo racional de
   * `updateStatus`. Devolve `undefined` (não lança) se a conversa não
   * existir ou não pertencer a `tenantId`.
   */
  flagNeedsHumanAttention(
    tenantId: string,
    conversationId: string,
    at: Date,
  ): Promise<Conversation | undefined>;

  /**
   * Incrementa `unreadCount` em +1 (indicador de não lidas, 2026-07-25) —
   * chamado por `MessageIngestionService` a cada mensagem INBOUND persistida.
   * Operação atômica no nível do banco (implementações reais devem usar
   * `increment`, nunca ler-modificar-escrever — duas mensagens quase
   * simultâneas do mesmo contato não podem perder um incremento por corrida).
   * `tenantId` explícito por defesa em profundidade, mesmo racional dos
   * demais métodos deste port. Silenciosamente não-op (não lança) se a
   * conversa não existir/não pertencer ao tenant — mesmo espírito de
   * `updateMany` com `count === 0` já usado em `updateStatus`/
   * `flagNeedsHumanAttention`; quem chama (`MessageIngestionService`) já
   * trata esta chamada como auxiliar/resiliente.
   */
  incrementUnreadCount(tenantId: string, conversationId: string): Promise<void>;

  /**
   * Liga a conversa a uma identidade de contato (Fase L, Bloco L1) — chamado
   * por `MessageIngestionService` depois de resolver o telefone do `contactJid`.
   *
   * SÓ PREENCHE, NUNCA SOBRESCREVE: implementações devem incluir
   * `contactId: null` no critério de busca, de modo que uma conversa já
   * vinculada permaneça intocada. Isso torna a chamada idempotente (roda a
   * cada mensagem sem custo depois da primeira) e, mais importante, impede
   * que uma reconciliação futura de identidade seja desfeita silenciosamente
   * por uma mensagem nova.
   *
   * Silenciosamente não-op (não lança) se a conversa não existir, não
   * pertencer ao tenant, ou já estiver vinculada — mesmo espírito de
   * `incrementUnreadCount`, e pelo mesmo motivo: quem chama trata o vínculo
   * como auxiliar, jamais como pré-condição para a mensagem ser recebida.
   */
  linkContact(tenantId: string, conversationId: string, contactId: string): Promise<void>;

  /**
   * Zera `unreadCount` (indicador de não lidas, 2026-07-25) — chamado por
   * `ConversationsService.markAsRead()` quando um operador abre a conversa
   * pela Dashboard (`POST .../conversations/:id/read`). Idempotente: marcar
   * como lida uma conversa já com `unreadCount === 0` não é erro. Devolve a
   * `Conversation` atualizada, ou `undefined` (não lança) se não existir/não
   * pertencer ao tenant — mesmo padrão de `updateStatus`/
   * `flagNeedsHumanAttention`.
   */
  markAsRead(tenantId: string, conversationId: string): Promise<Conversation | undefined>;

  /**
   * Menu "⋮" da conversa (2026-08-29) — marca manualmente como não lida
   * (`unreadCount: 1`, suficiente para o indicador visual acender; não é
   * uma contagem real de mensagens não vistas, é uma marcação do operador
   * — mesmo espírito de "marcar e-mail como não lido"). `undefined` se a
   * conversa não existir/não pertencer ao tenant.
   */
  markAsUnread(tenantId: string, conversationId: string): Promise<Conversation | undefined>;

  /**
   * Grava `stage`/`stageSetBy`/`stageUpdatedAt` de uma conversa — pipeline
   * de CRM (Milestone 6, Bloco M6H-5, 2026-07-30). Usado tanto por ação
   * humana explícita (`ConversationsService.updateStage`, sempre permitida,
   * `setBy: 'human'`) quanto pela IA (`AiReplyJobProcessor`, só quando a
   * policy `shouldAiUpdateStage` permitir, `setBy: 'ai'`) — a decisão de SE
   * a escrita deve acontecer é responsabilidade de quem chama, não deste
   * método (mesma separação já usada entre `flagNeedsHumanAttention` e
   * quem decide escalar).
   *
   * `stageUpdatedAt` é sempre `now()` no momento da escrita (implementação
   * real usa a hora do servidor de banco, não recebe a data como parâmetro —
   * diferente de `flagNeedsHumanAttention`, que recebe `at` explícito por já
   * ter esse precedente; aqui não há necessidade de controlar o timestamp
   * de fora).
   *
   * `tenantId` explícito por defesa em profundidade, mesmo racional dos
   * demais métodos deste port. Devolve `undefined` (não lança) se a
   * conversa não existir/não pertencer ao tenant.
   */
  updateStage(
    tenantId: string,
    conversationId: string,
    stage: Conversation['stage'],
    setBy: Conversation['stageSetBy'],
  ): Promise<Conversation | undefined>;

  /**
   * Grava `excludedFromPipeline` (ADR #94, 2026-08-01) — marca/desmarca uma
   * conversa como fora do funil comercial. Sempre uma ação humana explícita
   * (`ConversationsService.setExcludedFromPipeline`); a IA nunca chama este
   * método. `tenantId` explícito por defesa em profundidade, mesmo racional
   * dos demais métodos deste port. Devolve `undefined` (não lança) se a
   * conversa não existir/não pertencer ao tenant.
   */
  setExcludedFromPipeline(
    tenantId: string,
    conversationId: string,
    excluded: boolean,
  ): Promise<Conversation | undefined>;

  /**
   * Menu "⋮" da conversa (2026-08-29) — grava `archived`/`archivedAt` juntos
   * (`true` + `now()`, ou `false` + `null`). `undefined` se a conversa não
   * existir/não pertencer ao tenant.
   */
  setArchived(
    tenantId: string,
    conversationId: string,
    archived: boolean,
  ): Promise<Conversation | undefined>;

  /**
   * Menu "⋮" da conversa (2026-08-29) — remove a conversa DEFINITIVAMENTE.
   * `WhatsAppMessage`/`WhatsAppConversationTag` vinculadas somem junto via
   * `onDelete: Cascade` já existente no schema. `CampaignRecipient.conversationId`
   * (sem FK, acoplamento fraco de propósito) fica como referência solta —
   * aceitável, mesmo padrão já documentado ali. Devolve `true` se algo foi
   * apagado, `false` se a conversa não existia/não pertencia ao tenant.
   */
  deleteById(tenantId: string, conversationId: string): Promise<boolean>;

  /**
   * Grava o resumo da conversa gerado pela IA (Redesign 2026-08-05, R5) —
   * `aiSummary`/`aiSummaryMessageCount`/`aiSummaryUpdatedAt` (este último
   * sempre `now()` no momento da escrita, mesmo racional de `updateStage`).
   * Chamado só por `ConversationSummaryService` (`services/ai`), nunca
   * automaticamente — geração é sempre sob demanda (botão). `tenantId`
   * explícito por defesa em profundidade, mesmo racional dos demais métodos
   * deste port. Devolve `undefined` (não lança) se a conversa não
   * existir/não pertencer ao tenant.
   */
  updateAiSummary(
    tenantId: string,
    conversationId: string,
    summary: string,
    messageCount: number,
  ): Promise<Conversation | undefined>;
}
