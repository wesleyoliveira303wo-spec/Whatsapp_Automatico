# Assinatura pelo Stripe (B5, etapa 2) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono da conta escolhe um plano pago na aba Plano de Configurações, paga pela página do Stripe (1 dia de teste na primeira assinatura) e o plano do tenant muda sozinho quando o Stripe avisa — sem o fundador tocar no banco.

**Architecture:** Bounded context novo `services/billing`. A porta `BillingGateway` isola o Stripe (biblioteca oficial `stripe`, v22). O webhook confere a assinatura com o corpo cru, grava cada aviso uma vez (`BillingEvent`) e **reconcilia por estado**: relê a assinatura atual no Stripe e acerta `Subscription` e `Tenant.plan`. A volta do navegador nunca ativa nada.

**Tech Stack:** Node 20 + Express + Prisma/Postgres 15, `stripe@22` (API `2026-08-26.dahlia`), Next.js Pages Router, Jest.

**Spec:** `docs/superpowers/specs/2026-09-18-cobranca-stripe-design.md` (§4, §6, §7 item 2). Etapa 1 pronta: `docs/superpowers/plans/2026-09-18-planos-e-limites.md`.

## Global Constraints

- Preços: Disparos R$ 69 (6900 centavos), Pro R$ 119 (11900), Enterprise R$ 249 (24900); BRL, mensal, só cartão.
- Teste: `trial_period_days: 1` **somente** se `Tenant.trialUsedAt` for nulo.
- Checkout: `mode: 'subscription'`, `payment_method_types: ['card']`, `payment_method_collection: 'always'`, `locale: 'pt-BR'`, `client_reference_id: tenantId`.
- O plano só muda pelo aviso do Stripe (webhook). A volta do navegador só consulta.
- O Stripe **nunca** altera um tenant `planSource = manual` com plano pago.
- `/admin` não troca o plano de tenant com assinatura em `trialing`/`active`/`past_due` (409).
- Assinar/gerenciar: só o **dono** (`billing:manage`) e só login de pessoa (nunca API key nem suporte).
- Sem `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, os três `STRIPE_PRICE_*` e `BILLING_PUBLIC_URL`, a cobrança fica **desligada**: a aba mostra o plano e "assinatura pelo site em breve"; o resto funciona igual.
- Nunca imprimir chave nem segredo em log ou saída de script.
- Migrations só aditivas. Nada de `:` em `jobId`.
- Nesta conta Stripe há outro produto (MetaPlay): aviso de um cliente que não é nosso é ignorado com 200.

---

## Mapa de arquivos

**Banco:** `prisma/schema.prisma`; `prisma/migrations/20260918150000_add_billing/migration.sql`.

**API — `apps/api/src/services/billing/`**
- `domain/entities/Subscription.ts`, `domain/priceCatalog.ts`, `domain/subscriptionState.ts`, `domain/BillingGateway.ts`, `domain/errors/billingErrors.ts`, `domain/repositories/SubscriptionRepository.ts`, `domain/repositories/BillingEventRepository.ts`
- `application/BillingService.ts`
- `infrastructure/StripeBillingGateway.ts`, `infrastructure/PrismaSubscriptionRepository.ts`, `infrastructure/PrismaBillingEventRepository.ts`, `infrastructure/SubscriptionActiveChecker.ts`, `infrastructure/billingConfig.ts`
- `presentation/billingRouter.ts`, `presentation/billingWebhookRouter.ts`, `presentation/billingErrorHandler.ts`, `presentation/webhookPath.ts`
- `compositionRoot.ts`

**API — outros:** `shared/presentation/requireHumanActor.ts` (novo; substitui as duas cópias locais), `services/auth/presentation/usersRouter.ts`, `services/platform/presentation/tenantSupportAccessRouter.ts`, `services/auth/domain/permissions.ts`, `shared/tenant/domain/Tenant.ts` + `TenantRepository.ts` + `infrastructure/PrismaTenantRepository.ts` (`trialUsedAt`, `markTrialUsed`), `services/platform/application/TenantControlService.ts` + `domain/providers/ActiveSubscriptionChecker.ts` + `domain/errors/TenantPlanManagedBySubscriptionError.ts` + `presentation/platformErrorHandler.ts`, `scripts/deleteTenant.ts`, `scripts/createStripePrices.ts` (novo), `index.ts`.

**Infra/config:** `deploy/caddy/Caddyfile`, `.env.example`, `.env.prod.example`.

**Painel:** `lib/plans.ts` (preços), `lib/landingContent.ts`, `lib/apiClient.ts`, `lib/clientApi.ts`, `pages/api/billing/{index,checkout,portal}.ts`, `components/PlanSettingsTab.tsx`, `components/SettingsSidebar.tsx`, `components/SettingsLayout.tsx`, `pages/settings/[[...section]].tsx` (`PlanProvider`), `components/AtendimentoSettingsTab.tsx` (link de IA).

---

### Task 1: Banco, domínio e repositórios da cobrança

**Files:**
- Create: domínio e repositórios listados acima; `apps/api/tests/services/billing/domain/subscriptionState.test.ts`; `apps/api/tests/services/billing/fakes.ts`; `apps/api/tests/integration/billing.integration.test.ts`
- Modify: `prisma/schema.prisma`; `Tenant.ts`, `TenantRepository.ts`, `PrismaTenantRepository.ts`, `apps/api/tests/shared/tenant/FakeTenantRepository.ts`

**Interfaces:**
- Produces:
  - `type PaidPlan = Exclude<TenantPlan, 'free'>`; `PAID_PLANS`; `type PriceCatalog = Record<PaidPlan, string>`; `planForPrice(catalog, priceId): PaidPlan | undefined`; `priceForPlan(catalog, plan): string`
  - `type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'`; `ACTIVE_SUBSCRIPTION_STATUSES`; `toSubscriptionStatus(raw: string): SubscriptionStatus`; `planFromSubscription(sub: GatewaySubscription | null, catalog): TenantPlan | undefined`
  - `interface Subscription` (campos da spec §6.2); `interface SubscriptionState`
  - `SubscriptionRepository { findByTenant; findByCustomerId; createForCustomer(tenantId, customerId); saveState(tenantId, state) }`
  - `BillingEventRepository { exists(stripeEventId); record({ stripeEventId, type, tenantId? }) }`
  - `BillingGateway` (métodos na Task 2) e `GatewaySubscription`, `GatewayEvent`
  - `Tenant.trialUsedAt?: Date`; `TenantRepository.markTrialUsed(id, at): Promise<void>`

- [ ] **Step 1: Teste das regras puras (falhando)**

`apps/api/tests/services/billing/domain/subscriptionState.test.ts`:

```ts
import { planForPrice, priceForPlan } from '../../../../src/services/billing/domain/priceCatalog';
import {
  planFromSubscription,
  toSubscriptionStatus,
} from '../../../../src/services/billing/domain/subscriptionState';
import { GatewaySubscription } from '../../../../src/services/billing/domain/BillingGateway';

const catalog = { broadcast: 'price_b', pro: 'price_p', enterprise: 'price_e' };

function sub(over: Partial<GatewaySubscription> = {}): GatewaySubscription {
  return {
    id: 'sub_1',
    customerId: 'cus_1',
    priceId: 'price_p',
    status: 'active',
    cancelAtPeriodEnd: false,
    ...over,
  };
}

describe('catálogo de preços', () => {
  it('mapeia preço ↔ plano nos dois sentidos', () => {
    expect(planForPrice(catalog, 'price_b')).toBe('broadcast');
    expect(priceForPlan(catalog, 'enterprise')).toBe('price_e');
  });

  it('preço que não é nosso devolve undefined', () => {
    expect(planForPrice(catalog, 'price_de_outro_produto')).toBeUndefined();
  });
});

describe('toSubscriptionStatus', () => {
  it.each([
    ['trialing', 'trialing'],
    ['active', 'active'],
    ['past_due', 'past_due'],
    ['unpaid', 'past_due'],
    ['incomplete', 'incomplete'],
    ['incomplete_expired', 'canceled'],
    ['canceled', 'canceled'],
    ['paused', 'canceled'],
    ['algo_novo', 'incomplete'],
  ])('%s → %s', (raw, expected) => {
    expect(toSubscriptionStatus(raw)).toBe(expected);
  });
});

describe('planFromSubscription', () => {
  it('sem assinatura: Grátis', () => {
    expect(planFromSubscription(null, catalog)).toBe('free');
  });

  it.each(['trialing', 'active', 'past_due'])('%s mantém o plano do preço', (status) => {
    expect(planFromSubscription(sub({ status }), catalog)).toBe('pro');
  });

  it.each(['canceled', 'incomplete', 'incomplete_expired'])('%s: Grátis', (status) => {
    expect(planFromSubscription(sub({ status }), catalog)).toBe('free');
  });

  it('preço desconhecido: undefined (não mexer no plano)', () => {
    expect(planFromSubscription(sub({ priceId: 'price_x' }), catalog)).toBeUndefined();
  });
});
```

Run: `npx jest --selectProjects api --testPathPattern "billing/domain"` → FAIL (módulos não existem).

- [ ] **Step 2: Domínio**

`domain/priceCatalog.ts`:

```ts
import { TenantPlan } from '../../../shared/tenant/domain/TenantPlan';

/** Os planos que se assinam pelo Stripe (o Grátis não tem preço). */
export type PaidPlan = Exclude<TenantPlan, 'free'>;
export const PAID_PLANS: readonly PaidPlan[] = ['broadcast', 'pro', 'enterprise'];

/**
 * Plano → id do preço no Stripe (`STRIPE_PRICE_*`). Vem do ambiente porque
 * cada conta Stripe (teste, produção) tem ids próprios.
 */
export type PriceCatalog = Record<PaidPlan, string>;

export function planForPrice(catalog: PriceCatalog, priceId: string): PaidPlan | undefined {
  return PAID_PLANS.find((plan) => catalog[plan] === priceId);
}

export function priceForPlan(catalog: PriceCatalog, plan: PaidPlan): string {
  return catalog[plan];
}
```

`domain/BillingGateway.ts`:

```ts
/** A assinatura como o Stripe a descreve, reduzida ao que o Francis usa. */
export interface GatewaySubscription {
  id: string;
  customerId: string;
  /** Preço do primeiro item — o Francis só vende assinatura de um item. */
  priceId?: string;
  /** Status cru do Stripe (`trialing`, `active`, `past_due`, `unpaid`, ...). */
  status: string;
  trialEnd?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
}

/** Um aviso do Stripe já com a assinatura conferida. */
export interface GatewayEvent {
  id: string;
  type: string;
  /** Cliente Stripe a que o aviso se refere, quando houver. */
  customerId?: string;
}

/**
 * Porta para o Stripe (B5). Tudo que sai do Francis para o Stripe passa por
 * aqui — o `BillingService` nunca vê a biblioteca `stripe`.
 */
export interface BillingGateway {
  createCustomer(input: { tenantId: string; name: string }): Promise<string>;
  createCheckoutSession(input: {
    customerId: string;
    tenantId: string;
    priceId: string;
    trialDays?: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string>;
  /** A assinatura que vale agora para o cliente, ou `null` se ele não tem nenhuma. */
  findCurrentSubscription(customerId: string): Promise<GatewaySubscription | null>;
  /** Confere a assinatura do aviso. Lança `InvalidWebhookSignatureError` se não bater. */
  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): GatewayEvent;
}
```

`domain/entities/Subscription.ts`:

```ts
import { TenantPlan } from '../../../../shared/tenant/domain/TenantPlan';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

/**
 * O retrato local da assinatura do tenant no Stripe (B5). Existe desde que o
 * tenant ganha um cliente no Stripe (primeiro clique em Assinar) — antes de
 * haver assinatura, `stripeSubscriptionId`/`plan`/`status` ficam vazios.
 * A fonte de verdade é o Stripe; esta linha é reconciliada a cada aviso.
 */
export interface Subscription {
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  plan?: TenantPlan;
  status?: SubscriptionStatus;
  trialEndsAt?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  /** Primeira vez que a assinatura foi vista em atraso; limpa ao pagar. */
  pastDueSince?: Date;
  updatedAt: Date;
}
```

`domain/subscriptionState.ts`:

```ts
import { TenantPlan } from '../../../shared/tenant/domain/TenantPlan';
import { GatewaySubscription } from './BillingGateway';
import { SubscriptionStatus } from './entities/Subscription';
import { PriceCatalog, planForPrice } from './priceCatalog';

/** Situações em que o tenant tem o plano pago (o atraso ainda está na tolerância). */
export const ACTIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
];

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  incomplete: 'incomplete',
  incomplete_expired: 'canceled',
  canceled: 'canceled',
  paused: 'canceled',
};

/** Status cru do Stripe → situação do Francis. Desconhecido vira `incomplete` (não libera nada). */
export function toSubscriptionStatus(raw: string): SubscriptionStatus {
  return STATUS_MAP[raw] ?? 'incomplete';
}

/**
 * Qual plano o tenant deve ter, dada a assinatura que vale agora. `undefined`
 * quando o preço não é nosso — quem chama não mexe no plano e registra.
 */
export function planFromSubscription(
  subscription: GatewaySubscription | null,
  catalog: PriceCatalog,
): TenantPlan | undefined {
  if (!subscription) return 'free';
  const status = toSubscriptionStatus(subscription.status);
  if (!ACTIVE_SUBSCRIPTION_STATUSES.includes(status)) return 'free';
  if (!subscription.priceId) return undefined;
  return planForPrice(catalog, subscription.priceId);
}
```

`domain/errors/billingErrors.ts`:

```ts
/** Chaves do Stripe ausentes no ambiente: a cobrança está desligada (503). */
export class BillingNotConfiguredError extends Error {
  constructor() {
    super('A assinatura pelo site ainda não está disponível.');
    this.name = 'BillingNotConfiguredError';
  }
}

/** A assinatura do aviso não bate com `STRIPE_WEBHOOK_SECRET` (400, nada gravado). */
export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super('Assinatura do aviso do Stripe inválida.');
    this.name = 'InvalidWebhookSignatureError';
  }
}

/** Plano pago ativado pela equipe: não se assina pelo site (409). */
export class PlanManagedManuallyError extends Error {
  constructor() {
    super('Seu plano foi ativado pela equipe do Francis. Para mudar, fale com o comercial.');
    this.name = 'PlanManagedManuallyError';
  }
}

/** Já existe assinatura valendo: trocar de plano é pelo portal (409). */
export class SubscriptionAlreadyActiveError extends Error {
  constructor() {
    super('Você já tem uma assinatura. Para trocar de plano, use "Gerenciar assinatura".');
    this.name = 'SubscriptionAlreadyActiveError';
  }
}

/** O tenant ainda não tem cliente no Stripe, então não há portal para abrir (409). */
export class NoBillingAccountError extends Error {
  constructor() {
    super('Você ainda não tem uma assinatura.');
    this.name = 'NoBillingAccountError';
  }
}
```

`domain/repositories/SubscriptionRepository.ts`:

```ts
import { TenantPlan } from '../../../../shared/tenant/domain/TenantPlan';
import { Subscription, SubscriptionStatus } from '../entities/Subscription';

/** Tudo que a reconciliação grava. `null` limpa o campo. */
export interface SubscriptionState {
  stripeSubscriptionId: string | null;
  plan: TenantPlan | null;
  status: SubscriptionStatus | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  pastDueSince: Date | null;
}

export interface SubscriptionRepository {
  findByTenant(tenantId: string): Promise<Subscription | null>;
  findByCustomerId(stripeCustomerId: string): Promise<Subscription | null>;
  /** Cria a linha do cliente; se já existir (clique duplo), devolve a existente. */
  createForCustomer(tenantId: string, stripeCustomerId: string): Promise<Subscription>;
  saveState(tenantId: string, state: SubscriptionState): Promise<Subscription>;
}
```

`domain/repositories/BillingEventRepository.ts`:

```ts
/** Registro de avisos do Stripe já processados — a garantia de "uma vez só". */
export interface BillingEventRepository {
  exists(stripeEventId: string): Promise<boolean>;
  /** Grava o aviso; se outro processo gravou antes, não faz nada. */
  record(input: { stripeEventId: string; type: string; tenantId?: string }): Promise<void>;
}
```

Run: `npx jest --selectProjects api --testPathPattern "billing/domain"` → PASS.

- [ ] **Step 3: Schema e migration**

`prisma/schema.prisma`:

- no `model Tenant`, depois de `planSource`:

```prisma
  /// Quando o tenant usou o teste grátis (B5). Um teste por conta, para sempre.
  trialUsedAt DateTime? @map("trial_used_at")
```

- relação no `model Tenant` (junto das demais listas): `subscription Subscription?`
- modelos novos:

```prisma
/// Situação da assinatura no Stripe (B5) — ver `Subscription.ts`.
enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  INCOMPLETE

  @@map("subscription_status")
}

/// Retrato local da assinatura do tenant no Stripe (B5, 2026-09-18). Uma por
/// tenant; nasce no primeiro clique em "Assinar" (cliente Stripe criado) e é
/// reconciliada a cada aviso do Stripe. A fonte de verdade é o Stripe.
model Subscription {
  id                   String              @id @default(uuid())
  tenantId             String              @unique @map("tenant_id")
  tenant               Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  stripeCustomerId     String              @unique @map("stripe_customer_id")
  stripeSubscriptionId String?             @unique @map("stripe_subscription_id")
  plan                 TenantPlan?
  status               SubscriptionStatus?
  trialEndsAt          DateTime?           @map("trial_ends_at")
  currentPeriodEnd     DateTime?           @map("current_period_end")
  cancelAtPeriodEnd    Boolean             @default(false) @map("cancel_at_period_end")
  pastDueSince         DateTime?           @map("past_due_since")
  createdAt            DateTime            @default(now()) @map("created_at")
  updatedAt            DateTime            @updatedAt @map("updated_at")

  @@map("subscriptions")
}

/// Avisos do Stripe já processados (B5) — append-only, SEM FK: é a garantia
/// de processar cada aviso uma vez só, e sobrevive à exclusão do tenant.
model BillingEvent {
  id            String   @id @default(uuid())
  stripeEventId String   @unique @map("stripe_event_id")
  type          String
  tenantId      String?  @map("tenant_id")
  receivedAt    DateTime @default(now()) @map("received_at")

  @@map("billing_events")
}
```

`prisma/migrations/20260918150000_add_billing/migration.sql`:

```sql
-- B5, etapa 2 (2026-09-18): assinatura pelo Stripe.
ALTER TABLE "tenants" ADD COLUMN "trial_used_at" TIMESTAMP(3);

CREATE TYPE "subscription_status" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT,
    "plan" "tenant_plan",
    "status" "subscription_status",
    "trial_ends_at" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "past_due_since" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscriptions_tenant_id_key" ON "subscriptions"("tenant_id");
CREATE UNIQUE INDEX "subscriptions_stripe_customer_id_key" ON "subscriptions"("stripe_customer_id");
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tenant_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_events_stripe_event_id_key" ON "billing_events"("stripe_event_id");
```

Run: `npx prisma migrate deploy && npx prisma generate` → migration aplicada.

- [ ] **Step 4: Repositórios Prisma**

`infrastructure/PrismaSubscriptionRepository.ts`:

```ts
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
    // `upsert` sem `update`: num clique duplo, fica o cliente que chegou primeiro.
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
```

`infrastructure/PrismaBillingEventRepository.ts`:

```ts
import { Prisma, type PrismaClient } from '@prisma/client';
import { BillingEventRepository } from '../domain/repositories/BillingEventRepository';

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
      // Dois reenvios simultâneos do mesmo aviso: o segundo perde na unicidade
      // — o aviso já está registrado, que é o que importa.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }
}
```

Tenant: `Tenant.trialUsedAt?: Date`; `TenantRow.trialUsedAt: Date | null`; `toDomain` devolve `trialUsedAt: row.trialUsedAt ?? undefined`; `TenantRepository.markTrialUsed(id: string, at: Date): Promise<void>`; Prisma: `updateMany({ where: { id, trialUsedAt: null }, data: { trialUsedAt: at } })` (só a primeira vez vale). Fake: `markTrialUsed` grava se ainda não houver; `seed` aceita `trialUsedAt?`.

`apps/api/tests/services/billing/fakes.ts` — `FakeSubscriptionRepository` (Map por tenant, `seed`), `FakeBillingEventRepository` (Set de ids), `FakeBillingGateway` (registra chamadas: `customers`, `checkouts`, `portals`; `subscription: GatewaySubscription | null` configurável; `nextEvent: GatewayEvent`; `parseWebhookEvent` lança `InvalidWebhookSignatureError` quando `signature !== 'valid'`).

- [ ] **Step 5: Integração contra Postgres real**

`apps/api/tests/integration/billing.integration.test.ts` (mesmo guard "Postgres indisponível — pulando", `jest.setTimeout(30_000)`):

- cria tenant; `createForCustomer` duas vezes com clientes diferentes → a linha tem o PRIMEIRO cliente;
- `saveState` grava e limpa campos (`null`);
- `findByCustomerId` acha;
- `BillingEvent.record` duas vezes com o mesmo id → uma linha só, sem erro;
- `markTrialUsed` duas vezes → mantém a primeira data;
- excluir o tenant apaga a `Subscription` (cascade) e mantém o `BillingEvent`.

Run: `npx jest --selectProjects api --testPathPattern "billing|tenant"` → PASS, sem aviso de pulo.

- [ ] **Step 6: Commit** — `feat(billing): subscription and billing event tables, price catalog and state rules`

---

### Task 2: Gateway do Stripe

**Files:**
- Create: `infrastructure/StripeBillingGateway.ts`, `apps/api/tests/services/billing/infrastructure/StripeBillingGateway.test.ts`
- Modify: `apps/api/package.json` (`stripe@^22.6.2`, já instalado), `package-lock.json`

**Interfaces:**
- Consumes: `BillingGateway`, `GatewaySubscription`, `GatewayEvent`, `InvalidWebhookSignatureError` (Task 1)
- Produces: `class StripeBillingGateway implements BillingGateway { constructor(stripe: Stripe, webhookSecret: string) }`

- [ ] **Step 1: Testes (falhando)**

Usam uma instância REAL `new Stripe('sk_test_fake')` (não acessa a rede ao ser criada) com `jest.spyOn` nos métodos que chamariam a API. A conferência de assinatura usa a função real da biblioteca, `stripe.webhooks.generateTestHeaderString`, que é offline — é a única forma de provar que a assinatura errada é mesmo recusada.

```ts
import Stripe from 'stripe';
import { StripeBillingGateway } from '../../../../src/services/billing/infrastructure/StripeBillingGateway';
import { InvalidWebhookSignatureError } from '../../../../src/services/billing/domain/errors/billingErrors';

const SECRET = 'whsec_test_secret';

function build(): { stripe: Stripe; gateway: StripeBillingGateway } {
  const stripe = new Stripe('sk_test_fake');
  return { stripe, gateway: new StripeBillingGateway(stripe, SECRET) };
}

describe('StripeBillingGateway', () => {
  it('checkout: assinatura só cartão, pt-BR, com o tenant e o teste quando pedido', async () => {
    const { stripe, gateway } = build();
    const create = jest
      .spyOn(stripe.checkout.sessions, 'create')
      .mockResolvedValue({ url: 'https://checkout.stripe.com/x' } as never);

    const url = await gateway.createCheckoutSession({
      customerId: 'cus_1',
      tenantId: 't1',
      priceId: 'price_p',
      trialDays: 1,
      successUrl: 'https://app/settings/plano?checkout=done',
      cancelUrl: 'https://app/settings/plano?checkout=canceled',
    });

    expect(url).toBe('https://checkout.stripe.com/x');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_1',
        client_reference_id: 't1',
        line_items: [{ price: 'price_p', quantity: 1 }],
        payment_method_types: ['card'],
        payment_method_collection: 'always',
        locale: 'pt-BR',
        subscription_data: { metadata: { tenantId: 't1' }, trial_period_days: 1 },
      }),
    );
  });

  it('checkout sem teste não manda trial_period_days', async () => {
    const { stripe, gateway } = build();
    const create = jest
      .spyOn(stripe.checkout.sessions, 'create')
      .mockResolvedValue({ url: 'u' } as never);

    await gateway.createCheckoutSession({
      customerId: 'cus_1',
      tenantId: 't1',
      priceId: 'price_p',
      successUrl: 's',
      cancelUrl: 'c',
    });

    expect(create.mock.calls[0][0]).toMatchObject({
      subscription_data: { metadata: { tenantId: 't1' } },
    });
    expect(
      (create.mock.calls[0][0] as { subscription_data: object }).subscription_data,
    ).not.toHaveProperty('trial_period_days');
  });

  it('assinatura atual: prefere a que está valendo e lê o fim do período no item', async () => {
    const { stripe, gateway } = build();
    jest.spyOn(stripe.subscriptions, 'list').mockResolvedValue({
      data: [
        { id: 'sub_old', status: 'canceled', created: 100, customer: 'cus_1', cancel_at_period_end: false, trial_end: null, items: { data: [{ price: { id: 'price_b' }, current_period_end: 1 }] } },
        { id: 'sub_new', status: 'trialing', created: 200, customer: 'cus_1', cancel_at_period_end: false, trial_end: 1_800_000_000, items: { data: [{ price: { id: 'price_p' }, current_period_end: 1_800_000_000 }] } },
      ],
    } as never);

    const current = await gateway.findCurrentSubscription('cus_1');

    expect(current).toEqual({
      id: 'sub_new',
      customerId: 'cus_1',
      priceId: 'price_p',
      status: 'trialing',
      trialEnd: new Date(1_800_000_000 * 1000),
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
      cancelAtPeriodEnd: false,
    });
  });

  it('sem assinatura nenhuma: null', async () => {
    const { stripe, gateway } = build();
    jest.spyOn(stripe.subscriptions, 'list').mockResolvedValue({ data: [] } as never);
    await expect(gateway.findCurrentSubscription('cus_1')).resolves.toBeNull();
  });

  it('aviso com assinatura válida: devolve id, tipo e cliente', () => {
    const { stripe, gateway } = build();
    const payload = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'invoice.paid',
      data: { object: { object: 'invoice', customer: 'cus_1' } },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

    expect(gateway.parseWebhookEvent(Buffer.from(payload), header)).toEqual({
      id: 'evt_1',
      type: 'invoice.paid',
      customerId: 'cus_1',
    });
  });

  it('aviso com assinatura de outro segredo, ou sem assinatura: recusa', () => {
    const { stripe, gateway } = build();
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'invoice.paid', data: { object: {} } });
    const forged = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_outro' });

    expect(() => gateway.parseWebhookEvent(Buffer.from(payload), forged)).toThrow(InvalidWebhookSignatureError);
    expect(() => gateway.parseWebhookEvent(Buffer.from(payload), undefined)).toThrow(InvalidWebhookSignatureError);
  });
});
```

(Formatar as linhas longas com o Prettier do projeto ao escrever.)

- [ ] **Step 2: Implementação**

```ts
import Stripe from 'stripe';

import {
  BillingGateway,
  GatewayEvent,
  GatewaySubscription,
} from '../domain/BillingGateway';
import { InvalidWebhookSignatureError } from '../domain/errors/billingErrors';

/** Status em que a assinatura ainda "vale" — preferidos na escolha da atual. */
const LIVE_STATUSES = new Set(['trialing', 'active', 'past_due', 'unpaid', 'incomplete']);

function toDate(seconds: number | null | undefined): Date | undefined {
  return typeof seconds === 'number' ? new Date(seconds * 1000) : undefined;
}

function customerIdOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
    return value.id;
  }
  return undefined;
}

/**
 * Adaptador da porta `BillingGateway` sobre a biblioteca oficial `stripe`
 * (B5). Exceção consciente à preferência do projeto por `fetch` direto: a
 * conferência de assinatura do webhook não se reescreve à mão.
 *
 * Na API `2026-08-26.dahlia` o fim do período mora em cada ITEM da
 * assinatura, não na assinatura — por isso `items.data[0]`.
 */
export class StripeBillingGateway implements BillingGateway {
  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: string,
  ) {}

  async createCustomer(input: { tenantId: string; name: string }): Promise<string> {
    const customer = await this.stripe.customers.create({
      name: input.name,
      metadata: { tenantId: input.tenantId },
    });
    return customer.id;
  }

  async createCheckoutSession(input: {
    customerId: string;
    tenantId: string;
    priceId: string;
    trialDays?: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      client_reference_id: input.tenantId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      payment_method_types: ['card'],
      payment_method_collection: 'always',
      locale: 'pt-BR',
      subscription_data: {
        metadata: { tenantId: input.tenantId },
        ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) {
      throw new Error('O Stripe não devolveu o endereço da página de pagamento.');
    }
    return session.url;
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return session.url;
  }

  async findCurrentSubscription(customerId: string): Promise<GatewaySubscription | null> {
    const { data } = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
    });
    if (data.length === 0) return null;
    const newestFirst = [...data].sort((a, b) => b.created - a.created);
    const chosen = newestFirst.find((s) => LIVE_STATUSES.has(s.status)) ?? newestFirst[0];
    const item = chosen.items.data[0];
    return {
      id: chosen.id,
      customerId: customerIdOf(chosen.customer) ?? customerId,
      priceId: item?.price?.id,
      status: chosen.status,
      trialEnd: toDate(chosen.trial_end),
      currentPeriodEnd: toDate(item?.current_period_end),
      cancelAtPeriodEnd: chosen.cancel_at_period_end,
    };
  }

  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): GatewayEvent {
    if (!signature) throw new InvalidWebhookSignatureError();
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new InvalidWebhookSignatureError();
    }
    const object = event.data.object as { customer?: unknown };
    return { id: event.id, type: event.type, customerId: customerIdOf(object.customer) };
  }
}
```

Run: `npx jest --selectProjects api --testPathPattern "StripeBillingGateway"` → PASS. `npx tsc -p apps/api --noEmit` limpo.

- [ ] **Step 3: Commit** — `feat(billing): Stripe gateway on the official SDK`

---

### Task 3: Serviço de cobrança

**Files:**
- Create: `application/BillingService.ts`, `apps/api/tests/services/billing/application/BillingService.test.ts`

**Interfaces:**
- Consumes: Tasks 1 e 2; `TenantRepository.changePlan/markTrialUsed`; `AuditLogRepository.record`
- Produces:
  - `interface BillingConfig { gateway: BillingGateway; catalog: PriceCatalog; publicUrl: string }`
  - `interface BillingStatus { plan; planSource; billingEnabled; trialAvailable; subscription: null | {...} }`
  - `class BillingService { getStatus(tenantId); createCheckout(tenantId, plan, actor); createPortalSession(tenantId); handleWebhook(rawBody, signature): Promise<'processed' | 'duplicate' | 'ignored'>; syncFromStripe(tenantId) }`
  - `TRIAL_DAYS = 1`

- [ ] **Step 1: Testes (falhando)** — com `FakeTenantRepository`, fakes da Task 1 e `FakeAuditLogRepository` (`tests/services/auth/testDoubles`):

1. `getStatus`: sem assinatura → `{ plan: 'free', billingEnabled: true, trialAvailable: true, subscription: null }`; com a cobrança desligada → `billingEnabled: false`.
2. `createCheckout` primeira vez: cria cliente, grava a linha, pede checkout com `trialDays: 1`, URLs `${publicUrl}/settings/plano?checkout=done|canceled`; audita `billing.checkout_started`.
3. `createCheckout` com `trialUsedAt` preenchido: sem `trialDays`.
4. `createCheckout` reaproveita o cliente existente (não cria outro).
5. `createCheckout` com assinatura `active` → `SubscriptionAlreadyActiveError`; tenant `manual` pago → `PlanManagedManuallyError`; cobrança desligada → `BillingNotConfiguredError`.
6. `createPortalSession` sem linha → `NoBillingAccountError`; com linha → URL do portal com `returnUrl` `${publicUrl}/settings/plano`.
7. `handleWebhook` com assinatura inválida → `InvalidWebhookSignatureError`, nada gravado.
8. `handleWebhook` de `customer.subscription.created` com assinatura `trialing` do plano Pro → tenant vira `pro`/`self_service`, `trialUsedAt` gravado, linha com `status: 'trialing'`, evento registrado, `billing.plan_changed` auditado com `source: 'stripe'`.
9. mesmo aviso de novo → `'duplicate'`, `findCurrentSubscription` não é chamado de novo.
10. tipo não tratado (`charge.succeeded`) → `'ignored'`.
11. cliente que não é nosso (outro produto na mesma conta) → `'ignored'`, nada muda.
12. **Estado, não evento:** chega `invoice.paid` antigo depois de a assinatura já ter sido cancelada no Stripe → a reconciliação relê o Stripe (`subscription = canceled`) e o tenant fica Grátis.
13. tenant `manual` com plano pago recebendo aviso → plano intocado (a linha é atualizada).
14. preço desconhecido → plano intocado.
15. `past_due` pela primeira vez grava `pastDueSince = agora`; aviso seguinte ainda em atraso mantém a mesma data; pago limpa.

- [ ] **Step 2: Implementação**

```ts
import { Logger } from '../../../shared/domain/Logger';
import { PlanSource } from '../../../shared/tenant/domain/PlanSource';
import { Tenant } from '../../../shared/tenant/domain/Tenant';
import { TenantPlan } from '../../../shared/tenant/domain/TenantPlan';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { AuditLogRepository } from '../../auth/domain/repositories/AuditLogRepository';
import { BillingGateway, GatewayEvent } from '../domain/BillingGateway';
import { Subscription, SubscriptionStatus } from '../domain/entities/Subscription';
import {
  BillingNotConfiguredError,
  NoBillingAccountError,
  PlanManagedManuallyError,
  SubscriptionAlreadyActiveError,
} from '../domain/errors/billingErrors';
import { PaidPlan, PriceCatalog, planForPrice, priceForPlan } from '../domain/priceCatalog';
import { BillingEventRepository } from '../domain/repositories/BillingEventRepository';
import { SubscriptionRepository } from '../domain/repositories/SubscriptionRepository';
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  planFromSubscription,
  toSubscriptionStatus,
} from '../domain/subscriptionState';

export const TRIAL_DAYS = 1;

/** Avisos que mexem na assinatura. Os demais: 200 e ignorados. */
const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

export interface BillingConfig {
  gateway: BillingGateway;
  catalog: PriceCatalog;
  /** Endereço público do painel, sem barra no fim — base das URLs de volta. */
  publicUrl: string;
}

export interface BillingStatus {
  plan: TenantPlan;
  planSource: PlanSource;
  billingEnabled: boolean;
  trialAvailable: boolean;
  subscription: null | {
    plan?: TenantPlan;
    status?: SubscriptionStatus;
    trialEndsAt?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd: boolean;
    pastDueSince?: Date;
  };
}

export interface BillingActor {
  userId?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Cobrança pelo Stripe (B5, etapa 2). Três regras sustentam tudo:
 *
 * 1. **O plano só muda pelo aviso do Stripe.** O checkout e o portal só
 *    abrem páginas do Stripe; quem ativa é `syncFromStripe`, chamado a partir
 *    do webhook.
 * 2. **Estado, não evento.** Qualquer aviso tratado termina relendo a
 *    assinatura atual no Stripe. Avisos fora de ordem ou repetidos convergem
 *    para o mesmo resultado.
 * 3. **Plano manual é intocável.** Um tenant pago de origem `manual` nunca é
 *    alterado pelo Stripe.
 *
 * `billing` ausente = cobrança desligada (chaves fora do ambiente): só
 * `getStatus` funciona.
 */
export class BillingService {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly events: BillingEventRepository,
    private readonly tenants: TenantRepository,
    private readonly logger: Logger,
    private readonly billing?: BillingConfig,
    private readonly auditLog?: AuditLogRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getStatus(tenantId: string): Promise<BillingStatus> {
    const tenant = await this.requireTenant(tenantId);
    const subscription = await this.subscriptions.findByTenant(tenantId);
    return {
      plan: tenant.plan,
      planSource: tenant.planSource,
      billingEnabled: Boolean(this.billing),
      trialAvailable: !tenant.trialUsedAt,
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            trialEndsAt: subscription.trialEndsAt,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            pastDueSince: subscription.pastDueSince,
          }
        : null,
    };
  }

  async createCheckout(tenantId: string, plan: PaidPlan, actor: BillingActor): Promise<string> {
    const billing = this.requireEnabled();
    const tenant = await this.requireTenant(tenantId);
    if (tenant.planSource === 'manual' && tenant.plan !== 'free') {
      throw new PlanManagedManuallyError();
    }
    const existing = await this.subscriptions.findByTenant(tenantId);
    if (existing && isLive(existing)) {
      throw new SubscriptionAlreadyActiveError();
    }

    const customerId =
      existing?.stripeCustomerId ?? (await this.createCustomer(billing, tenant));
    const trialDays = tenant.trialUsedAt ? undefined : TRIAL_DAYS;
    const url = await billing.gateway.createCheckoutSession({
      customerId,
      tenantId,
      priceId: priceForPlan(billing.catalog, plan),
      trialDays,
      successUrl: `${billing.publicUrl}/settings/plano?checkout=done`,
      cancelUrl: `${billing.publicUrl}/settings/plano?checkout=canceled`,
    });
    await this.audit(tenantId, actor, 'billing.checkout_started', { plan, trial: Boolean(trialDays) });
    return url;
  }

  async createPortalSession(tenantId: string): Promise<string> {
    const billing = this.requireEnabled();
    await this.requireTenant(tenantId);
    const subscription = await this.subscriptions.findByTenant(tenantId);
    if (!subscription) throw new NoBillingAccountError();
    return billing.gateway.createPortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl: `${billing.publicUrl}/settings/plano`,
    });
  }

  async handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<'processed' | 'duplicate' | 'ignored'> {
    const billing = this.requireEnabled();
    const event = billing.gateway.parseWebhookEvent(rawBody, signature);
    if (await this.events.exists(event.id)) return 'duplicate';
    if (!HANDLED_EVENTS.has(event.type)) return 'ignored';

    const tenantId = await this.resolveTenant(event);
    if (!tenantId) {
      // Esta conta Stripe também atende outro produto: aviso de um cliente
      // que não é nosso responde 200 e não mexe em nada.
      this.logger.info('Aviso do Stripe de um cliente que não é do Francis — ignorado', {
        eventId: event.id,
        type: event.type,
      });
      return 'ignored';
    }

    await this.syncFromStripe(tenantId);
    // Só depois do sucesso: se a reconciliação falhar, o Stripe reenvia.
    await this.events.record({ stripeEventId: event.id, type: event.type, tenantId });
    return 'processed';
  }

  /** Relê a assinatura no Stripe e acerta a linha local e o plano do tenant. */
  async syncFromStripe(tenantId: string): Promise<void> {
    const billing = this.requireEnabled();
    const tenant = await this.tenants.findById(tenantId);
    const local = await this.subscriptions.findByTenant(tenantId);
    if (!tenant || !local) return;

    const current = await billing.gateway.findCurrentSubscription(local.stripeCustomerId);
    const status = current ? toSubscriptionStatus(current.status) : null;
    await this.subscriptions.saveState(tenantId, {
      stripeSubscriptionId: current?.id ?? null,
      plan: current?.priceId ? (planForPrice(billing.catalog, current.priceId) ?? null) : null,
      status,
      trialEndsAt: current?.trialEnd ?? null,
      currentPeriodEnd: current?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: current?.cancelAtPeriodEnd ?? false,
      pastDueSince: status === 'past_due' ? (local.pastDueSince ?? this.now()) : null,
    });

    if (tenant.planSource === 'manual' && tenant.plan !== 'free') {
      this.logger.warn('Aviso do Stripe para um tenant de plano manual — plano mantido', {
        tenantId,
      });
      return;
    }

    const target = planFromSubscription(current, billing.catalog);
    if (target === undefined) {
      this.logger.warn('Assinatura com preço que não está no catálogo — plano mantido', {
        tenantId,
        priceId: current?.priceId,
      });
      return;
    }

    if (current?.trialEnd && !tenant.trialUsedAt) {
      await this.tenants.markTrialUsed(tenantId, this.now());
    }
    if (target !== tenant.plan) {
      await this.tenants.changePlan(tenantId, target, 'self_service');
      await this.audit(tenantId, {}, 'billing.plan_changed', {
        from: tenant.plan,
        to: target,
        source: 'stripe',
      });
    }
  }

  private async resolveTenant(event: GatewayEvent): Promise<string | undefined> {
    if (!event.customerId) return undefined;
    const subscription = await this.subscriptions.findByCustomerId(event.customerId);
    return subscription?.tenantId;
  }

  private async createCustomer(billing: BillingConfig, tenant: Tenant): Promise<string> {
    const customerId = await billing.gateway.createCustomer({ tenantId: tenant.id, name: tenant.name });
    const saved = await this.subscriptions.createForCustomer(tenant.id, customerId);
    return saved.stripeCustomerId;
  }

  private requireEnabled(): BillingConfig {
    if (!this.billing) throw new BillingNotConfiguredError();
    return this.billing;
  }

  private async requireTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);
    return tenant;
  }

  /** Nunca derruba a ação por falha da trilha (mesma política do resto do projeto). */
  private async audit(
    tenantId: string,
    actor: BillingActor,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!this.auditLog) return;
    try {
      await this.auditLog.record({
        tenantId,
        actorUserId: actor.userId,
        action,
        targetType: 'subscription',
        targetId: tenantId,
        metadata,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
    } catch (error) {
      this.logger.warn('Falha ao registrar auditoria da cobrança', { tenantId, action, error });
    }
  }
}

function isLive(subscription: Subscription): boolean {
  return Boolean(subscription.status && ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status));
}
```

(Conferir os campos de `NewAuditLog` — `actorUserId` aceita `undefined`? — e ajustar ao tipo real.)

Run: `npx jest --selectProjects api --testPathPattern "BillingService"` → PASS.

- [ ] **Step 3: Commit** — `feat(billing): billing service — checkout with one trial, portal, webhook reconciled by state`

---

### Task 4: Rotas, webhook, `/admin` e configuração

**Files:**
- Create: `shared/presentation/requireHumanActor.ts`, `services/billing/presentation/{billingRouter,billingWebhookRouter,billingErrorHandler,webhookPath}.ts`, `services/billing/infrastructure/{billingConfig,SubscriptionActiveChecker}.ts`, `services/billing/compositionRoot.ts`, `services/platform/domain/providers/ActiveSubscriptionChecker.ts`, `services/platform/domain/errors/TenantPlanManagedBySubscriptionError.ts`; testes `billingRouter.test.ts`, `billingWebhookRouter.test.ts`, `billingConfig.test.ts`, `requireHumanActor.test.ts`
- Modify: `usersRouter.ts`, `tenantSupportAccessRouter.ts`, `permissions.ts`, `TenantControlService.ts` (+teste), `platformErrorHandler.ts`, `index.ts`, `scripts/deleteTenant.ts`, `deploy/caddy/Caddyfile`, `.env.example`, `.env.prod.example`

**Interfaces:**
- Produces:
  - `requireHumanActor(message: string): RequestHandler` (403 `human_required`)
  - `Permission` ganha `'billing:manage'` (fora de todas as listas — só o `owner`, que tem tudo)
  - `STRIPE_WEBHOOK_PATH = '/billing/stripe/webhook'`
  - `readBillingEnv(env): { enabled: true; secretKey; webhookSecret; catalog; publicUrl } | { enabled: false; missing: string[] }`
  - `createBillingComposition(prisma, logger, tenantRepository)` → `{ billingService, billingRouter, billingErrorHandler, billingWebhookRouter?, activeSubscriptionChecker }`
  - `ActiveSubscriptionChecker { hasActiveSubscription(tenantId): Promise<boolean> }`; `TenantControlService.setActiveSubscriptionChecker(checker)`

- [ ] **Step 1:** `requireHumanActor` compartilhado (com teste: `user` passa; `machine` e `support` → 403 `human_required` com a mensagem dada) e troca das duas cópias locais pela importação (mensagens preservadas). Rodar `usersRouter`/`supportRouters` → verdes.

- [ ] **Step 2:** `'billing:manage'` no tipo `Permission`, com docstring ("só o dono paga; nenhum outro cargo a recebe"). Teste em `permissions.test.ts`: `hasPermission('owner', 'billing:manage')` true; `administrator` false.

- [ ] **Step 3:** rotas (testes supertest primeiro, com `FakeBillingGateway`):

`billingRouter` (montado em `/api/tenants/:tenantId/billing`, atrás de `authenticate`):
- `GET /` → `{ billing: BillingStatus }` (datas em ISO) — qualquer principal do tenant;
- `POST /checkout` `{ plan: 'broadcast' | 'pro' | 'enterprise' }` → `requireHumanActor('Assinar exige login de pessoa.')`, `requirePermission('billing:manage')` → `{ url }`;
- `POST /portal` → mesmos portões → `{ url }`.

`billingErrorHandler`: `BillingNotConfiguredError` 503 `billing_not_configured`; `PlanManagedManuallyError` 409 `plan_managed_manually`; `SubscriptionAlreadyActiveError` 409 `subscription_already_active`; `NoBillingAccountError` 409 `no_billing_account`; `TenantNotFoundError` 404.

`billingWebhookRouter`: `express.raw({ type: 'application/json', limit: '1mb' })`; `service.handleWebhook(req.body, req.header('stripe-signature'))` → 200 `{ received: true }`; `InvalidWebhookSignatureError` → 400 `invalid_signature`; qualquer outro erro → log + 500 (o Stripe reenvia).

Testes do webhook: assinatura inválida → 400 e nada gravado; válida → 200 e plano mudado; repetido → 200 sem reprocessar; erro inesperado do gateway → 500 e evento NÃO registrado.

Testes do router: operator → 403 no checkout; owner → 200 com URL; API key → 403 `human_required`; plano inválido → 400; IDOR (`tenant-2` no caminho com principal do `tenant-1`) → 403.

- [ ] **Step 4:** `readBillingEnv` (teste: tudo presente → `enabled`; faltando qualquer um → lista exata dos nomes que faltam; `BILLING_PUBLIC_URL` perde a barra final) e `createBillingComposition`: com `enabled`, `new StripeBillingGateway(new Stripe(secretKey), webhookSecret)`; senão, serviço sem `billing` e sem `billingWebhookRouter`, e um `console.warn` com os NOMES que faltam (nunca valores).

- [ ] **Step 5:** `/admin` — `TenantControlService.changePlan` consulta o `ActiveSubscriptionChecker` (injetado tarde) ANTES de auditar e lança `TenantPlanManagedBySubscriptionError` (409 `plan_managed_by_subscription`, "Este plano é gerenciado pela assinatura do cliente no Stripe."). Testes: com assinatura ativa → 409, sem auditoria nem escrita; sem checker → comportamento de antes. `SubscriptionActiveChecker` lê `SubscriptionRepository` e devolve `true` para `trialing`/`active`/`past_due`.

- [ ] **Step 6:** `index.ts`:
- o parser JSON global deixa passar o webhook (o Stripe assina o corpo cru):

```ts
import { STRIPE_WEBHOOK_PATH } from './services/billing/presentation/webhookPath';

const jsonParser = express.json({ limit: '256kb' });
app.use((req, res, next) => (req.path === STRIPE_WEBHOOK_PATH ? next() : jsonParser(req, res, next)));
```

- em `mountWhatsAppSessionsRoutes`, logo depois do `tenantRouter`: `createBillingComposition(...)`, `app.use('/api/tenants/:tenantId/billing', authenticate, billing.billingRouter)`, o error handler escopado, `if (billing.billingWebhookRouter) app.use(STRIPE_WEBHOOK_PATH, billing.billingWebhookRouter)` e `platform?.tenantControlService.setActiveSubscriptionChecker(billing.activeSubscriptionChecker)`.

- [ ] **Step 7:** `deleteTenant.ts` — antes de apagar, se a `Subscription` do tenant estiver `TRIALING`/`ACTIVE`/`PAST_DUE`, recusa com "cancele a assinatura no Stripe antes de apagar este tenant"; senão apaga a linha junto com o resto (`subscription` entra na lista de exclusão). `BillingEvent` fica (sem FK, é trilha).

- [ ] **Step 8:** `deploy/caddy/Caddyfile` — rota pública para a API, igual à de `/health`:

```
	@stripe path /billing/stripe/webhook
	handle @stripe {
		reverse_proxy api:4000
	}
```

`.env.example` e `.env.prod.example` — bloco "Cobrança (Stripe, B5)": `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BROADCAST`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`, `BILLING_PUBLIC_URL`, explicando que sem eles a cobrança fica desligada, que em produção vão as chaves `live` de uma chave restrita do Francis, e de onde vem cada valor.

- [ ] **Step 9:** `npx tsc -p apps/api --noEmit && npx jest --selectProjects api && npm run lint -w apps/api` → limpos. Commit — `feat(billing): billing routes, signed Stripe webhook and plan lock for subscribed tenants`

---

### Task 5: Script dos preços no Stripe

**Files:** Create `apps/api/src/scripts/createStripePrices.ts`

- [ ] **Step 1:** Script idempotente por `lookup_key` (`francis_broadcast_monthly`, `francis_pro_monthly`, `francis_enterprise_monthly`), modo simulação por padrão (`--apply` cria), mesmo contrato dos demais scripts. Para cada plano: `prices.list({ lookup_keys: [key], active: true, limit: 1 })`; existindo, só imprime; senão (com `--apply`) cria o produto ("Francis — Disparos" etc.) e o preço (`currency: 'brl'`, `unit_amount`, `recurring: { interval: 'month' }`, `lookup_key`). Imprime apenas as linhas `STRIPE_PRICE_...=price_...` (ids de preço não são segredo) e avisa se a chave for `live` sem `--live` explícito (proteção contra criar preço de produção por engano). Nunca imprime a chave.
- [ ] **Step 2:** `npx tsc -p apps/api --noEmit` limpo. Commit — `feat(billing): script to create the three monthly prices in Stripe`

**Rodar o script com a chave do fundador cria produtos no Stripe dele (modo teste): só com o ok explícito dele.**

---

### Task 6: Aba Plano no painel

**Files:**
- Create: `pages/api/billing/{index,checkout,portal}.ts`, `components/PlanSettingsTab.tsx`, testes `tests/pages/api/billing.test.ts`, `tests-jsdom/components/PlanSettingsTab.test.tsx`
- Modify: `lib/plans.ts`, `lib/landingContent.ts`, `lib/apiClient.ts`, `lib/clientApi.ts`, `components/SettingsSidebar.tsx`, `components/SettingsLayout.tsx`, `pages/settings/[[...section]].tsx`, `components/AtendimentoSettingsTab.tsx`

**Interfaces:**
- Produces:
  - `lib/plans.ts`: `PAID_PLANS`, `PLAN_PRICE_LABEL: Record<TenantPlan, string>` (R$ 0/69/119/249) — a página de venda passa a ler daqui (um preço, um lugar)
  - `clientApi`: `BillingStatus`, `fetchBillingStatus()`, `startCheckout(plan)`, `openBillingPortal()` → `{ url }`
  - `SettingsSectionId` ganha `'plano'` (grupo EMPRESA, todos os cargos)

- [ ] **Step 1:** BFF (testes primeiro): `GET /api/billing`, `POST /api/billing/checkout` (valida `plan` no conjunto pago → 400 antes de chamar a API), `POST /api/billing/portal` — `callBillingApi = createApiClient('billing')`, repassando status e corpo.
- [ ] **Step 2:** `PlanSettingsTab` (testes jsdom primeiro), recebendo `canManage` (dono):
  - cabeçalho: "Plano atual" + nome + linha de situação — Grátis ("Você está no Grátis."), teste ("Teste grátis até DD/MM. A primeira cobrança é feita nesse dia."), ativo ("Próxima cobrança em DD/MM." ou "Cancelamento agendado para DD/MM."), em atraso ("Pagamento em atraso. Atualize o cartão em Gerenciar assinatura."), manual ("Ativado pela equipe do Francis.") — datas em horário de Brasília;
  - três cartões pagos (nome, preço, "1 WhatsApp"/"Até 5 WhatsApps", o que libera), o plano atual marcado "Seu plano";
  - botão por cartão: "Testar 1 dia grátis" (teste disponível) ou "Assinar" — só com `canManage`, cobrança ligada, sem assinatura valendo e sem plano manual pago; "Gerenciar assinatura" quando há assinatura;
  - não dono: "Só o dono da conta assina ou troca de plano.";
  - cobrança desligada: "A assinatura pelo site ainda não está disponível. Para ativar agora, fale com o comercial." com o link do comercial;
  - `?checkout=done`: "Ativando seu plano…" consultando a cada 2s por até 60s até a assinatura aparecer como `trialing`/`active`; então "Plano ativado." e a URL volta a `/settings/plano`; passado o prazo, "A confirmação está demorando — atualize a página em alguns minutos.";
  - `?checkout=canceled`: "Nada foi cobrado. Você pode assinar quando quiser.";
  - clique: chama a rota, e com a URL `window.location.assign(url)`; erro → mensagem da API num `role="alert"`.
- [ ] **Step 3:** `SettingsSidebar` (seção `plano`, ícone `CreditCard`, grupo EMPRESA, logo depois de Atendimento), `SettingsLayout` (título "Plano", descrição "Seu plano, a assinatura e as cobranças.", `<PlanSettingsTab canManage={role === 'owner'} />`), `/settings` envolto em `PlanProvider` (a página de sessão já está dentro de um), e o atalho para o Cérebro da IA em `AtendimentoSettingsTab` escondido quando `useHidesAi()` (pendência da etapa 1).
- [ ] **Step 4:** página de venda lendo `PLAN_PRICE_LABEL`.
- [ ] **Step 5:** `npx tsc -p apps/dashboard --noEmit && npx jest --selectProjects dashboard dashboard-jsdom && npm run lint -w apps/dashboard && npm run build -w apps/dashboard` → limpos. Commit — `feat(dashboard): Plan settings tab with checkout, one-day trial and customer portal`

---

### Task 7: Documentação e verificação ponta a ponta

- [ ] **Step 1:** `CLAUDE.md` §18 (entrada da etapa 2) e `CONTEXT.md` (Billing manual passa a valer só para planos `manual`; termos "Assinatura", "Teste grátis de 1 dia").
- [ ] **Step 2:** Suítes completas, com Postgres e Redis de pé e nenhum aviso de "pulando".
- [ ] **Step 3 (depende do fundador):** ponta a ponta no modo teste do Stripe:
  1. fundador autoriza rodar `createStripePrices --apply` com a chave de teste e cola os três `STRIPE_PRICE_*` no `.env`;
  2. fundador instala a Stripe CLI, faz `stripe login` (login é dele) e roda `stripe listen --forward-to localhost:4000/billing/stripe/webhook`; cola o `whsec_...` em `STRIPE_WEBHOOK_SECRET` e `BILLING_PUBLIC_URL=http://localhost:3000`; reinicia a API;
  3. no navegador (login do fundador): Configurações → Plano → "Testar 1 dia grátis" no Pro → cartão `4242 4242 4242 4242` → volta com "Ativando seu plano…" → "Plano ativado."; conferir no banco `plan=PRO`, `plan_source=SELF_SERVICE`, `trial_used_at` preenchido, `subscriptions.status=TRIALING`;
  4. "Gerenciar assinatura" abre o portal;
  5. `stripe trigger` / cancelamento pelo portal → o plano volta ao Grátis.
- [ ] **Step 4:** Revisão de segurança (rota pública nova + dinheiro) antes do deploy.
- [ ] **Step 5:** Commit — `docs(billing): stage 2 in the project memory and glossary`

---

## Etapa 3 (plano próprio, depois desta)

Tolerância de 3 dias (faixa de atraso para todos os usuários, tarefa `billing-grace` na fila que relê o Stripe e cancela), rotina de descida (`PlanChangeService`: excedentes de WhatsApp desconectados com `detachSession`, disparos pausados com `plan_downgrade`, trilha `billing.plan_changed` com `source`), usada também pelo `/admin`, e o passo a passo de configuração do portal no Stripe.
