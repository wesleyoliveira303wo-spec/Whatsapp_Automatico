# Planos e limites (B5, etapa 1) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o plano Disparos (tudo menos IA), trocar a trava única "pago libera tudo" por recursos (`operation`, `ai`), travar o número de WhatsApps por plano e esconder a IA da tela no Disparos — tudo funcionando com planos ativados à mão, sem Stripe.

**Architecture:** A regra de plano vive num só lugar (`shared/tenant/domain/planCapabilities.ts`), espelhada no painel (`apps/dashboard/lib/plans.ts`). Os seis pontos do servidor que consultam o plano passam a pedir o recurso certo; resumo por IA e geração de mensagens de prospecção ganham a trava de `ai` que não tinham. O limite de WhatsApps é conferido em `WhatsAppSessionService.initSession`. Um campo `Tenant.planSource` (`self_service` | `manual`) prepara as etapas 2 e 3.

**Tech Stack:** Node 20 + Express + Prisma/Postgres 15, Next.js (Pages Router) + React, Jest (projetos `api`, `dashboard`, `dashboard-jsdom`).

**Spec:** `docs/superpowers/specs/2026-09-18-cobranca-stripe-design.md` (§3 e §7, etapa 1).

## Global Constraints

- Planos (código → tela → preço → WhatsApps): `free` Grátis R$ 0 → 1; `broadcast` Disparos R$ 69 → 1; `pro` Pro R$ 119 → 1; `enterprise` Enterprise R$ 249 → 5.
- `operation` liberado em `broadcast`, `pro`, `enterprise`. `ai` liberado só em `pro`, `enterprise`.
- No Disparos, o que exige `ai` **some** da tela. No Grátis, as telas pagas continuam visíveis com o aviso de upgrade (vitrine).
- A trava real é sempre o servidor; o painel só esconde.
- Migrations só aditivas. Enum Postgres: `ADD VALUE` em migration própria.
- Textos na tela em português do Brasil; código e commits em inglês.
- Nada de `:` em `jobId` (usar `buildJobId`).
- Fora desta etapa: Stripe, aba Plano, `/settings` (a aba Atendimento e o resumo do negócio no Perfil ficam para a etapa 2, quando o `/settings` ganhar `PlanProvider`).

---

## Mapa de arquivos

**API (`apps/api/src`)**
- `shared/tenant/domain/TenantPlan.ts` — união ganha `'broadcast'`.
- `shared/tenant/domain/PlanSource.ts` (novo) — `'self_service' | 'manual'`.
- `shared/tenant/domain/planCapabilities.ts` (novo) — `planAllows`, `sessionLimitFor`, `PLAN_CAPABILITY_LABEL`.
- `shared/tenant/domain/errors/PlanDoesNotAllowError.ts` (novo).
- `shared/tenant/domain/planPermiteUso.ts` — **removido** (substituído por `planAllows`).
- `shared/tenant/domain/Tenant.ts`, `TenantRepository.ts`, `infrastructure/PrismaTenantRepository.ts` — `planSource`; `changePlan(id, plan, source)`.
- Seis consumidores: `conversations/application/MessageIngestionService.ts`, `ai/application/AiReplyJobProcessor.ts`, `ai/application/StageClassificationJobProcessor.ts`, `conversations/application/ConversationsService.ts`, `campaigns/application/CampaignService.ts`, `groupBroadcasts/application/GroupBroadcastService.ts`.
- `ai/application/ConversationSummaryService.ts` + `ai/presentation/conversationSummaryErrorHandler.ts` + `index.ts` — trava `ai`.
- `campaigns/application/GenerateLeadMessagesService.ts` + `campaigns/presentation/campaignsRouter.ts` + `campaigns/presentation/campaignsErrorHandler.ts` + `campaigns/compositionRoot.ts` — trava `ai`.
- `whatsapp/application/WhatsAppSessionService.ts`, `whatsapp/domain/errors/WhatsAppSessionLimitReachedError.ts` (novo), `whatsapp/presentation/whatsAppErrorHandler.ts` — limite.
- `platform/application/TenantControlService.ts`, `platform/presentation/platformTenantsRouter.ts`, `platform/domain/tenantSignals.ts`, `platform/infrastructure/repositories/PrismaTenantObservabilityRepository.ts` — `broadcast`.
- `scripts/setTenantPlan.ts` — aceita `broadcast`.

**Banco (`prisma/`)**
- `schema.prisma` — `TenantPlan.BROADCAST`; enum `PlanSource`; `Tenant.planSource`.
- `migrations/20260918120000_add_broadcast_plan/migration.sql`
- `migrations/20260918120100_add_tenant_plan_source/migration.sql`

**Painel (`apps/dashboard`)**
- `lib/plans.ts` (novo) — espelho de `planAllows`/`sessionLimitFor`, `PLAN_LABEL`.
- `lib/clientApi.ts`, `lib/platformClientApi.ts` — `TenantPlan` importado de `lib/plans.ts`.
- `hooks/usePlan.ts`, `contexts/PlanContext.tsx` — `allows`, `hideAi`, `useHidesAi()`.
- Telas: `SessionRail.tsx`, `SessionHeader.tsx`, `ConversationContextPanel.tsx`, `ConversationDetailPanel.tsx`, `ConversationStatusBadge.tsx`, `ConversationListItem.tsx`, `ConversationInbox.tsx`, `pages/sessions/[sessionName]/ai.tsx`.
- Rótulos: `components/admin/TenantControlPanel.tsx`, `pages/admin/tenants.tsx`, `pages/admin/tenants/[tenantId].tsx`, `pages/admin/index.tsx`, `components/ProfileSettingsTab.tsx`.
- Venda: `lib/landingContent.ts`, `components/landing/LandingSections.tsx`.

**Docs**: `CONTEXT.md`, `CLAUDE.md` §18.

---

### Task 1: Plano Disparos no domínio e no banco

**Files:**
- Create: `apps/api/src/shared/tenant/domain/PlanSource.ts`, `apps/api/src/shared/tenant/domain/planCapabilities.ts`, `apps/api/src/shared/tenant/domain/errors/PlanDoesNotAllowError.ts`, `prisma/migrations/20260918120000_add_broadcast_plan/migration.sql`, `prisma/migrations/20260918120100_add_tenant_plan_source/migration.sql`, `apps/api/tests/shared/tenant/planCapabilities.test.ts`
- Modify: `apps/api/src/shared/tenant/domain/TenantPlan.ts`, `Tenant.ts`, `TenantRepository.ts`, `infrastructure/PrismaTenantRepository.ts`, `apps/api/tests/shared/tenant/FakeTenantRepository.ts`, `prisma/schema.prisma`, `apps/api/src/scripts/setTenantPlan.ts`, `apps/api/src/services/platform/domain/tenantSignals.ts`, `apps/api/src/services/platform/infrastructure/repositories/PrismaTenantObservabilityRepository.ts`, `apps/api/src/services/platform/presentation/platformTenantsRouter.ts`
- Test: `apps/api/tests/shared/tenant/planCapabilities.test.ts`, integração em `apps/api/tests/integration/tenantPlanSource.integration.test.ts`

**Interfaces:**
- Produces:
  - `type TenantPlan = 'free' | 'broadcast' | 'pro' | 'enterprise'`
  - `type PlanSource = 'self_service' | 'manual'`
  - `type PlanCapability = 'operation' | 'ai'`
  - `planAllows(plan: TenantPlan, capability: PlanCapability): boolean`
  - `sessionLimitFor(plan: TenantPlan): number`
  - `class PlanDoesNotAllowError extends Error { readonly capability: PlanCapability }`
  - `Tenant.planSource: PlanSource`
  - `TenantRepository.changePlan(id: string, plan: TenantPlan, source: PlanSource): Promise<Tenant | undefined>`

- [ ] **Step 1: Teste da regra de plano**

`apps/api/tests/shared/tenant/planCapabilities.test.ts`:

```ts
import { planAllows, sessionLimitFor } from '../../../src/shared/tenant/domain/planCapabilities';

describe('planAllows', () => {
  it.each([
    ['free', false, false],
    ['broadcast', true, false],
    ['pro', true, true],
    ['enterprise', true, true],
  ] as const)('%s: operation=%s, ai=%s', (plan, operation, ai) => {
    expect(planAllows(plan, 'operation')).toBe(operation);
    expect(planAllows(plan, 'ai')).toBe(ai);
  });
});

describe('sessionLimitFor', () => {
  it.each([
    ['free', 1],
    ['broadcast', 1],
    ['pro', 1],
    ['enterprise', 5],
  ] as const)('%s permite %i WhatsApp(s)', (plan, limit) => {
    expect(sessionLimitFor(plan)).toBe(limit);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --selectProjects api --testPathPattern planCapabilities`
Expected: FAIL — módulo `planCapabilities` não existe.

- [ ] **Step 3: Implementar**

`TenantPlan.ts` — trocar a união e atualizar a docstring:

```ts
/**
 * Plano de um `Tenant` (B5, 2026-09-18 — ver `planCapabilities.ts` e
 * `CONTEXT.md`).
 *
 * `free`       — Grátis: só vê as mensagens chegando (demonstração).
 * `broadcast`  — Disparos: tudo menos IA, 1 número.
 * `pro`        — Pro: uso completo, 1 número.
 * `enterprise` — Enterprise: uso completo, até 5 números.
 *
 * O que cada um libera e quantos números aceita vive SÓ em
 * `planCapabilities.ts`.
 */
export type TenantPlan = 'free' | 'broadcast' | 'pro' | 'enterprise';
```

`PlanSource.ts`:

```ts
/**
 * De onde veio o plano do tenant (B5, 2026-09-18).
 *
 * `self_service` — o próprio cliente assina (ou está no Grátis, podendo
 *   assinar). O Stripe, a partir da etapa 2, manda nele.
 * `manual` — ativado pelo fundador (script ou `/admin`). O Stripe NUNCA
 *   altera um plano manual.
 */
export type PlanSource = 'self_service' | 'manual';
```

`planCapabilities.ts`:

```ts
import { TenantPlan } from './TenantPlan';

/**
 * O que um plano libera — fonte ÚNICA da regra (B5, 2026-09-18; substitui
 * `planPermiteUso`, que só sabia "pago libera tudo").
 *
 * `operation` — responder pela Dashboard, campanhas, disparos em grupos e as
 *   telas de operação (Contatos, Pipeline manual, Tags, Respostas rápidas,
 *   Analytics).
 * `ai` — tudo que chama o provider de IA: resposta automática, classificação
 *   do Pipeline, resumo de conversa, geração de mensagens de prospecção.
 *   É o único custo variável do produto, por isso é o que separa o Disparos
 *   do Pro.
 */
export type PlanCapability = 'operation' | 'ai';

const CAPABILITIES: Record<TenantPlan, ReadonlySet<PlanCapability>> = {
  free: new Set(),
  broadcast: new Set(['operation']),
  pro: new Set(['operation', 'ai']),
  enterprise: new Set(['operation', 'ai']),
};

/** Quantos WhatsApps o plano pode manter conectados (ou com credenciais guardadas). */
const SESSION_LIMITS: Record<TenantPlan, number> = {
  free: 1,
  broadcast: 1,
  pro: 1,
  enterprise: 5,
};

export function planAllows(plan: TenantPlan, capability: PlanCapability): boolean {
  return CAPABILITIES[plan].has(capability);
}

export function sessionLimitFor(plan: TenantPlan): number {
  return SESSION_LIMITS[plan];
}
```

`errors/PlanDoesNotAllowError.ts`:

```ts
import { PlanCapability } from '../planCapabilities';

const MESSAGES: Record<PlanCapability, string> = {
  operation: 'Este recurso faz parte dos planos pagos (Disparos, Pro ou Enterprise).',
  ai: 'Os recursos de IA fazem parte dos planos Pro e Enterprise.',
};

/**
 * O plano do tenant não libera o recurso pedido (B5). Traduzido para 403
 * `plan_does_not_allow` pelos error handlers — mesmo espírito dos erros de
 * plano já existentes (`CampaignRequiresPaidPlanError` etc.).
 */
export class PlanDoesNotAllowError extends Error {
  constructor(readonly capability: PlanCapability) {
    super(MESSAGES[capability]);
    this.name = 'PlanDoesNotAllowError';
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest --selectProjects api --testPathPattern planCapabilities`
Expected: PASS (8 casos).

- [ ] **Step 5: Schema e migrations**

`prisma/schema.prisma`:
- no `enum TenantPlan`, depois de `FREE`: `BROADCAST`;
- novo enum logo abaixo:

```prisma
enum PlanSource {
  SELF_SERVICE
  MANUAL

  @@map("plan_source")
}
```

- no `model Tenant`, depois de `plan`:

```prisma
  /// De onde veio o plano (B5, 2026-09-18) — ver `PlanSource.ts`.
  planSource PlanSource @default(SELF_SERVICE) @map("plan_source")
```

`prisma/migrations/20260918120000_add_broadcast_plan/migration.sql`:

```sql
-- B5 (2026-09-18): plano Disparos. Migration própria porque um valor novo de
-- enum não pode ser usado na mesma transação que o criou.
ALTER TYPE "tenant_plan" ADD VALUE IF NOT EXISTS 'BROADCAST' AFTER 'FREE';
```

`prisma/migrations/20260918120100_add_tenant_plan_source/migration.sql`:

```sql
-- B5 (2026-09-18): origem do plano. Tenants pagos existentes foram ativados à
-- mão pelo fundador, então nascem MANUAL; os Grátis ficam SELF_SERVICE e
-- poderão assinar sozinhos na etapa 2.
CREATE TYPE "plan_source" AS ENUM ('SELF_SERVICE', 'MANUAL');

ALTER TABLE "tenants"
  ADD COLUMN "plan_source" "plan_source" NOT NULL DEFAULT 'SELF_SERVICE';

UPDATE "tenants" SET "plan_source" = 'MANUAL' WHERE "plan" <> 'FREE';
```

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: duas migrations aplicadas.

- [ ] **Step 6: Entidade, porta, Prisma e dublê**

`Tenant.ts` — acrescentar ao final da interface:

```ts
  /**
   * De onde veio o plano (B5, ver `PlanSource`). Sempre presente — coluna
   * `NOT NULL DEFAULT 'SELF_SERVICE'`.
   */
  planSource: PlanSource;
```

(com `import { PlanSource } from './PlanSource';`)

`TenantRepository.ts` — trocar a assinatura:

```ts
  changePlan(id: string, plan: TenantPlan, source: PlanSource): Promise<Tenant | undefined>;
```

`PrismaTenantRepository.ts`:
- `PLAN_TO_DOMAIN`/`PLAN_TO_PRISMA` ganham `BROADCAST: 'broadcast'` / `broadcast: 'BROADCAST'`;
- mapas novos:

```ts
const SOURCE_TO_DOMAIN: Record<PrismaPlanSource, PlanSource> = {
  SELF_SERVICE: 'self_service',
  MANUAL: 'manual',
};

const SOURCE_TO_PRISMA: Record<PlanSource, PrismaPlanSource> = {
  self_service: 'SELF_SERVICE',
  manual: 'MANUAL',
};
```

- `TenantRow` ganha `planSource: PrismaPlanSource`; `toDomain` devolve `planSource: SOURCE_TO_DOMAIN[row.planSource]`;
- `changePlan`:

```ts
  async changePlan(id: string, plan: TenantPlan, source: PlanSource): Promise<Tenant | undefined> {
    return this.applyUpdate(id, { plan: PLAN_TO_PRISMA[plan], planSource: SOURCE_TO_PRISMA[source] });
  }
```

- `applyUpdate` aceita `planSource?: PrismaPlanSource` no `data`.

`FakeTenantRepository.ts`: `create` devolve `planSource: 'self_service'`; `changePlan(id, plan, source)` faz `patch(id, { plan, planSource: source })`; `seed` aceita `planSource?` e, omitido, usa `'manual'` quando o plano for pago e `'self_service'` no Grátis:

```ts
  seed(
    tenant: Omit<Tenant, 'plan' | 'status' | 'planSource'> & {
      plan?: TenantPlan;
      status?: TenantStatus;
      planSource?: PlanSource;
    },
  ): void {
    const plan = tenant.plan ?? 'pro';
    this.tenants.set(tenant.id, {
      ...tenant,
      plan,
      status: tenant.status ?? 'active',
      planSource: tenant.planSource ?? (plan === 'free' ? 'self_service' : 'manual'),
    });
  }
```

- [ ] **Step 7: Listas fechadas de plano no `/admin` e no script**

- `platformTenantsRouter.ts`: `plan: z.enum(['free', 'broadcast', 'pro', 'enterprise'])`.
- `PrismaTenantObservabilityRepository.ts`: `PLAN_TO_DOMAIN` ganha `BROADCAST: 'broadcast'`; `byPlan` inicia `{ free: 0, broadcast: 0, pro: 0, enterprise: 0 }`.
- `tenantSignals.ts`: preços derivados de R$ 0/69/119/249 a R$ 5,50/US$ e docstring atualizada:

```ts
export const PLAN_MONTHLY_PRICE_USD: Record<TenantPlan, number> = {
  free: 0,
  broadcast: 12.5,
  pro: 21.6,
  enterprise: 45.3,
};
```

- `setTenantPlan.ts`: `PLAN_BY_ARG` ganha `broadcast: 'BROADCAST'`; mensagens de uso citam `free|broadcast|pro|enterprise`; o `update` grava também `planSource: targetPlan === 'FREE' ? 'SELF_SERVICE' : 'MANUAL'`.

- [ ] **Step 8: Integração contra Postgres real**

`apps/api/tests/integration/tenantPlanSource.integration.test.ts` (mesmo guard "Postgres indisponível — pulando" dos demais testes de integração):

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaTenantRepository } from '../../src/shared/tenant/infrastructure/PrismaTenantRepository';

jest.setTimeout(30_000);

describe('Tenant.planSource e plano Disparos (Postgres real)', () => {
  const prisma = new PrismaClient();
  const repo = new PrismaTenantRepository(prisma);
  let available = true;
  const created: string[] = [];

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      available = false;
      // eslint-disable-next-line no-console
      console.warn('Postgres indisponível — pulando teste de integração real.');
    }
  });

  afterAll(async () => {
    if (available && created.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: created } } });
    }
    await prisma.$disconnect();
  });

  it('tenant novo nasce self_service no Grátis', async () => {
    if (!available) return;
    const tenant = await repo.create({ name: 'plan-source-it-novo' });
    created.push(tenant.id);
    expect(tenant.plan).toBe('free');
    expect(tenant.planSource).toBe('self_service');
  });

  it('grava o plano Disparos com a origem informada', async () => {
    if (!available) return;
    const tenant = await repo.create({ name: 'plan-source-it-disparos' });
    created.push(tenant.id);
    const updated = await repo.changePlan(tenant.id, 'broadcast', 'manual');
    expect(updated?.plan).toBe('broadcast');
    expect(updated?.planSource).toBe('manual');
  });
});
```

Run: `npx jest --selectProjects api --testPathPattern "tenantPlanSource|planCapabilities|PrismaTenantRepository"`
Expected: PASS, sem aviso "pulando".

- [ ] **Step 9: Compilar (os consumidores de `planPermiteUso` quebram de propósito — são a Task 2)**

Run: `npx tsc -p apps/api --noEmit`
Expected: erros SÓ nos arquivos que ainda importam `planPermiteUso` ou chamam `changePlan` com 2 argumentos. Não remover `planPermiteUso.ts` nesta task; ele sai na Task 2.

- [ ] **Step 10: Commit**

```bash
git add prisma apps/api/src/shared/tenant apps/api/tests/shared/tenant apps/api/tests/integration/tenantPlanSource.integration.test.ts apps/api/src/scripts/setTenantPlan.ts apps/api/src/services/platform
git commit -m "feat(plans): add the Disparos plan, plan capabilities and plan source"
```

---

### Task 2: Seis travas por recurso + IA travada no resumo e na prospecção

**Files:**
- Modify: `MessageIngestionService.ts`, `AiReplyJobProcessor.ts`, `StageClassificationJobProcessor.ts`, `ConversationsService.ts`, `CampaignService.ts`, `GroupBroadcastService.ts`, `ConversationSummaryService.ts`, `conversationSummaryErrorHandler.ts`, `GenerateLeadMessagesService.ts`, `campaignsRouter.ts`, `campaignsErrorHandler.ts`, `campaigns/compositionRoot.ts`, `index.ts`, `TenantControlService.ts`, erros de plano de campanha/grupos/resposta (textos)
- Delete: `apps/api/src/shared/tenant/domain/planPermiteUso.ts`
- Test: testes existentes de cada serviço + casos novos listados abaixo

**Interfaces:**
- Consumes: `planAllows`, `PlanDoesNotAllowError`, `changePlan(id, plan, source)` (Task 1)
- Produces:
  - `ConversationSummaryService` — 8º parâmetro opcional `tenantRepository?: TenantRepository`
  - `GenerateLeadMessagesService(aiProvider?, tenantRepository?)`, `generate(tenantId: string, leads: EnrichedLead[])`

- [ ] **Step 1: Testes novos (falhando)**

Em cada arquivo de teste já existente, acrescentar:

- `MessageIngestionService.test.ts` — "plano Disparos: NÃO agenda resposta de IA" (seed `plan: 'broadcast'`, mensagem inbound em conversa `bot`, espera `aiReplyScheduler.scheduleCalls` vazio);
- `AiReplyJobProcessor.test.ts` — "plano Disparos: re-checagem descarta o job" (`tenantPlanRepository` com `broadcast`, espera `generateReplyCalls` vazio);
- `StageClassificationJobProcessor.test.ts` — "plano Disparos: não classifica" (espera `'skipped'`);
- `ConversationsService.test.ts` — "plano Disparos: responde pela Dashboard" (não lança);
- `CampaignService.test.ts` — "plano Disparos: dispara campanha";
- `GroupBroadcastService.test.ts` — "plano Disparos: inicia disparo em grupos";
- `ConversationSummaryService.test.ts` — "plano Disparos: recusa com PlanDoesNotAllowError('ai') e não chama o provider";
- `GenerateLeadMessagesService.test.ts` — "plano Disparos: recusa com PlanDoesNotAllowError('ai')" e as chamadas antigas passam a `generate('tenant-1', leads)`;
- `TenantControlService.test.ts` — "plano pago grava origem manual; voltar ao Grátis grava self_service".

Modelo (resumo):

```ts
it('plano Disparos: recusa com PlanDoesNotAllowError("ai") e não chama o provider', async () => {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 'tenant-1', name: 'T', apiKeyHash: null, plan: 'broadcast' });
  const provider = new FakeAiProvider();
  const sut = buildSut({ tenantRepository: tenants, aiProvider: provider });

  await expect(sut.generateSummary('tenant-1', 'conversation-1')).rejects.toMatchObject({
    name: 'PlanDoesNotAllowError',
    capability: 'ai',
  });
  expect(provider.generateReplyCalls).toHaveLength(0);
});
```

Run: `npx jest --selectProjects api --testPathPattern "MessageIngestionService|AiReplyJobProcessor|StageClassificationJobProcessor|ConversationsService|CampaignService|GroupBroadcastService|ConversationSummaryService|GenerateLeadMessagesService|TenantControlService"`
Expected: FAIL nos casos novos.

- [ ] **Step 2: Trocar os seis pontos**

Import em cada um: `import { planAllows } from '../../../shared/tenant/domain/planCapabilities';`

| Arquivo | Antes | Depois |
|---|---|---|
| `MessageIngestionService.ts` | `planPermiteUso(await this.tenantPlanRepository.getPlan(message.tenantId))` | `planAllows(await this.tenantPlanRepository.getPlan(message.tenantId), 'ai')` |
| `AiReplyJobProcessor.ts` | `planPermiteUso(await this.tenantPlanRepository.getPlan(data.tenantId))` | `planAllows(await this.tenantPlanRepository.getPlan(data.tenantId), 'ai')` |
| `StageClassificationJobProcessor.ts` | `planPermiteUso(await this.tenantPlanRepository.getPlan(tenantId))` | `planAllows(await this.tenantPlanRepository.getPlan(tenantId), 'ai')` |
| `ConversationsService.ts` | `!planPermiteUso(tenant.plan)` | `!planAllows(tenant.plan, 'operation')` |
| `CampaignService.ts` | `!planPermiteUso(tenant.plan)` | `!planAllows(tenant.plan, 'operation')` |
| `GroupBroadcastService.ts` | `!planPermiteUso(tenant.plan)` | `!planAllows(tenant.plan, 'operation')` |

Atualizar as docstrings/logs que dizem "Plano Grátis" para "plano sem operação" e as mensagens dos três erros de plano:
- `AgentReplyRequiresPaidPlanError`: "Responder pela Dashboard faz parte dos planos pagos (Disparos, Pro ou Enterprise)."
- `CampaignRequiresPaidPlanError`: "Disparar campanhas faz parte dos planos pagos (Disparos, Pro ou Enterprise)."
- `GroupBroadcastRequiresPaidPlanError`: mesma frase, "Publicar em grupos".

Apagar `planPermiteUso.ts` e conferir: `grep -rn planPermiteUso apps/api/src` → vazio.

- [ ] **Step 3: Resumo por IA**

`ConversationSummaryService.ts` — novo último parâmetro e checagem logo no início de `generateSummary`, antes de ler a conversa:

```ts
    private readonly historyLimit: number = DEFAULT_SUMMARY_HISTORY_LIMIT,
    /**
     * B5 (2026-09-18) — trava de `ai`. Opcional: sem ele, não há trava
     * (testes antigos e modo degradado). Em produção sempre vem de `index.ts`.
     */
    private readonly tenantRepository?: TenantRepository,
```

```ts
    if (this.tenantRepository) {
      const tenant = await this.tenantRepository.findById(tenantId);
      if (tenant && !planAllows(tenant.plan, 'ai')) {
        throw new PlanDoesNotAllowError('ai');
      }
    }
```

`index.ts` — passar `undefined` no `historyLimit` e o `tenantRepository` já existente no escopo. `conversationSummaryErrorHandler.ts` — antes do caso `ConversationSummaryUnavailableError`:

```ts
    if (error instanceof PlanDoesNotAllowError) {
      res.status(403).json({ error: 'plan_does_not_allow', message: error.message });
      return;
    }
```

- [ ] **Step 4: Mensagens de prospecção**

`GenerateLeadMessagesService.ts`:

```ts
  constructor(
    private readonly aiProvider?: AiProvider,
    private readonly tenantRepository?: TenantRepository,
  ) {}

  async generate(tenantId: string, leads: EnrichedLead[]): Promise<GenerateLeadMessagesResult> {
    if (this.tenantRepository) {
      const tenant = await this.tenantRepository.findById(tenantId);
      if (tenant && !planAllows(tenant.plan, 'ai')) {
        throw new PlanDoesNotAllowError('ai');
      }
    }
    // ...corpo atual inalterado...
```

`campaigns/compositionRoot.ts`: `new GenerateLeadMessagesService(leadMessageAiProvider, tenantRepository)`. `campaignsRouter.ts`: `generateLeadMessagesService.generate(params.tenantId, body.leads)`. `campaignsErrorHandler.ts`: mesmo bloco 403 `plan_does_not_allow`.

- [ ] **Step 5: `/admin` grava a origem**

`TenantControlService.changePlan`: `const source: PlanSource = plan === 'free' ? 'self_service' : 'manual';` e `this.tenants.changePlan(tenantId, plan, source)`; `metadata: { from: tenant.plan, to: plan, source }`.

- [ ] **Step 6: Rodar tudo da API**

Run: `npx tsc -p apps/api --noEmit && npx jest --selectProjects api`
Expected: tsc limpo; suíte verde (com Postgres/Redis de pé, sem avisos de "pulando").

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(plans): gate each feature by capability instead of paid-or-not"
```

---

### Task 3: Limite de WhatsApps por plano

**Files:**
- Create: `apps/api/src/services/whatsapp/domain/errors/WhatsAppSessionLimitReachedError.ts`
- Modify: `WhatsAppSessionService.ts`, `whatsAppErrorHandler.ts`
- Test: `apps/api/tests/services/whatsapp/application/WhatsAppSessionService.test.ts`

**Interfaces:**
- Consumes: `sessionLimitFor` (Task 1)
- Produces: `class WhatsAppSessionLimitReachedError extends Error { readonly limit: number }` → 409 `session_limit_reached`

- [ ] **Step 1: Testes (falhando)**

No teste do serviço (usa os dublês já existentes de registry, repositório de sessões e `CredentialsStore`):

- "Pro com 1 WhatsApp com credenciais: conectar um 2º é recusado (409 session_limit_reached)";
- "Pro: reconectar o MESMO WhatsApp que já ocupa a vaga é permitido";
- "Enterprise com 4 ocupados: conectar o 5º é permitido";
- "sessão desconectada e sem credenciais não ocupa vaga".

```ts
it('Pro com 1 WhatsApp ocupando vaga: conectar um 2º é recusado', async () => {
  const { service, tenants, sessionRepository, credentialsStore } = buildSut();
  tenants.seed({ id: 'tenant-1', name: 'T', apiKeyHash: null, plan: 'pro' });
  await sessionRepository.upsert(buildSession({ tenantId: 'tenant-1', sessionName: 'vendas' }));
  await credentialsStore.set('tenant-1', buildWhatsAppCredentialsNamespace('vendas'), 'creds', '{}');

  await expect(service.initSession('tenant-1', 'suporte')).rejects.toMatchObject({
    name: 'WhatsAppSessionLimitReachedError',
    limit: 1,
  });
});
```

(Usar os helpers/nomes de método reais do arquivo de teste existente para criar sessão no repositório falso.)

- [ ] **Step 2: Implementar**

`WhatsAppSessionLimitReachedError.ts`:

```ts
/**
 * O plano do tenant já ocupa todas as vagas de WhatsApp (B5, 2026-09-18).
 * 409: o pedido é válido, mas o estado da conta não permite.
 */
export class WhatsAppSessionLimitReachedError extends Error {
  constructor(readonly limit: number) {
    super(
      limit === 1
        ? 'Seu plano permite 1 WhatsApp conectado. Para conectar outro, mude de plano.'
        : `Seu plano permite até ${limit} WhatsApps conectados. Para conectar outro, mude de plano.`,
    );
    this.name = 'WhatsAppSessionLimitReachedError';
  }
}
```

`WhatsAppSessionService.initSession` — trocar `await this.assertTenantExists(tenantId);` por:

```ts
    const tenant = await this.assertTenantExists(tenantId);
    await this.assertSessionSlotAvailable(tenant, sessionName);
```

(`assertTenantExists` passa a devolver o `Tenant`, se ainda não devolve.) Novos privados:

```ts
  /**
   * Limite de WhatsApps por plano (B5, 2026-09-18). Uma sessão OCUPA VAGA
   * quando está conectada/conectando ao vivo ou tem credenciais guardadas
   * (poderia se reconectar sozinha). Reconectar a mesma sessão nunca é
   * barrado; só uma sessão NOVA na vaga, quando todas estão ocupadas.
   */
  private async assertSessionSlotAvailable(tenant: Tenant, sessionName: string): Promise<void> {
    if (await this.occupiesSlot(tenant.id, sessionName)) {
      return;
    }
    const limit = sessionLimitFor(tenant.plan);
    const sessions = await this.sessionRepository.findAllByTenant(tenant.id);
    let occupied = 0;
    for (const session of sessions) {
      if (session.sessionName === sessionName) continue;
      // eslint-disable-next-line no-await-in-loop
      if (await this.occupiesSlot(tenant.id, session.sessionName)) occupied += 1;
    }
    if (occupied >= limit) {
      throw new WhatsAppSessionLimitReachedError(limit);
    }
  }

  private async occupiesSlot(tenantId: string, sessionName: string): Promise<boolean> {
    const live = this.registry.peek(tenantId, sessionName);
    if (live) {
      try {
        const { status } = await live.getStatus();
        if (status === 'connected' || status === 'connecting') return true;
      } catch {
        // Dessincronia rara (sessão removida no meio): cai para as credenciais.
      }
    }
    const creds = await this.credentialsStore.get(
      tenantId,
      buildWhatsAppCredentialsNamespace(sessionName),
      'creds',
    );
    return creds !== null;
  }
```

`whatsAppErrorHandler.ts`:

```ts
    if (error instanceof WhatsAppSessionLimitReachedError) {
      res.status(409).json({ error: 'session_limit_reached', message: error.message });
      return;
    }
```

- [ ] **Step 3: Rodar**

Run: `npx jest --selectProjects api --testPathPattern "WhatsAppSessionService|whatsAppSessionsRouter"`
Expected: PASS.

- [ ] **Step 4: Painel mostra a mensagem**

Conferir em `apps/dashboard/components/CreateSessionForm.tsx` como o erro da API chega ao usuário. Se já mostra `message` do corpo, nada muda; se mostra texto fixo, passar a mostrar `message` quando `error === 'session_limit_reached'`. Teste jsdom correspondente no arquivo de teste existente do formulário.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/whatsapp apps/api/tests/services/whatsapp apps/dashboard/components/CreateSessionForm.tsx apps/dashboard/tests-jsdom
git commit -m "feat(plans): limit connected WhatsApps per plan"
```

---

### Task 4: Regra de plano no painel e IA escondida no Disparos

**Files:**
- Create: `apps/dashboard/lib/plans.ts`, `apps/dashboard/tests/lib/plans.test.ts`
- Modify: `lib/clientApi.ts`, `lib/platformClientApi.ts`, `hooks/usePlan.ts`, `contexts/PlanContext.tsx`, `components/SessionRail.tsx`, `components/SessionHeader.tsx`, `components/ConversationContextPanel.tsx`, `components/ConversationDetailPanel.tsx`, `components/ConversationStatusBadge.tsx`, `components/ConversationListItem.tsx`, `components/ConversationInbox.tsx`, `pages/sessions/[sessionName]/ai.tsx`, `components/admin/TenantControlPanel.tsx`, `pages/admin/tenants.tsx`, `pages/admin/tenants/[tenantId].tsx`, `pages/admin/index.tsx`, `components/ProfileSettingsTab.tsx`
- Test: `tests/lib/plans.test.ts`, jsdom de `SessionRail`, `ConversationStatusBadge`, `ConversationListItem`, `ConversationContextPanel`, `TenantControlPanel`

**Interfaces:**
- Produces:
  - `lib/plans.ts`: `TenantPlan`, `PlanCapability`, `PLAN_LABEL: Record<TenantPlan, string>`, `PLAN_ORDER: TenantPlan[]`, `planAllows(plan, capability)`, `sessionLimitFor(plan)`
  - `UsePlanResult` ganha `allows(capability): boolean` e `hideAi: boolean`
  - `useHidesAi(): boolean` (tolerante, em `PlanContext.tsx`)
  - `ConversationStatusBadge` e `ConversationListItem` ganham `aiAvailable?: boolean` (default `true`)

- [ ] **Step 1: Teste da regra espelhada (falhando)**

`apps/dashboard/tests/lib/plans.test.ts` — mesma tabela do teste da API (Task 1, Step 1), importando de `../../lib/plans`, mais:

```ts
it('rótulos na ordem de venda', () => {
  expect(PLAN_ORDER.map((p) => PLAN_LABEL[p])).toEqual(['Grátis', 'Disparos', 'Pro', 'Enterprise']);
});
```

- [ ] **Step 2: `lib/plans.ts`**

```ts
/**
 * Espelho no painel da regra de plano do servidor
 * (`apps/api/src/shared/tenant/domain/planCapabilities.ts`, B5 2026-09-18).
 * Só decide o que MOSTRAR — quem trava de verdade é a API.
 */
export type TenantPlan = 'free' | 'broadcast' | 'pro' | 'enterprise';
export type PlanCapability = 'operation' | 'ai';

export const PLAN_ORDER: TenantPlan[] = ['free', 'broadcast', 'pro', 'enterprise'];

export const PLAN_LABEL: Record<TenantPlan, string> = {
  free: 'Grátis',
  broadcast: 'Disparos',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const CAPABILITIES: Record<TenantPlan, ReadonlyArray<PlanCapability>> = {
  free: [],
  broadcast: ['operation'],
  pro: ['operation', 'ai'],
  enterprise: ['operation', 'ai'],
};

const SESSION_LIMITS: Record<TenantPlan, number> = { free: 1, broadcast: 1, pro: 1, enterprise: 5 };

export function planAllows(plan: TenantPlan, capability: PlanCapability): boolean {
  return CAPABILITIES[plan].includes(capability);
}

export function sessionLimitFor(plan: TenantPlan): number {
  return SESSION_LIMITS[plan];
}
```

`clientApi.ts` e `platformClientApi.ts`: trocar a declaração local de `TenantPlan` por `export type { TenantPlan } from './plans';`. `pages/admin/index.tsx`: a linha de totais passa a listar os quatro planos pelo `PLAN_ORDER`/`PLAN_LABEL`. Os quatro `PLAN_LABEL` locais (`TenantControlPanel.tsx`, `pages/admin/tenants.tsx`, `pages/admin/tenants/[tenantId].tsx`, `ProfileSettingsTab.tsx` — este mantém só as classes de cor, o texto vem de `PLAN_LABEL`) passam a importar de `lib/plans.ts`; `TenantControlPanel` usa `PLAN_ORDER` no lugar de `PLANS`.

- [ ] **Step 3: `usePlan` e o contexto**

`usePlan.ts` — o retorno passa a:

```ts
  const resolved = !loading && plan !== null;
  return {
    plan,
    isFree: resolved && plan === 'free',
    isPaid: resolved && plan !== 'free',
    allows: (capability: PlanCapability) => (plan ? planAllows(plan, capability) : true),
    // No Grátis as telas pagas continuam visíveis (vitrine, com aviso de
    // upgrade); só um plano PAGO sem IA esconde a IA.
    hideAi: resolved && plan !== 'free' && !planAllows(plan as TenantPlan, 'ai'),
    loading,
  };
```

(Durante o carregamento `allows` devolve `true` e `hideAi` é `false`: a tela nunca some por engano enquanto o plano não chegou.) `UsePlanResult` ganha `allows` e `hideAi`.

`PlanContext.tsx` — ao lado de `useIsFreePlan`:

```ts
/** Tolerante como `useIsFreePlan`: sem `PlanProvider` (teste de unidade), nunca esconde. */
export function useHidesAi(): boolean {
  return useContext(PlanContext)?.hideAi ?? false;
}
```

- [ ] **Step 4: Esconder a IA (testes jsdom primeiro, depois o código)**

Testes novos (falhando), cada um montando o componente dentro de um `PlanContext` com `hideAi: true`:
- `SessionRail`: não mostra o item "IA";
- `ConversationStatusBadge` com `aiAvailable={false}`: `status: 'bot'` não renderiza nada; `status: 'human'` mostra "Humano"; nunca "IA desativada";
- `ConversationListItem` com `aiAvailable={false}`: não mostra "Bot" nem "IA desativada";
- `ConversationContextPanel` com `hideAi`: não mostra o resumo por IA nem "Últimas interações".

Código:
- `SessionRail.tsx`: `const hideAi = useHidesAi();` e, no `map`, `if (hideAi && href.endsWith('/ai')) return null;`.
- `SessionHeader.tsx`: `{!hideAi && <AiPowerToggle />}`.
- `ConversationContextPanel.tsx`: resumo só quando `!hideAi`; o bloco `<details>` "Últimas interações" só quando `!hideAi`; `useAiInteractions(hideAi ? null : conversationId, ...)` para não buscar à toa.
- `ConversationDetailPanel.tsx`: `useAiInteractions(hideAi ? null : conversationId)`; `ConversationStatusBadge` recebe `aiAvailable={!hideAi}`.
- `ConversationStatusBadge.tsx`: prop `aiAvailable?: boolean` (default `true`); quando `false`, ignora `aiEnabled`, e `status === 'bot'` sem `escalatedAt` devolve `null` (tipo de retorno `JSX.Element | null`).
- `ConversationListItem.tsx`: prop `aiAvailable?: boolean` (default `true`); quando `false`, o rótulo de status só aparece para `human` ("Humano").
- `ConversationInbox.tsx`: `const hideAi = useHidesAi();` e passa `aiAvailable={!hideAi}` a cada `ConversationListItem`.
- `pages/sessions/[sessionName]/ai.tsx`: no componente da página, `const { hideAi } = usePlanContext(); useEffect(() => { if (hideAi) void router.replace(`/sessions/${encodeURIComponent(sessionName)}/conversations`); }, [hideAi]);` e, enquanto `hideAi`, renderiza nada.

- [ ] **Step 5: Rodar o painel**

Run: `npx tsc -p apps/dashboard --noEmit && npx jest --selectProjects dashboard dashboard-jsdom`
Expected: limpo e verde.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard
git commit -m "feat(dashboard): mirror plan capabilities and hide AI on the Disparos plan"
```

---

### Task 5: Página de venda e glossário

**Files:**
- Modify: `apps/dashboard/lib/landingContent.ts`, `apps/dashboard/components/landing/LandingSections.tsx`, `CONTEXT.md`, `CLAUDE.md`
- Test: jsdom da landing, se existir (`tests-jsdom/**/Landing*`); senão, conferir no `next build`

- [ ] **Step 1: Conteúdo dos planos**

`landingContent.ts` — `PLANOS` passa a ter `plans: [...]` na ordem Grátis, Disparos, Pro, Enterprise (em vez de chaves soltas), preços R$ 0/69/119/249, e o Disparos:

```ts
    {
      id: 'broadcast',
      name: 'Disparos',
      price: 'R$ 69',
      period: '/ mês',
      tagline: 'Dispare para contatos e grupos e atenda você mesmo, sem IA.',
      features: [
        '1 número de WhatsApp',
        'Disparos para contatos e para grupos',
        'Responda seus clientes pela Dashboard',
        'Contatos, Pipeline, tags, respostas rápidas e Analytics',
      ],
      cta: 'Criar conta grátis',
      ctaNote: 'Crie a conta no Grátis e chame o comercial no WhatsApp (21) 98292-5941 para ativar o Disparos.',
    },
```

O Pro mantém `highlight: true`. `title`: "Comece grátis. Escolha o plano quando quiser.".

- [ ] **Step 2: Um cartão, quatro planos**

`LandingSections.tsx` — os três blocos de cartão escritos à mão viram um `PlanCard` interno mapeado sobre `PLANOS.plans`; a grade passa a `sm:grid-cols-2 lg:grid-cols-4` (regra 9: nada de rolagem horizontal).

- [ ] **Step 3: Glossário**

`CONTEXT.md`, seção "Planos e monetização": acrescentar **Plano Disparos** (`broadcast`, R$ 69, 1 número, tudo menos IA), atualizar Pro (R$ 119) e Enterprise (R$ 249), reescrever **Trava de plano** para os dois recursos (`operation`, `ai`) e o limite de números travado pelo sistema, e marcar "Período de teste grátis", "Tolerância de atraso" e "Ativação manual" como substituídos pela spec `2026-09-18-cobranca-stripe-design.md` (valem até a etapa 2 ir ao ar).

`CLAUDE.md` §18: entrada nova "B5, etapa 1 — plano Disparos, trava por recurso e limite de WhatsApps".

- [ ] **Step 4: Verificação final**

Run: `npx tsc -p apps/api --noEmit && npx tsc -p apps/dashboard --noEmit && npx jest && npm run lint -w apps/api && npm run lint -w apps/dashboard && npm run build -w apps/dashboard`
Expected: tudo verde, com Postgres e Redis de pé (sem avisos de "pulando").

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/landingContent.ts apps/dashboard/components/landing CONTEXT.md CLAUDE.md
git commit -m "docs(plans): new plan prices on the landing page and in the glossary"
```
