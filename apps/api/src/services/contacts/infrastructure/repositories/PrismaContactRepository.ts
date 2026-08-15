import type { PrismaClient } from '@prisma/client';

import { Contact, ContactSource } from '../../domain/entities/Contact';
import { ContactRepository, CreateContactData } from '../../domain/repositories/ContactRepository';

/** Shape mínimo lido do banco — mesmo racional dos demais repositórios Prisma deste projeto. */
interface ContactRow {
  id: string;
  tenantId: string;
  phoneE164: string;
  name: string | null;
  source: string;
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
}
