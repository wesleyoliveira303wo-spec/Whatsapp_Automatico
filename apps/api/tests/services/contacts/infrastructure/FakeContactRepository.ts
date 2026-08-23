import { Contact } from '../../../../src/services/contacts/domain/entities/Contact';
import {
  ContactPage,
  ContactRepository,
  ContactStats,
  CreateContactData,
  ListContactsOptions,
} from '../../../../src/services/contacts/domain/repositories/ContactRepository';
import { ContactPhoneAlreadyExistsError } from '../../../../src/services/contacts/domain/errors/ContactPhoneAlreadyExistsError';

const FIXED_NOW = new Date('2026-08-15T00:00:00.000Z');

/**
 * Fake em memória de `ContactRepository` (Fase L, Blocos L1/L1b) — mesmo
 * papel dos demais Fakes deste projeto: determinístico, sem banco.
 * Reproduz as duas garantias reais que os testes dependem: deduplicação por
 * `(tenantId, phoneE164)` e "só preenche, nunca sobrescreve" em
 * `findOrCreateByPhone`/`setNameIfMissing`.
 */
export class FakeContactRepository implements ContactRepository {
  private readonly rows = new Map<string, Contact>();
  /** Conversas por contactId — só o suficiente para `listByTenant`/`countStats` (retrofit 2026-08-16). */
  private readonly conversations = new Map<
    string,
    { id: string; sessionName: string; lastMessageAt?: Date }
  >();
  private nextId = 1;

  async findOrCreateByPhone(data: CreateContactData): Promise<Contact> {
    const existing = [...this.rows.values()].find(
      (row) => row.tenantId === data.tenantId && row.phoneE164 === data.phoneE164,
    );
    if (existing) {
      return existing;
    }
    const id = `contact-${this.nextId++}`;
    const contact: Contact = {
      id,
      tenantId: data.tenantId,
      phoneE164: data.phoneE164,
      name: data.name,
      source: data.source,
      createdAt: data.createdAt ?? FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    this.rows.set(id, contact);
    return contact;
  }

  async findByPhone(tenantId: string, phoneE164: string): Promise<Contact | undefined> {
    return [...this.rows.values()].find(
      (row) => row.tenantId === tenantId && row.phoneE164 === phoneE164,
    );
  }

  async findById(tenantId: string, contactId: string): Promise<Contact | undefined> {
    const row = this.rows.get(contactId);
    return row && row.tenantId === tenantId ? row : undefined;
  }

  async setNameIfMissing(tenantId: string, contactId: string, name: string): Promise<void> {
    const row = this.rows.get(contactId);
    if (!row || row.tenantId !== tenantId || row.name) {
      return;
    }
    this.rows.set(contactId, { ...row, name, updatedAt: FIXED_NOW });
  }

  async setOptOutAt(
    tenantId: string,
    contactId: string,
    at: Date | null,
  ): Promise<Contact | undefined> {
    const row = this.rows.get(contactId);
    if (!row || row.tenantId !== tenantId) {
      return undefined;
    }
    const updated: Contact = { ...row, optOutAt: at ?? undefined, updatedAt: FIXED_NOW };
    this.rows.set(contactId, updated);
    return updated;
  }

  async listByTenant(tenantId: string, options: ListContactsOptions): Promise<ContactPage> {
    const search = options.search?.trim().toLowerCase();
    let all = [...this.rows.values()]
      .filter((row) => row.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

    if (search) {
      all = all.filter(
        (row) => row.name?.toLowerCase().includes(search) || row.phoneE164.includes(search),
      );
    }
    if (options.status === 'with_conversation') {
      all = all.filter((row) => this.conversations.has(row.id));
    } else if (options.status === 'without_conversation') {
      all = all.filter((row) => !this.conversations.has(row.id));
    } else if (options.status === 'opted_out') {
      all = all.filter((row) => row.optOutAt !== undefined);
    }

    const startIndex = options.cursor ? all.findIndex((row) => row.id === options.cursor) + 1 : 0;
    const page = all.slice(startIndex, startIndex + options.limit);
    const nextCursor =
      startIndex + options.limit < all.length ? page[page.length - 1]?.id : undefined;

    return {
      contacts: page.map((contact) => {
        const conversation = this.conversations.get(contact.id);
        return {
          ...contact,
          lastConversationId: conversation?.id,
          lastConversationSessionName: conversation?.sessionName,
          lastActivityAt: conversation?.lastMessageAt,
        };
      }),
      nextCursor,
    };
  }

  async countStats(tenantId: string): Promise<ContactStats> {
    const all = [...this.rows.values()].filter((row) => row.tenantId === tenantId);
    const withConversation = all.filter((row) => this.conversations.has(row.id)).length;
    const optedOut = all.filter((row) => row.optOutAt !== undefined).length;
    const bySource: Record<Contact['source'], number> = { whatsapp: 0, import: 0, manual: 0 };
    for (const row of all) {
      bySource[row.source] += 1;
    }
    return {
      total: all.length,
      withConversation,
      withoutConversation: all.length - withConversation,
      optedOut,
      bySource,
    };
  }

  /** Helper de teste: associa uma conversa a um contato (para `listByTenant`/`countStats`). */
  seedConversation(
    contactId: string,
    conversation: { id: string; sessionName: string; lastMessageAt?: Date },
  ): void {
    this.conversations.set(contactId, conversation);
  }

  async findManyByPhones(tenantId: string, phonesE164: string[]): Promise<Contact[]> {
    return [...this.rows.values()].filter(
      (row) => row.tenantId === tenantId && phonesE164.includes(row.phoneE164),
    );
  }

  async update(
    tenantId: string,
    contactId: string,
    data: { name?: string; phoneE164?: string },
  ): Promise<Contact | undefined> {
    const row = this.rows.get(contactId);
    if (!row || row.tenantId !== tenantId) {
      return undefined;
    }
    if (data.phoneE164) {
      const collision = [...this.rows.values()].find(
        (other) =>
          other.id !== contactId &&
          other.tenantId === tenantId &&
          other.phoneE164 === data.phoneE164,
      );
      if (collision) {
        throw new ContactPhoneAlreadyExistsError(data.phoneE164);
      }
    }
    const updated: Contact = {
      ...row,
      name: data.name !== undefined ? data.name : row.name,
      phoneE164: data.phoneE164 !== undefined ? data.phoneE164 : row.phoneE164,
      updatedAt: FIXED_NOW,
    };
    this.rows.set(contactId, updated);
    return updated;
  }

  async deleteById(tenantId: string, contactId: string): Promise<boolean> {
    const row = this.rows.get(contactId);
    if (!row || row.tenantId !== tenantId) {
      return false;
    }
    this.rows.delete(contactId);
    return true;
  }

  /** Helper de teste: pré-carrega um contato, devolvendo o `id` gerado. */
  seed(
    data: Omit<CreateContactData, 'source'> & { source?: Contact['source']; optOutAt?: Date },
  ): string {
    const id = `contact-${this.nextId++}`;
    this.rows.set(id, {
      id,
      tenantId: data.tenantId,
      phoneE164: data.phoneE164,
      name: data.name,
      source: data.source ?? 'whatsapp',
      optOutAt: data.optOutAt,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
    return id;
  }
}
