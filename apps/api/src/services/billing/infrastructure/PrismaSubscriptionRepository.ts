import type {
  PrismaClient,
  SubscriptionStatus as PrismaSubscriptionStatus,
  TenantPlan as PrismaTenantPlan,
} from '@prisma/client';

import { TenantPlan } from '../../../shared/tenant/domain/TenantPlan';
import { Subscription, SubscriptionStatus } from '../domain/entities/Subscription';
import {
  SubscriptionRepository,
  SubscriptionState,
} from '../domain/repositories/SubscriptionRepository';

const PLAN_TO_DOMAIN: Record<PrismaTenantPlan, TenantPlan> = {
  FREE: 'free',
  BROADCAST: 'broadcast',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
};

const PLAN_TO_PRISMA: Record<TenantPlan, PrismaTenantPlan> = {
  free: 'FREE',
  broadcast: 'BROADCAST',
  pro: 'PRO',
  enterprise: 'ENTERPRISE',
};

const STATUS_TO_DOMAIN: Record<PrismaSubscriptionStatus, SubscriptionStatus> = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  INCOMPLETE: 'incomplete',
};

const STATUS_TO_PRISMA: Record<SubscriptionStatus, PrismaSubscriptionStatus> = {
  trialing: 'TRIALING',
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  incomplete: 'INCOMPLETE',
};

interface SubscriptionRow {
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  plan: PrismaTenantPlan | null;
  status: PrismaSubscriptionStatus | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  pastDueSince: Date | null;
  updatedAt: Date;
}

function toDomain(row: SubscriptionRow): Subscription {
  return {
    tenantId: row.tenantId,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId ?? undefined,
    plan: row.plan ? PLAN_TO_DOMAIN[row.plan] : undefined,
    status: row.status ? STATUS_TO_DOMAIN[row.status] : undefined,
    trialEndsAt: row.trialEndsAt ?? undefined,
    currentPeriodEnd: row.currentPeriodEnd ?? undefined,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    pastDueSince: row.pastDueSince ?? undefined,
    updatedAt: row.updatedAt,
  };
}

/** `SubscriptionRepository` sobre o model `Subscription` (B5, etapa 2). */
export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTenant(tenantId: string): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findUnique({ where: { tenantId } });
    return row ? toDomain(row) : null;
  }

  async findByCustomerId(stripeCustomerId: string): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findUnique({ where: { stripeCustomerId } });
    return row ? toDomain(row) : null;
  }

  async createForCustomer(tenantId: string, stripeCustomerId: string): Promise<Subscription> {
    // `upsert` com `update` vazio: num clique duplo em "Assinar", fica o
    // cliente que chegou primeiro — o segundo, criado no Stripe, só fica órfão.
    const row = await this.prisma.subscription.upsert({
      where: { tenantId },
      create: { tenantId, stripeCustomerId },
      update: {},
    });
    return toDomain(row);
  }

  async saveState(tenantId: string, state: SubscriptionState): Promise<Subscription> {
    const row = await this.prisma.subscription.update({
      where: { tenantId },
      data: {
        stripeSubscriptionId: state.stripeSubscriptionId,
        plan: state.plan ? PLAN_TO_PRISMA[state.plan] : null,
        status: state.status ? STATUS_TO_PRISMA[state.status] : null,
        trialEndsAt: state.trialEndsAt,
        currentPeriodEnd: state.currentPeriodEnd,
        cancelAtPeriodEnd: state.cancelAtPeriodEnd,
        pastDueSince: state.pastDueSince,
      },
    });
    return toDomain(row);
  }
}
