import { prisma } from '../PrismaClient';
import { Message } from '../../../domain/entities/Message';
import { MessageRepository } from '../../../domain/repositories/MessageRepository';
import { MessageDirection } from '../../../domain/enums/MessageDirection';
import { MessageType } from '../../../domain/enums/MessageType';
import { MessageStatus } from '../../../domain/enums/MessageStatus';
import { logger } from '../../logger';

function toDomain(model: Record<string, unknown>): Message {
  return new Message({
    id: model.id,
    conversationId: model.conversationId,
    direction: model.direction as MessageDirection,
    type: model.type as MessageType,
    content: model.content,
    status: model.status as MessageStatus,
    providerMessageId: model.providerMessageId ?? undefined,
    sentAt: model.sentAt ?? undefined,
    receivedAt: model.receivedAt,
    metadata: model.metadata ?? undefined,
  });
}

function toPrisma(entity: Message): Record<string, unknown> {
  return {
    id: entity.id,
    conversationId: entity.conversationId,
    direction: entity.direction,
    type: entity.type,
    content: entity.content,
    status: entity.status,
    providerMessageId: entity.providerMessageId ?? null,
    sentAt: entity.sentAt ?? null,
    receivedAt: entity.receivedAt,
    metadata: entity.metadata ?? null,
  };
}

export class PrismaMessageRepository implements MessageRepository {
  async findById(id: string): Promise<Message | null> {
    try {
      const model = await prisma.message.findUnique({ where: { id } });
      return model ? toDomain(model) : null;
    } catch (error) {
      logger.error('Error finding Message', { id, error });
      throw error;
    }
  }

  async findByConversationId(conversationId: string): Promise<Message[]> {
    try {
      const models = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { receivedAt: 'asc' },
      });
      return models.map(toDomain);
    } catch (error) {
      logger.error('Error finding Messages by conversation', { conversationId, error });
      throw error;
    }
  }

  async save(message: Message): Promise<void> {
    try {
      const data = toPrisma(message);
      await prisma.message.upsert({
        where: { id: message.id },
        create: data,
        update: data,
      });
    } catch (error) {
      logger.error('Error saving Message', { id: message.id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.message.delete({ where: { id } });
    } catch (error) {
      logger.error('Error deleting Message', { id, error });
      if ((error as { code?: string } | null)?.code === 'P2025') return;
      throw error;
    }
  }
}
