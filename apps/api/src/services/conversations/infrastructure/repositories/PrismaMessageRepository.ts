import type { PrismaClient, WhatsAppMessageDirection as PrismaMessageDirection } from '@prisma/client';

import { Message } from '../../domain/entities/Message';
import { MessageRepository } from '../../domain/repositories/MessageRepository';

const DIRECTION_TO_PRISMA: Record<Message['direction'], PrismaMessageDirection> = {
  inbound: 'INBOUND' as PrismaMessageDirection,
  outbound: 'OUTBOUND' as PrismaMessageDirection,
};

const DIRECTION_TO_DOMAIN: Record<PrismaMessageDirection, Message['direction']> = {
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
} as Record<PrismaMessageDirection, Message['direction']>;

interface WhatsAppMessageRow {
  id: string;
  tenantId: string;
  conversationId: string;
  direction: PrismaMessageDirection;
  content: string;
  occurredAt: Date;
}

function toDomain(row: WhatsAppMessageRow): Message {
  return {
    id: row.id,
    tenantId: row.tenantId,
    conversationId: row.conversationId,
    direction: DIRECTION_TO_DOMAIN[row.direction],
    content: row.content,
    occurredAt: row.occurredAt,
  };
}

/**
 * Implementação concreta de `MessageRepository` sobre o model
 * `WhatsAppMessage` (`prisma/schema.prisma`, Milestone 3, Bloco 2) — mesmo
 * racional de nomenclatura de `PrismaConversationRepository` (evita colisão
 * com o model `Message` do domínio legado, ADR #11).
 *
 * NOTA DE VERIFICAÇÃO (mesma limitação já registrada para os demais
 * arquivos Prisma deste projeto): depende de `npx prisma generate` (Client)
 * e `npx prisma migrate deploy`/`migrate dev` (tabela) terem rodado.
 */
export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(message: Omit<Message, 'id'>): Promise<Message> {
    const row = await this.prisma.whatsAppMessage.create({
      data: {
        tenantId: message.tenantId,
        conversationId: message.conversationId,
        direction: DIRECTION_TO_PRISMA[message.direction],
        content: message.content,
        occurredAt: message.occurredAt,
      },
    });

    return toDomain(row);
  }

  /**
   * Milestone 3, Bloco 4 (aditivo — ver docstring de `MessageRepository.
   * listRecentByConversation`). Filtra por `tenantId` E `conversationId`
   * (defesa em profundidade, mesmo racional de
   * `PrismaWhatsAppSessionEventRepository.listRecentByTenantAndSessionName`),
   * ordena do mais novo para o mais antigo e limita a `limit` linhas —
   * espelha `orderBy`/`take` já usados em outros repositórios deste projeto.
   */
  async listRecentByConversation(tenantId: string, conversationId: string, limit: number): Promise<Message[]> {
    const rows = await this.prisma.whatsAppMessage.findMany({
      where: { tenantId, conversationId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
    return rows.map(toDomain);
  }
}
