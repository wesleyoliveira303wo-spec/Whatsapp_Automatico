import { Contact } from '../../../../src/services/contacts/domain/entities/Contact';
import {
  ContactPage,
  ContactRepository,
  CreateContactData,
  ListContactsOptions,
} from '../../../../src/services/contacts/domain/repositories/ContactRepository';

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

    const startIndex = options.cursor ? all.findIndex((row) => row.id === options.cursor) + 1 : 0;
    const page = all.slice(startIndex, startIndex + options.limit);
    const nextCursor =
      startIndex + options.limit < all.length ? page[page.length - 1]?.id : undefined;

    return { contacts: page, nextCursor };
  }

  /** Helper de teste: pré-carrega um contato, devolvendo o `id` gerado. */
  seed(data: Omit<CreateContactData, 'source'> & { source?: Contact['source'] }): string {
    const id = `contact-${this.nextId++}`;
    this.rows.set(id, {
      id,
      tenantId: data.tenantId,
      phoneE164: data.phoneE164,
      name: data.name,
      source: data.source ?? 'whatsapp',
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
    return id;
  }
}
