import { AiFaqEntry } from '../entities/AiFaqEntry';

/** Campos que `update` pode alterar — todos opcionais (atualização parcial: ex. só o toggle `active`). */
export interface AiFaqEntryUpdateInput {
  question?: string;
  answer?: string;
  category?: string | null;
  active?: boolean;
}

/**
 * Porta (port) de persistência das FAQs estruturadas de UMA SESSÃO —
 * Cérebro da IA v3, Fase 2. Mesmo racional de `QuickReplyRepository`: várias
 * linhas por `(tenantId, sessionName)`, CRUD completo, IDOR-safe por
 * construção (`update`/`remove` devolvem `null`/`false` quando o `id` não
 * pertence àquele par, em vez de vazar/afetar dado de outra sessão/tenant).
 */
export interface AiFaqRepository {
  /** Lista TODAS as FAQs da sessão (ativas e inativas — tela de gestão), ordenadas por `createdAt` (mais antigas primeiro). */
  listBySession(tenantId: string, sessionName: string): Promise<AiFaqEntry[]>;

  /** Lista só as FAQs ATIVAS da sessão — usado pela injeção no prompt (`buildFaqContext`). */
  listActiveBySession(tenantId: string, sessionName: string): Promise<AiFaqEntry[]>;

  create(
    tenantId: string,
    sessionName: string,
    question: string,
    answer: string,
    category: string | null,
  ): Promise<AiFaqEntry>;

  /** `null` se o `id` não existir ou não pertencer a `(tenantId, sessionName)`. */
  update(
    tenantId: string,
    sessionName: string,
    id: string,
    input: AiFaqEntryUpdateInput,
  ): Promise<AiFaqEntry | null>;

  /** `false` se o `id` não existir ou não pertencer a `(tenantId, sessionName)`. */
  remove(tenantId: string, sessionName: string, id: string): Promise<boolean>;
}
