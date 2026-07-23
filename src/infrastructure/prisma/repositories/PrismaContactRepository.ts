import { prisma } from '../PrismaClient';
import { Contact } from '../../../domain/entities/Contact';
import { ContactRepository } from '../../../domain/repositories/ContactRepository';
import { PhoneNumber } from '../../../domain/value-objects/PhoneNumber';
import { logger } from '../../logger';

function toDomain(model: Record<string, unknown>): Contact {
  return new Contact({
    id: model.id,
    tenantId: model.tenantId,
    phoneNumber: new PhoneNumber(model.phoneNumber),
    name: model.name ?? undefined,
    email: model.email ?? undefined,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  });
}

function toPrisma(entity: Contact): Record<string, unknown> {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    phoneNumber: entity.phoneNumber.raw,
    name: entity.name ?? null,
    email: entity.email ?? null,
    // createdAt / updatedAt handled by Prisma defaults
  };
}

export class PrismaContactRepository implements ContactRepository {
  async findById(id: string): Promise<Contact | null> {
    try {
      const model = await prisma.contact.findUnique({ where: { id } });
      return model ? toDomain(model) : null;
    } catch (error) {
      logger.error('Error finding Contact by id', { id, error });
      throw error;
    }
  }

  async findByPhoneNumber(tenantId: string, phoneNumber: string): Promise<Contact | null> {
    try {
      const model = await prisma.contact.findFirst({
        where: { tenantId, phoneNumber },
      });
      return model ? toDomain(model) : null;
    } catch (error) {
      logger.error('Error finding Contact by phone', { tenantId, phoneNumber, error });
      throw error;
    }
  }

  async save(contact: Contact): Promise<void> {
    try {
      const data = toPrisma(contact);
      await prisma.contact.upsert({
        where: { id: contact.id },
        create: data,
        update: data,
      });
    } catch (error) {
      logger.error('Error saving Contact', { id: contact.id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.contact.delete({ where: { id } });
    } catch (error) {
      logger.error('Error deleting Contact', { id, error });
      if ((error as { code?: string } | null)?.code === 'P2025') return;
      throw error;
    }
  }
}
