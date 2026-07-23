import { prisma } from '../PrismaClient';
import { Tag } from '../../../domain/entities/Tag';
import { TagRepository } from '../../../domain/repositories/TagRepository';
import { logger } from '../../logger';

function toDomain(model: Record<string, unknown>): Tag {
  return new Tag({
    id: model.id,
    name: model.name,
    tenantId: model.tenantId,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  });
}

function toPrisma(entity: Tag): Record<string, unknown> {
  return {
    id: entity.id,
    name: entity.name,
    tenantId: entity.tenantId,
    // createdAt / updatedAt handled by Prisma defaults
  };
}

export class PrismaTagRepository implements TagRepository {
  async findById(id: string): Promise<Tag | null> {
    try {
      const model = await prisma.tag.findUnique({ where: { id } });
      return model ? toDomain(model) : null;
    } catch (error) {
      logger.error('Error finding Tag by id', { id, error });
      throw error;
    }
  }

  async findByName(tenantId: string, name: string): Promise<Tag | null> {
    try {
      const model = await prisma.tag.findFirst({ where: { tenantId, name } });
      return model ? toDomain(model) : null;
    } catch (error) {
      logger.error('Error finding Tag by name', { tenantId, name, error });
      throw error;
    }
  }

  async save(tag: Tag): Promise<void> {
    try {
      const data = toPrisma(tag);
      await prisma.tag.upsert({
        where: { id: tag.id },
        create: data,
        update: data,
      });
    } catch (error) {
      logger.error('Error saving Tag', { id: tag.id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.tag.delete({ where: { id } });
    } catch (error) {
      logger.error('Error deleting Tag', { id, error });
      if ((error as { code?: string } | null)?.code === 'P2025') return;
      throw error;
    }
  }
}
