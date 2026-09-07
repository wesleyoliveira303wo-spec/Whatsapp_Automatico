import type { PrismaClient } from '@prisma/client';

import {
  ContactAvatarCacheRecord,
  ContactAvatarCacheRepository,
} from '../../domain/repositories/ContactAvatarCacheRepository';

/**
 * Shape mínimo lido do banco — mesmo padrão dos demais repositórios Prisma
 * deste projeto (só os campos que este arquivo de fato lê, não o tipo
 * completo gerado). Só `import type` de `@prisma/client`, sem nenhum import
 * de valor.
 */
interface ContactAvatarRow {
  contactJid: string;
  avatarUrl: string | null;
  refreshedAt: Date;
}

/**
 * Implementação de `ContactAvatarCacheRepository` sobre o model
 * `WhatsAppContactAvatar` (Bloco B2, issue #13).
 *
 * NOTA DE VERIFICAÇÃO (mesma limitação de todo arquivo Prisma deste
 * projeto): depende de `npx prisma generate` + a migration
 * `20260905120000_add_contact_avatar_cache` terem rodado.
 */
export class PrismaContactAvatarCacheRepository implements ContactAvatarCacheRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findManyByContactJids(
    tenantId: string,
    sessionName: string,
    contactJids: string[],
  ): Promise<ContactAvatarCacheRecord[]> {
    // Lista vazia curto-circuita: um `IN ()` vazio é uma ida ao banco
    // garantidamente sem resultado.
    if (contactJids.length === 0) return [];

    const rows: ContactAvatarRow[] = await this.prisma.whatsAppContactAvatar.findMany({
      where: { tenantId, sessionName, contactJid: { in: contactJids } },
      select: { contactJid: true, avatarUrl: true, refreshedAt: true },
    });

    return rows.map((row) => ({
      contactJid: row.contactJid,
      // `null` no banco (registro negativo) vira `undefined` no Domain — a
      // distinção que importa é entre "linha existe" e "linha não existe",
      // e essa fica preservada pela presença do objeto no array.
      avatarUrl: row.avatarUrl ?? undefined,
      refreshedAt: row.refreshedAt,
    }));
  }

  async upsert(
    tenantId: string,
    sessionName: string,
    contactJid: string,
    avatarUrl: string | undefined,
    refreshedAt: Date,
  ): Promise<void> {
    await this.prisma.whatsAppContactAvatar.upsert({
      where: { tenantId_sessionName_contactJid: { tenantId, sessionName, contactJid } },
      create: { tenantId, sessionName, contactJid, avatarUrl: avatarUrl ?? null, refreshedAt },
      update: { avatarUrl: avatarUrl ?? null, refreshedAt },
    });
  }
}
