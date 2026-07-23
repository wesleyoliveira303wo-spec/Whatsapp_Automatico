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
   * (`createdAt` DESC, com `id` DESC como desempate — necessário para que o
   * cursor produza uma ordem determinística mesmo quando duas conversas têm
   * o mesmo `createdAt`): mais recente primeiro, mesma convenção de
   * "recente primeiro" já usada em todo `listRecentBy*`/`getSessionHistory`
   * deste projeto.
   *
   * `options.status`, se informado, filtra por `bot`/`human` — suporta uma
   * futura tela de "conversas assumidas por humano" (Bloco 6) sem precisar
   * reabrir este contrato.
   */
  findAllByTenant(tenantId: string, options: FindAllByTenantOptions): Promise<ConversationPage>;
}
