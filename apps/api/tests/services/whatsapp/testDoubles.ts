import { WhatsAppSessionRepository } from '../../../src/services/whatsapp/domain/repositories/WhatsAppSessionRepository';
import { WhatsAppSession } from '../../../src/services/whatsapp/domain/entities/WhatsAppSession';
import { WhatsAppSessionEvent } from '../../../src/services/whatsapp/domain/entities/WhatsAppSessionEvent';
import { WhatsAppSessionEventRepository } from '../../../src/services/whatsapp/domain/repositories/WhatsAppSessionEventRepository';
import { CredentialsStore } from '../../../src/shared/security/domain/CredentialsStore';
import { MessageReceivedHandler, InboundWhatsAppMessage } from '../../../src/services/whatsapp/domain/handlers/MessageReceivedHandler';

/**
 * Fake compartilhado do `WhatsAppSessionRepository` — em memória, sem Prisma/
 * Postgres. Extraído no Bloco 6 (Item 5) para eliminar a duplicação
 * deliberada entre `SessionManager.test.ts` e `WhatsAppConnectionRegistry.test.ts`.
 * Único ponto de manutenção deste Fake a partir de agora.
 */
export class FakeWhatsAppSessionRepository implements WhatsAppSessionRepository {
  private sessions = new Map<string, WhatsAppSession>();

  /** Helper de teste: força o próximo update() a rejeitar, uma única vez. */
  public failNextUpdate = false;

  /**
   * Helper de teste (P6, ver DECISIONS.md ADR #25): se definido, o próximo
   * `upsertByTenantAndSessionName()` ignora sua lógica normal e retorna este
   * valor diretamente — simula outra chamada concorrente de `init()` que já
   * venceu a corrida no banco.
   */
  public forcedUpsertResult: WhatsAppSession | undefined;

  async update(id: string, data: Partial<WhatsAppSession>): Promise<void> {
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      throw new Error('Falha simulada de persistência');
    }
    const existing = this.sessions.get(id);
    if (!existing) return;
    this.sessions.set(id, { ...existing, ...data });
  }

  async findById(id: string): Promise<WhatsAppSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async findByTenantAndSessionName(tenantId: string, sessionName: string): Promise<WhatsAppSession | null> {
    return (
      Array.from(this.sessions.values()).find((s) => s.tenantId === tenantId && s.sessionName === sessionName) ?? null
    );
  }

  /** M2, Fase 1 — espelha `PrismaWhatsAppSessionRepository.findAllByTenant()`: filtra por tenant, ordena por `sessionName` (mesmo contrato do `orderBy` do Prisma). */
  async findAllByTenant(tenantId: string): Promise<WhatsAppSession[]> {
    return Array.from(this.sessions.values())
      .filter((s) => s.tenantId === tenantId)
      .sort((a, b) => a.sessionName.localeCompare(b.sessionName));
  }

  /** M2, Fase 1 — idempotente (espelha `deleteMany` no Prisma real): não lança se a sessão não existir. */
  async deleteByTenantAndSessionName(tenantId: string, sessionName: string): Promise<void> {
    const existing = await this.findByTenantAndSessionName(tenantId, sessionName);
    if (existing) {
      this.sessions.delete(existing.id);
    }
  }

  async upsertByTenantAndSessionName(
    tenantId: string,
    sessionName: string,
    create: WhatsAppSession,
    update: Partial<WhatsAppSession>,
  ): Promise<WhatsAppSession> {
    if (this.forcedUpsertResult) {
      const result = this.forcedUpsertResult;
      this.sessions.set(result.id, result);
      return result;
    }

    const existing = await this.findByTenantAndSessionName(tenantId, sessionName);
    if (existing) {
      await this.update(existing.id, update);
      return (await this.findById(existing.id)) as WhatsAppSession;
    }
    this.sessions.set(create.id, create);
    return create;
  }

  /** Helper de teste, não faz parte da interface de produção. */
  seed(session: WhatsAppSession): void {
    this.sessions.set(session.id, session);
  }
}

/**
 * Fake compartilhado do `CredentialsStore` (M2, Fase 1) — em memória, sem
 * Prisma/cifra real. Extraído aqui (em vez de duplicado localmente, como em
 * `BaileysProviderFactory.test.ts`) porque `WhatsAppSessionService.test.ts`
 * precisa, além do comportamento básico, inspecionar as chamadas de
 * `clear()` (asserção de que `removeSession()` limpa o namespace certo) —
 * um Fake com rastreamento de chamadas, não só um stub mudo.
 */
export class FakeCredentialsStore implements CredentialsStore {
  private store = new Map<string, Record<string, string>>();

  /** Chamadas registradas a `clear()`, na ordem em que ocorreram. */
  public clearCalls: Array<{ tenantId: string; namespace: string }> = [];

  private key(tenantId: string, namespace: string): string {
    return `${tenantId}:${namespace}`;
  }

  async get(tenantId: string, namespace: string, key: string): Promise<string | null> {
    return this.store.get(this.key(tenantId, namespace))?.[key] ?? null;
  }

  async getAll(tenantId: string, namespace: string): Promise<Record<string, string>> {
    return { ...(this.store.get(this.key(tenantId, namespace)) ?? {}) };
  }

  async set(tenantId: string, namespace: string, key: string, value: string): Promise<void> {
    const k = this.key(tenantId, namespace);
    const existing = this.store.get(k) ?? {};
    existing[key] = value;
    this.store.set(k, existing);
  }

  async remove(tenantId: string, namespace: string, key: string): Promise<void> {
    const k = this.key(tenantId, namespace);
    const existing = this.store.get(k);
    if (existing) delete existing[key];
  }

  async clear(tenantId: string, namespace: string): Promise<void> {
    this.clearCalls.push({ tenantId, namespace });
    this.store.delete(this.key(tenantId, namespace));
  }

  /** Helper de teste, não faz parte da interface de produção. */
  seed(tenantId: string, namespace: string, key: string, value: string): void {
    const k = this.key(tenantId, namespace);
    const existing = this.store.get(k) ?? {};
    existing[key] = value;
    this.store.set(k, existing);
  }
}

/**
 * Fake compartilhado do `WhatsAppSessionEventRepository` (M2, Fase 2) — em
 * memória, sem Prisma. `append()` gera um `id` sequencial simples (não
 * precisa ser um UUID de verdade para os testes) e preserva a ordem de
 * inserção; `listRecentByTenantAndSessionName()` devolve do mais novo para
 * o mais antigo, espelhando `orderBy: { occurredAt: 'desc' }` do Prisma
 * real.
 */
export class FakeWhatsAppSessionEventRepository implements WhatsAppSessionEventRepository {
  private events: WhatsAppSessionEvent[] = [];
  private nextId = 1;

  async append(event: Omit<WhatsAppSessionEvent, 'id'>): Promise<void> {
    this.events.push({ ...event, id: `event-${this.nextId++}` });
  }

  async listRecentByTenantAndSessionName(tenantId: string, sessionName: string, limit: number): Promise<WhatsAppSessionEvent[]> {
    return this.events
      .filter((e) => e.tenantId === tenantId && e.sessionName === sessionName)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit);
  }

  /** Helper de teste, não faz parte da interface de produção. */
  getAll(): ReadonlyArray<WhatsAppSessionEvent> {
    return this.events;
  }
}

/**
 * Fake compartilhado do `MessageReceivedHandler` (Milestone 3, Bloco 1) — em
 * memória, sem `services/conversations/` real (que só chega no Bloco 2).
 * Grava cada mensagem recebida, na ordem; `failNextHandle` simula uma falha
 * do handler (ex.: erro de persistência do futuro `MessageIngestionService`)
 * para provar que `SessionManager` a loga sem deixar propagar.
 */
export class FakeMessageReceivedHandler implements MessageReceivedHandler {
  private messages: InboundWhatsAppMessage[] = [];

  /** Helper de teste: força a próxima chamada a `handle()` a rejeitar, uma única vez. */
  public failNextHandle = false;

  async handle(message: InboundWhatsAppMessage): Promise<void> {
    if (this.failNextHandle) {
      this.failNextHandle = false;
      throw new Error('Falha simulada no MessageReceivedHandler');
    }
    this.messages.push(message);
  }

  /** Helper de teste, não faz parte da interface de produção. */
  getAll(): ReadonlyArray<InboundWhatsAppMessage> {
    return this.messages;
  }
}
