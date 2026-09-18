import { Prisma, type PrismaClient } from '@prisma/client';

import { BillingEventRepository } from '../domain/repositories/BillingEventRepository';

/** `BillingEventRepository` sobre o model `BillingEvent` (B5, etapa 2). */
export class PrismaBillingEventRepository implements BillingEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async exists(stripeEventId: string): Promise<boolean> {
    const row = await this.prisma.billingEvent.findUnique({ where: { stripeEventId } });
    return row !== null;
  }

  async record(input: { stripeEventId: string; type: string; tenantId?: string }): Promise<void> {
    try {
      await this.prisma.billingEvent.create({ data: input });
    } catch (error) {
      // Dois reenvios simultâneos do mesmo aviso: o segundo perde na
      // unicidade — o aviso já está registrado, que é o que importa.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }
}
