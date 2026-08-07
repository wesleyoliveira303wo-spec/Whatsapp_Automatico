import type { PrismaClient, TagColor as PrismaTagColor } from '@prisma/client';

import { Tag, TagColor } from '../../domain/entities/Tag';
import { TagRepository, TagInput } from '../../domain/repositories/TagRepository';

const COLOR_TO_PRISMA: Record<TagColor, PrismaTagColor> = {
  gray: 'GRAY' as PrismaTagColor,
  red: 'RED' as PrismaTagColor,
  orange: 'ORANGE' as PrismaTagColor,
  amber: 'AMBER' as PrismaTagColor,
  green: 'GREEN' as PrismaTagColor,
  teal: 'TEAL' as PrismaTagColor,
  blue: 'BLUE' as PrismaTagColor,
  purple: 'PURPLE' as PrismaTagColor,
};

const COLOR_TO_DOMAIN: Record<PrismaTagColor, TagColor> = {
  GRAY: 'gray',
  RED: 'red',
  ORANGE: 'orange',
  AMBER: 'amber',
  GREEN: 'green',
  TEAL: 'teal',
  BLUE: 'blue',
  PURPLE: 'purple',
} as Record<PrismaTagColor, TagColor>;

/** Shape mínimo lido do banco — mesmo racional dos demais repositórios Prisma deste projeto. */
interface TagRow {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  color: PrismaTagColor;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: TagRow): Tag {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    name: row.name,
    color: COLOR_TO_DOMAIN[row.color],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Implementação concreta de `TagRepository` sobre os models `WhatsAppTag`/
 * `WhatsAppConversationTag` (`prisma/schema.prisma`, Redesign 2026-08-05, R4).
 *
 * Só `import type` de `@prisma/client` (mesmo padrão de todo repositório
 * Prisma deste projeto) — o `ts-jest` erasa o import inteiro em
 * transpilação, sem disparar `require('@prisma/client')` em runtime.
 *
 * `update`/`remove` são IDOR-safe por construção (`updateMany`/`deleteMany`
 * com `where: {id, tenantId, sessionName}`), mesmo padrão de
 * `PrismaQuickReplyRepository`.
 *
 * NOTA DE VERIFICAÇÃO: depende de `npx prisma generate` + `npx prisma
 * migrate deploy` após a migration `20260806120000_add_tags`.
 */
export class PrismaTagRepository implements TagRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listBySession(tenantId: string, sessionName: string): Promise<Tag[]> {
    const rows = await this.prisma.whatsAppTag.findMany({
      where: { tenantId, sessionName },
      orderBy: { name: 'asc' },
    });
    return rows.map(toDomain);
  }

  async create(tenantId: string, sessionName: string, name: string, color: TagColor): Promise<Tag> {
    const row = await this.prisma.whatsAppTag.create({
      data: { tenantId, sessionName, name, color: COLOR_TO_PRISMA[color] },
    });
    return toDomain(row);
  }

  async update(
    tenantId: string,
    sessionName: string,
    id: string,
    data: TagInput,
  ): Promise<Tag | null> {
    const { count } = await this.prisma.whatsAppTag.updateMany({
      where: { id, tenantId, sessionName },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.color !== undefined && { color: COLOR_TO_PRISMA[data.color] }),
      },
    });
    if (count === 0) {
      return null;
    }
    const row = await this.prisma.whatsAppTag.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async remove(tenantId: string, sessionName: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.whatsAppTag.deleteMany({
      where: { id, tenantId, sessionName },
    });
    return count > 0;
  }

  async assign(tenantId: string, conversationId: string, tagId: string): Promise<boolean> {
    const conversation = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { sessionName: true },
    });
    if (!conversation) {
      return false;
    }

    const tag = await this.prisma.whatsAppTag.findFirst({
      where: { id: tagId, tenantId, sessionName: conversation.sessionName },
      select: { id: true },
    });
    if (!tag) {
      return false;
    }

    await this.prisma.whatsAppConversationTag.upsert({
      where: { conversationId_tagId: { conversationId, tagId } },
      create: { conversationId, tagId },
      update: {},
    });
    return true;
  }

  async unassign(tenantId: string, conversationId: string, tagId: string): Promise<boolean> {
    const conversation = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { id: true },
    });
    if (!conversation) {
      return false;
    }

    await this.prisma.whatsAppConversationTag.deleteMany({ where: { conversationId, tagId } });
    return true;
  }
}
