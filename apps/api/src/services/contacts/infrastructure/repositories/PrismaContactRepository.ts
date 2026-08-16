import type { PrismaClient } from '@prisma/client';

import { Contact, ContactSource } from '../../domain/entities/Contact';
import {
  ContactPage,
  ContactRepository,
  CreateContactData,
  ListContactsOptions,
} from '../../domain/repositories/ContactRepository';

/** Shape mínimo lido do banco — mesmo racional dos demais repositórios Prisma deste projeto. */
interface ContactRow {
  id: string;
  tenantId: string;
  phoneE164: string;
  name: string | null;
  source: string;
  optOutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Mapeamento enum do Prisma ↔ união literal do Domain — mesmo padrão de `DIRECTION_TO_PRISMA`. */
const SOURCE_TO_PRISMA: Record<ContactSource, 'WHATSAPP' | 'IMPORT' | 'MANUAL'> = {
  whatsapp: 'WHATSAPP',
  import: 'IMPORT',
  manual: 'MANUAL',
};

const SOURCE_FROM_PRISMA: Record<string, ContactSource> = {
  WHATSAPP: 'whatsapp',
  IMPORT: 'import',
  MANUAL: 'manual',
};

function toDomain(row: ContactRow): Contact {
  return {
    id: row.id,
    tenantId: row.tenantId,
    phoneE164: row.phoneE164,
    // `null` no banco vira `undefined` no Domain — mesma convenção já usada
    // para `contactName`/`lastMessagePreview` em `PrismaConversationRepository`.
    name: row.name ?? undefined,
    source: SOURCE_FROM_PRISMA[row.source] ?? 'whatsapp',
    optOutAt: row.optOutAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Implementação concreta de `ContactRepository` sobre o model
 * `WhatsAppContact` (`prisma/schema.prisma`, Fase L — Bloco L1).
 *
 * Só `import type` de `@prisma/client` (mesmo padrão de todo repositório
 * Prisma deste projeto) — o `ts-jest` erasa o import inteiro em transpilação
 * (`isolatedModules`), sem disparar `require('@prisma/client')` em runtime.
 *
 * Toda leitura é escopada por `tenantId`: um `id` de outro tenant não casa com
 * o `where` e devolve `undefined`, nunca a linha alheia.
 */
export class PrismaContactRepository implements ContactRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Deduplicação apoiada na constraint do banco, não numa checagem da
   * aplicação (ver docstring do port). `upsert` sobre a chave única
   * `(tenantId, phoneE164)`:
   *
   * - se não existe → cria com os dados informados;
   * - se já existe → `update: {}`, ou seja, NADA é alterado, e a linha atual é
   *   devolvida. Isto é o que garante que um `name` definido pelo operador
   *   nunca seja apagado por uma criação automática vinda de uma mensagem
   *   recebida, e que a `source` original ("veio da planilha") não seja
   *   reescrita para "veio do WhatsApp" quando a pessoa responder.
   */
  async findOrCreateByPhone(data: CreateContactData): Promise<Contact> {
    const row = await this.prisma.whatsAppContact.upsert({
      where: {
        tenantId_phoneE164: { tenantId: data.tenantId, phoneE164: data.phoneE164 },
      },
      update: {},
      create: {
        tenantId: data.tenantId,
        phoneE164: data.phoneE164,
        name: data.name ?? null,
        source: SOURCE_TO_PRISMA[data.source],
        // Só o backfill do histórico informa isso; no fluxo normal o default
        // do banco (`now()`) é o correto. Ver docstring de `CreateContactData`.
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      },
    });
    return toDomain(row);
  }

  async findByPhone(tenantId: string, phoneE164: string): Promise<Contact | undefined> {
    const row = await this.prisma.whatsAppContact.findUnique({
      where: { tenantId_phoneE164: { tenantId, phoneE164 } },
    });
    return row ? toDomain(row) : undefined;
  }

  async findById(tenantId: string, contactId: string): Promise<Contact | undefined> {
    const row = await this.prisma.whatsAppContact.findFirst({
      where: { id: contactId, tenantId },
    });
    return row ? toDomain(row) : undefined;
  }

  /**
   * `name: null` FAZ PARTE do critério — ver docstring do port. Uma linha que
   * já tem nome simplesmente não casa com o `where` (`count === 0`, sem
   * erro), então a chamada é segura de repetir a cada reimportação.
   */
  async setNameIfMissing(tenantId: string, contactId: string, name: string): Promise<void> {
    await this.prisma.whatsAppContact.updateMany({
      where: { id: contactId, tenantId, name: null },
      data: { name },
    });
  }

  /** Paginação por cursor — mesmo padrão de `PrismaAuditLogRepository.listByTenant`. */
  async listByTenant(tenantId: string, options: ListContactsOptions): Promise<ContactPage> {
    const search = options.search?.trim();
    const rows = await this.prisma.whatsAppContact.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phoneE164: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;
    const contacts = page.map(toDomain);
    const nextCursor = hasMore ? page[page.length - 1].id : undefined;

    return { contacts, nextCursor };
  }

  /**
   * `updateMany` escopado por `(id, tenantId)` — mesma defesa em profundidade
   * contra IDOR já usada em todo repositório deste projeto. Incondicional de
   * propósito (sem `optOutAt: null`/`{not: null}` no `where`): ver docstring
   * do port — precisa aceitar tanto "gravar de novo" (reforça a data de um
   * opt-out repetido) quanto "limpar" (`at: null`, um opt-in manual).
   */
  async setOptOutAt(
    tenantId: string,
    contactId: string,
    at: Date | null,
  ): Promise<Contact | undefined> {
    const { count } = await this.prisma.whatsAppContact.updateMany({
      where: { id: contactId, tenantId },
      data: { optOutAt: at },
    });
    if (count === 0) {
      return undefined;
    }
    return this.findById(tenantId, contactId);
  }
}
