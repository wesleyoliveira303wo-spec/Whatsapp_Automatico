import { prisma } from '../PrismaClient';
import { Attachment } from '../../../domain/entities/Attachment';
import { AttachmentRepository } from '../../../domain/repositories/AttachmentRepository';
import { MessageType } from '../../../domain/enums/MessageType';
import { logger } from '../../logger';

function toDomain(model: Record<string, unknown>): Attachment {
  return new Attachment({
    id: model.id,
    messageId: model.messageId,
    type: model.type as MessageType,
    url: model.url,
    mimeType: model.mimeType,
    sizeBytes: model.sizeBytes,
    metadata: model.metadata ?? undefined,
    createdAt: model.createdAt,
  });
}

function toPrisma(entity: Attachment): Record<string, unknown> {
  return {
    id: entity.id,
    messageId: entity.messageId,
    type: entity.type,
    url: entity.url,
    mimeType: entity.mimeType,
    sizeBytes: entity.sizeBytes,
    metadata: entity.metadata ?? null,
  };
}

export class PrismaAttachmentRepository implements AttachmentRepository {
  async findById(id: string): Promise<Attachment | null> {
    try {
      const model = await prisma.attachment.findUnique({ where: { id } });
      return model ? toDomain(model) : null;
    } catch (error) {
      logger.error('Error finding Attachment by id', { id, error });
      throw error;
    }
  }

  async findByMessageId(messageId: string): Promise<Attachment[]> {
    try {
      const models = await prisma.attachment.findMany({ where: { messageId } });
      return models.map(toDomain);
    } catch (error) {
      logger.error('Error finding Attachments by messageId', { messageId, error });
      throw error;
    }
  }

  async save(attachment: Attachment): Promise<void> {
    try {
      const data = toPrisma(attachment);
      await prisma.attachment.upsert({
        where: { id: attachment.id },
        create: data,
        update: data,
      });
    } catch (error) {
      logger.error('Error saving Attachment', { id: attachment.id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.attachment.delete({ where: { id } });
    } catch (error) {
      logger.error('Error deleting Attachment', { id, error });
      if ((error as { code?: string } | null)?.code === 'P2025') return;
      throw error;
    }
  }
}
