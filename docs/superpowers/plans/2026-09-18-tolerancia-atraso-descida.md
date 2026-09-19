# Tolerância de atraso e descida de plano (B5, etapa 3) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando a cobrança de uma assinatura falha, o tenant tem 3 dias de tolerância (avisado por uma faixa no topo) antes da assinatura ser cancelada no Stripe e o plano voltar sozinho para Grátis — com uma rotina única de descida (excedente de WhatsApp desconectado com credenciais apagadas, disparos em execução pausados) usada tanto por esse caminho quanto por qualquer outra descida de plano (portal do cliente, `/admin`).

**Architecture:** Continua tudo em `services/billing` (etapa 2). `BillingService.syncFromStripe` já é o único lugar que muda `Tenant.plan` — ganha uma chamada a `PlanChangeService.applyIfDowngrade` sempre que o plano novo for menor que o atual. A tolerância de 3 dias é um job atrasado na fila nova `billing-grace` (BullMQ, mesmo padrão de `stage-classify`): agendado por `syncFromStripe` na primeira vez que a assinatura entra em atraso, e que, ao rodar, relê o Stripe e cancela a assinatura se ainda estiver em atraso — o cancelamento gera `customer.subscription.deleted`, que volta pelo MESMO caminho de sempre (webhook → `syncFromStripe` → `PlanChangeService`). Um único caminho de descida, qualquer que seja a causa.

**Tech Stack:** Node 20 + Express + Prisma/Postgres 15, BullMQ + Redis, `stripe@22`, Next.js Pages Router, Jest.

**Spec:** `docs/superpowers/specs/2026-09-18-cobranca-stripe-design.md` (§5, §6.1, §7 item 3). Etapas 1/2 prontas: `docs/superpowers/plans/2026-09-18-planos-e-limites.md`, `docs/superpowers/plans/2026-09-18-assinatura-stripe.md`.

## Global Constraints

- **Zero migration.** `Subscription.pastDueSince` já existe (etapa 2); `Campaign.pausedReason`/`GroupBroadcast.pausedReason` já são `String?` livre — `'plan_downgrade'` não pede schema novo.
- **Estado, não evento** (regra já em vigor): a descida nunca é chamada diretamente por um tipo de aviso específico — só por `syncFromStripe` comparando plano atual × plano-alvo recém-lido do Stripe.
- **`billing-grace` relê o Stripe ao rodar, nunca decide pelo relógio sozinho.** Se a fatura foi paga nesse meio-tempo, o job não faz nada — quem cancela de fato é sempre uma leitura fresca.
- **Plano `manual` nunca é tocado pelo Stripe** (regra da etapa 2, intacta): `syncFromStripe` já sai cedo nesse caso, antes de qualquer descida.
- **Idempotente:** aplicar a mesma descida duas vezes não muda nada na segunda (nem re-desconecta sessão já desconectada, nem re-pausa campanha já pausada, nem duplica a linha de auditoria de "mudou de X para Y" se X já é igual a Y).
- **`detachSession` preserva histórico** — difere de `removeSession`: desconecta, evicta do registry, apaga as credenciais, mas NUNCA apaga a linha de `WhatsAppSession` nem o `WhatsAppSessionEvent`. Reconectar depois exige QR (e vaga) de novo.
- **Pausar por descida de plano não cancela nada** — mesma garantia que `pauseCampaign`/`pauseBroadcast` manuais já dão: os jobs já agendados na fila disparam, veem `status !== 'running'` e não enviam.
- Nunca imprimir chave/segredo do Stripe em log. `jobId` sem `:` (regra permanente do projeto).
- Faixa da tolerância no horário de **Brasília**, mesma função (`formatBillingDate`) já usada na aba Plano.

---

## Mapa de arquivos

**API — `apps/api/src/services/billing/`**
- Modify: `domain/BillingGateway.ts` (+`cancelSubscription`), `infrastructure/StripeBillingGateway.ts`, `application/BillingService.ts` (agenda a tolerância, chama a descida), `compositionRoot.ts`
- Create: `domain/schedulers/BillingGraceScheduler.ts`, `infrastructure/schedulers/BullMqBillingGraceScheduler.ts`, `infrastructure/BillingGraceJobProcessor.ts`, `infrastructure/queues/BillingGraceQueue.ts` (nome da fila + tipo do job)

**API — `apps/api/src/services/billing/application/PlanChangeService.ts`** (novo) — a rotina de descida (§5.2), com as portas estreitas que ela precisa dos outros bounded contexts:
- `domain/providers/SessionDowngradeHandler.ts` (porta; implementada em `services/whatsapp`)
- `domain/providers/CampaignDowngradeHandler.ts` (porta; implementada em `services/campaigns`)
- `domain/providers/GroupBroadcastDowngradeHandler.ts` (porta; implementada em `services/groupBroadcasts`)

**API — outros bounded contexts:**
- `services/whatsapp/application/WhatsAppSessionService.ts` (+`detachExcessSessions`), `services/whatsapp/infrastructure/SessionDowngradeHandlerImpl.ts` (novo, implementa a porta acima)
- `services/campaigns/domain/repositories/CampaignRepository.ts` + `infrastructure/repositories/PrismaCampaignRepository.ts` (+`listRunningByTenant`), `services/campaigns/application/CampaignService.ts` (+`pauseAllRunningForPlanDowngrade`), `services/campaigns/infrastructure/CampaignDowngradeHandlerImpl.ts` (novo)
- `services/groupBroadcasts/domain/repositories/GroupBroadcastRepository.ts` + `infrastructure/repositories/PrismaGroupBroadcastRepository.ts` (+`listRunningByTenant`), `services/groupBroadcasts/application/GroupBroadcastService.ts` (+`pauseAllRunningForPlanDowngrade`), `services/groupBroadcasts/infrastructure/GroupBroadcastDowngradeHandlerImpl.ts` (novo)
- `apps/api/src/index.ts` (fila `billing-grace`, injeção tardia das três portas de descida em `PlanChangeService`, igual ao padrão já usado por `setMediaSender`/`setCampaignSendDispatcher`)

**Painel:** `apps/dashboard/lib/clientApi.ts` (`BillingStatus.subscription.pastDueSince` já existe — só falta ler), `apps/dashboard/lib/billingView.ts` (+`pastDueDeadline`), `apps/dashboard/components/PastDueBanner.tsx` (novo), `apps/dashboard/pages/_app.tsx` (monta o banner, mesmo padrão de `SupportAccessBanner`), `apps/dashboard/components/PlanSettingsTab.tsx` (a situação "em atraso" já existe desde a etapa 2 — sem mudança, só confirma no teste de integração visual).

---

### Task 1: `PlanChangeService` — a rotina de descida, com Fakes das três portas

**Files:**
- Create: `apps/api/src/services/billing/application/PlanChangeService.ts`, `apps/api/src/services/billing/domain/providers/{SessionDowngradeHandler,CampaignDowngradeHandler,GroupBroadcastDowngradeHandler}.ts`, `apps/api/tests/services/billing/application/PlanChangeService.test.ts`
- Modify: `apps/api/tests/services/billing/fakes.ts` (Fakes das três portas)

**Interfaces:**
- Consumes: `TenantRepository.changePlan(id, plan, source)` (já existe, etapa 1), `AuditLogRepository.record(...)` (já existe), `Logger`.
- Produces:
  ```ts
  // domain/providers/SessionDowngradeHandler.ts
  export interface SessionDowngradeHandler {
    /** Desconecta e apaga credenciais das sessões que sobram acima do novo limite (as mais antigas ficam). Nunca lança. */
    detachExcessSessions(tenantId: string, newLimit: number): Promise<void>;
  }

  // domain/providers/CampaignDowngradeHandler.ts
  export interface CampaignDowngradeHandler {
    /** Pausa toda campanha 1:1 `running` do tenant, motivo `plan_downgrade`. Nunca lança. */
    pauseRunning(tenantId: string): Promise<void>;
  }

  // domain/providers/GroupBroadcastDowngradeHandler.ts
  export interface GroupBroadcastDowngradeHandler {
    /** Pausa todo disparo em grupos `running` do tenant, motivo `plan_downgrade`. Nunca lança. */
    pauseRunning(tenantId: string): Promise<void>;
  }
  ```
  ```ts
  // application/PlanChangeService.ts
  export type PlanChangeSource = 'stripe' | 'grace' | 'admin';

  export class PlanChangeService {
    constructor(
      private readonly tenants: TenantRepository,
      private readonly logger: Logger,
      private readonly auditLog?: AuditLogRepository,
      private sessionHandler?: SessionDowngradeHandler,
      private campaignHandler?: CampaignDowngradeHandler,
      private groupBroadcastHandler?: GroupBroadcastDowngradeHandler,
    ) {}
    setSessionDowngradeHandler(h: SessionDowngradeHandler): void;
    setCampaignDowngradeHandler(h: CampaignDowngradeHandler): void;
    setGroupBroadcastDowngradeHandler(h: GroupBroadcastDowngradeHandler): void;

    /**
     * Aplica a descida (§5.2) SÓ SE `to` for menor que o plano atual do
     * tenant lido do banco — quem decide "é uma descida?" é este método,
     * nunca o chamador, para o mesmo `syncFromStripe` poder chamar sempre
     * que o plano mudar (subida ou descida) sem duplicar a checagem.
     * `planSource` já deve ter sido decidido pelo chamador (Stripe grava
     * `self_service`; `/admin` decide `manual`/`self_service` como já faz).
     */
    async applyIfDowngrade(
      tenantId: string,
      to: TenantPlan,
      source: PlanChangeSource,
    ): Promise<void>;
  }
  ```

- [ ] **Step 1:** Escreva `apps/api/tests/services/billing/fakes.ts` — três Fakes minúsculos (`FakeSessionDowngradeHandler`/`FakeCampaignDowngradeHandler`/`FakeGroupBroadcastDowngradeHandler`), cada um só registrando as chamadas recebidas num array (`calls: { tenantId, newLimit? }[]`), sem lógica.

- [ ] **Step 2:** Teste, falhando (`PlanChangeService.test.ts`):
  - "plano MAIOR (upgrade): não chama nenhuma das três portas, não audita descida" — `applyIfDowngrade('t1', 'pro', 'stripe')` com o tenant já em `broadcast`.
  - "plano IGUAL: não faz nada" (idempotência — chamar duas vezes com o mesmo `to` não gera duas gravações).
  - "descida para `free`: chama as três portas com `newLimit = sessionLimitFor('free')` (1), grava `tenant.plan = free` via `tenants.changePlan`, audita `billing.plan_changed` com `from`/`to`/`source`."
  - "descida de `enterprise` para `pro`: `newLimit = sessionLimitFor('pro')` (1) — o handler de sessão recebe o limite do plano NOVO, não zero."
  - "sem handlers injetados (ainda não vieram do `index.ts`): não lança — plano muda mesmo assim, só não desconecta/pausa nada" (mesmo padrão de degradação graciosa do resto do projeto).
  - "uma das portas lança: as outras duas ainda são chamadas, e o plano ainda muda" — a descida de plano NUNCA pode ficar pendurada por causa de uma falha auxiliar (mesmo racional de `audit()` em `BillingService`, mas aqui é o próprio efeito principal, então o teste garante `Promise.allSettled`, não `Promise.all`).

- [ ] **Step 3:** Implemente `PlanChangeService` — busca o tenant atual (`tenants.findById`), compara `PLAN_ORDER.indexOf(current.plan)` vs `PLAN_ORDER.indexOf(to)` (reaproveite a ordem já usada por `lib/plans.ts` no painel; no lado da API, crie a mesma lista em `shared/tenant/domain/planCapabilities.ts` se ainda não existir uma — `['free','broadcast','pro','enterprise']`). Se não for descida, retorna sem fazer nada. Se for: `await Promise.allSettled([...])` chamando as três portas (cada handler já promete nunca lançar, mas `allSettled` é a segunda linha de defesa), grava o plano com `tenants.changePlan(tenantId, to, source === 'admin' ? undefined_ja_decidido_pelo_chamador : 'self_service')` — **nota:** para `source==='admin'`, `TenantControlService` já decide `self_service`/`manual` e chama `tenants.changePlan` ele mesmo hoje; `PlanChangeService.applyIfDowngrade` para esse caminho só cuida da PARTE de sessões/campanhas (ver Task 5) — não regrava o plano de novo.

- [ ] **Step 4:** Rode os testes, verdes.

---

### Task 2: As três portas de descida implementadas nos bounded contexts donos

**Files:**
- Modify: `apps/api/src/services/whatsapp/application/WhatsAppSessionService.ts`, `apps/api/src/services/campaigns/domain/repositories/CampaignRepository.ts`, `apps/api/src/services/campaigns/infrastructure/repositories/PrismaCampaignRepository.ts`, `apps/api/src/services/campaigns/application/CampaignService.ts`, `apps/api/src/services/groupBroadcasts/domain/repositories/GroupBroadcastRepository.ts`, `apps/api/src/services/groupBroadcasts/infrastructure/repositories/PrismaGroupBroadcastRepository.ts`, `apps/api/src/services/groupBroadcasts/application/GroupBroadcastService.ts`
- Create: `apps/api/src/services/whatsapp/infrastructure/SessionDowngradeHandlerImpl.ts`, `apps/api/src/services/campaigns/infrastructure/CampaignDowngradeHandlerImpl.ts`, `apps/api/src/services/groupBroadcasts/infrastructure/GroupBroadcastDowngradeHandlerImpl.ts`
- Test: `apps/api/tests/services/whatsapp/WhatsAppSessionService.test.ts` (+`detachExcessSessions`), `apps/api/tests/services/campaigns/application/CampaignService.test.ts` (+`pauseAllRunningForPlanDowngrade`), `apps/api/tests/services/groupBroadcasts/application/GroupBroadcastService.test.ts` (idem), `apps/api/tests/integration/planDowngrade.integration.test.ts` (novo, contra Postgres real)

**Interfaces:**
- Consumes: `WhatsAppSessionRepository.findAllByTenant(tenantId)` (já existe); `WhatsAppSessionService.occupiesSlot`/`evictAndDisconnect`/`credentialsStore` (já existem, privados — `detachExcessSessions` vira o 3º chamador de `evictAndDisconnect`, ao lado de `disconnectSession`/`removeSession`).
- Produces:
  - `WhatsAppSessionService.detachExcessSessions(tenantId: string, newLimit: number): Promise<void>`
  - `CampaignRepository.listRunningByTenant(tenantId: string): Promise<Campaign[]>`
  - `CampaignService.pauseAllRunningForPlanDowngrade(tenantId: string): Promise<number>` (devolve quantas pausou, só para o log)
  - `GroupBroadcastRepository.listRunningByTenant(tenantId: string): Promise<GroupBroadcast[]>`
  - `GroupBroadcastService.pauseAllRunningForPlanDowngrade(tenantId: string): Promise<number>`

- [ ] **Step 1 — WhatsApp (teste primeiro):** em `WhatsAppSessionService.test.ts`, adicione:
  - "3 sessões ocupando vaga, `newLimit=1`: mantém a mais ANTIGA (`createdAt` menor), desconecta e apaga credenciais das outras duas — mas NÃO apaga o registro `WhatsAppSession` de nenhuma."
  - "sessão que não ocupa vaga (sem credenciais, nunca conectada): nunca é candidata a desconectar — só entram as que `occupiesSlot` confirma."
  - "`newLimit` maior ou igual à quantidade ocupada: não desconecta nada."
  - "chamar duas vezes seguidas: a segunda não lança nem re-desconecta (idempotência — `disconnect()`/`clear()` já são idempotentes, o teste só confirma que a composição continua sendo)."

- [ ] **Step 2:** Implemente `detachExcessSessions(tenantId, newLimit)`: busca `sessionRepository.findAllByTenant(tenantId)`, filtra as que `occupiesSlot` confirma (reaproveite o método privado — ele já existe), ordena por `createdAt` ASC, mantém as primeiras `newLimit`, e para cada excedente chama `evictAndDisconnect(tenantId, session.sessionName)` + `credentialsStore.clear(tenantId, buildWhatsAppCredentialsNamespace(session.sessionName))` + `audit(tenantId, undefined, 'session.detached_plan_downgrade', session.sessionName, {})`. **Nunca** chama `sessionRepository.deleteByTenantAndSessionName` (é isso que difere de `removeSession`).

- [ ] **Step 3:** `SessionDowngradeHandlerImpl` — classe de uma linha que implementa a porta chamando `whatsAppSessionService.detachExcessSessions`.

- [ ] **Step 4 — Campaigns (teste primeiro):** em `CampaignService.test.ts`:
  - "duas campanhas `running` de sessões diferentes do mesmo tenant, uma `draft`: pausa só as duas `running`, com `pausedReason='plan_downgrade'`, devolve 2."
  - "nenhuma `running`: devolve 0, não lança."
  - Adicione `listRunningByTenant` ao `FakeCampaignRepository` (filtro simples em memória).

- [ ] **Step 5:** `PrismaCampaignRepository.listRunningByTenant(tenantId)` — `findMany({ where: { tenantId, status: 'RUNNING' } })`, sem paginação (uso administrativo, não uma tela). `CampaignService.pauseAllRunningForPlanDowngrade` chama isso e, para cada uma, `campaignRepository.updateCampaignStatus(tenantId, id, 'paused', 'plan_downgrade')` DIRETO (não via `pauseCampaign`, que exige checar `status==='running'` de novo desnecessariamente — já filtrado).

- [ ] **Step 6:** `CampaignDowngradeHandlerImpl` — mesma forma do Step 3.

- [ ] **Step 7 — GroupBroadcasts:** repita os Steps 4–6 para `GroupBroadcastRepository.listRunningByTenant`/`GroupBroadcastService.pauseAllRunningForPlanDowngrade`/`GroupBroadcastDowngradeHandlerImpl` — mesmíssima forma, motivo `'plan_downgrade'`.

- [ ] **Step 8:** `apps/api/tests/integration/planDowngrade.integration.test.ts` — contra Postgres REAL: cria um tenant Enterprise com 3 sessões (2 com credenciais fake gravadas via `credentialsStore`, 1 sem), 1 campanha `running`, 1 disparo em grupos `running`; chama as três implementações reais encadeadas manualmente (sem passar pelo `PlanChangeService`, que já foi testado com Fakes na Task 1); confirma no banco: 2 sessões desconectadas SEM linha apagada, credenciais realmente removidas do `CredentialsStore` real, campanha e disparo com `status='paused'`/`pausedReason='plan_downgrade'`. Prova a garantia "nunca apaga histórico" contra o banco de verdade, não um Fake.

- [ ] **Step 9:** Rode a suíte inteira dos três bounded contexts + a integração, verdes.

---

### Task 3: `billing-grace` — fila, agendamento e o job que relê o Stripe

**Files:**
- Create: `apps/api/src/services/billing/domain/schedulers/BillingGraceScheduler.ts`, `apps/api/src/services/billing/infrastructure/schedulers/BullMqBillingGraceScheduler.ts`, `apps/api/src/services/billing/infrastructure/queues/BillingGraceQueue.ts`, `apps/api/src/services/billing/infrastructure/BillingGraceJobProcessor.ts`
- Modify: `apps/api/src/services/billing/domain/BillingGateway.ts`, `apps/api/src/services/billing/infrastructure/StripeBillingGateway.ts`, `apps/api/src/services/billing/application/BillingService.ts`
- Test: `apps/api/tests/services/billing/infrastructure/schedulers/BullMqBillingGraceScheduler.test.ts`, `apps/api/tests/services/billing/infrastructure/BillingGraceJobProcessor.test.ts`, `apps/api/tests/services/billing/infrastructure/StripeBillingGateway.test.ts` (+`cancelSubscription`), `apps/api/tests/services/billing/application/BillingService.test.ts` (+agendamento)

**Interfaces:**
- Consumes: `buildJobId` (`shared/infrastructure/queue/jobId.ts`, já existe); `BillingGateway.findCurrentSubscription`/`cancelSubscription`.
- Produces:
  ```ts
  // domain/BillingGateway.ts, novo método na porta
  cancelSubscription(subscriptionId: string): Promise<void>;

  // domain/schedulers/BillingGraceScheduler.ts
  export interface BillingGraceScheduler {
    /** Nunca lança — agendar é auxiliar. `firesAt` já vem calculado (pastDueSince + 3 dias). */
    schedule(tenantId: string, subscriptionId: string, pastDueSince: Date, firesAt: Date): Promise<void>;
  }

  // infrastructure/queues/BillingGraceQueue.ts
  export const BILLING_GRACE_QUEUE_NAME = 'billing-grace';
  export interface BillingGraceJobData {
    tenantId: string;
    subscriptionId: string;
  }
  ```
  `BillingService` ganha um 8º parâmetro construtor opcional `graceScheduler?: BillingGraceScheduler` + `setGraceScheduler(s)` (injeção tardia, mesmo padrão de `setMediaSender`/`setCampaignSendDispatcher` — a fila só existe com `REDIS_URL`).

- [ ] **Step 1 (teste, falhando):** `StripeBillingGateway.test.ts` — `cancelSubscription('sub_1')` chama `stripe.subscriptions.cancel('sub_1')`. Implemente.

- [ ] **Step 2 (teste, falhando):** `BullMqBillingGraceScheduler.test.ts` — `schedule('t1', 'sub_1', pastDueSince, firesAt)` chama `queue.add('expire', { tenantId: 't1', subscriptionId: 'sub_1' }, { jobId: buildJobId('billing-grace', 't1', 'sub_1', String(pastDueSince.getTime())), delay: firesAt.getTime() - Date.now() })`. Um `jobId` estável por `(tenant, assinatura, momento em que entrou em atraso)`: se `syncFromStripe` rodar de novo enquanto já está em atraso (aviso repetido/fora de ordem), o BullMQ recusa duplicar o job — não precisa de checagem própria no `BillingService`. Implemente sobre o padrão de `BullMqStageClassificationScheduler`.

- [ ] **Step 3 (teste, falhando):** `BillingGraceJobProcessor.test.ts`:
  - "assinatura AINDA em atraso quando o job roda: cancela no Stripe (`gateway.cancelSubscription`)."
  - "assinatura já PAGA (fatura quitada nesse meio-tempo): não cancela nada."
  - "assinatura já não existe mais (cliente cancelou pelo portal): não lança, só loga."
  - Injeta `SubscriptionRepository` (para achar `stripeCustomerId` do tenant) + `BillingGateway`. `process({ tenantId, subscriptionId })`: `local = await subscriptions.findByTenant(tenantId)`; se `!local || local.stripeSubscriptionId !== subscriptionId` → log e retorna (assinatura mudou desde que o job foi agendado, nada a fazer); `current = await gateway.findCurrentSubscription(local.stripeCustomerId)`; se `current` existe e `toSubscriptionStatus(current.status) === 'past_due'` → `await gateway.cancelSubscription(subscriptionId)`. **Não chama `syncFromStripe` nem `PlanChangeService` aqui** — o cancelamento gera `customer.subscription.deleted` no Stripe, que chega pelo webhook normal.

- [ ] **Step 4 (teste, falhando):** `BillingService.test.ts` — em `syncFromStripe`:
  - "primeira vez que fica em atraso (`local.pastDueSince` era nulo, `status` novo é `past_due`): agenda `billing-grace` para `pastDueSince + 3 dias`."
  - "já estava em atraso antes (`local.pastDueSince` já preenchido): não agenda de novo" (o `jobId` estável do Step 2 já cobriria isso na fila real, mas o teste com Fake garante que `BillingService` nem tenta).
  - "voltou a ficar em dia (`status` deixou de ser `past_due`): não agenda nada — não precisa cancelar o job pendente, ele vai rodar, reler, ver pago e não fazer nada" (documenta a decisão do Global Constraints).
  - "sem `graceScheduler` injetado (Redis fora do ar): não lança."
  - "**plano mudou (subiu OU desceu) durante o `syncFromStripe`: chama `planChangeService.applyIfDowngrade`**" — teste que a chamada acontece incondicionalmente (quem decide se é descida é o próprio `PlanChangeService`, Task 1).

- [ ] **Step 5:** Implemente em `BillingService`:
  - Construtor ganha DOIS parâmetros novos, ambos OPCIONAIS e **ao final** da lista atual (depois de `now`) — para não deslocar nenhum dos parâmetros já existentes e não quebrar nenhum `new BillingService(...)` posicional já escrito nos testes de hoje: `planChangeService?: PlanChangeService` e `graceScheduler?: BillingGraceScheduler`, cada um com seu setter (`setPlanChangeService`/`setGraceScheduler`) para quando `index.ts` precisar injetar depois de construir. Mesma degradação graciosa do resto do projeto: sem `planChangeService` (não injetado ainda, ou construído fora de ordem), `syncFromStripe` só não aplica a descida — o plano ainda muda.
  - Em `syncFromStripe`, logo após calcular `pastDueSince` (linha já existente): `const enteringPastDue = status === 'past_due' && !local.pastDueSince;` — se `enteringPastDue`, chama `this.graceScheduler?.schedule(tenantId, current!.id, this.now(), addDays(this.now(), 3))` (função pura `addDays` nova em `domain/subscriptionState.ts` ou junto de `TRIAL_DAYS`, mesmo arquivo).
  - Logo após o bloco que já faz `if (target !== tenant.plan) { await this.tenants.changePlan(...); await this.audit(...) }`: troque por `await this.tenants.changePlan(...); await this.audit(...); await this.planChangeService?.applyIfDowngrade(tenantId, target, 'stripe');` — na mesma ordem (plano muda, depois a descida cuida de sessões/campanhas; se `target` for maior, `applyIfDowngrade` não faz nada, barato de chamar sempre).

- [ ] **Step 6:** Rode a suíte de `services/billing`, verde.

---

### Task 4: Fiação em `index.ts` — a fila `billing-grace` e as portas de descida injetadas

**Files:**
- Modify: `apps/api/src/index.ts`, `apps/api/src/services/billing/compositionRoot.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1–3.

- [ ] **Step 1:** Em `createBillingComposition`, `BillingService` passa a receber um `PlanChangeService` (criado ali mesmo — ele só depende de `TenantRepository`/`Logger`/`AuditLogRepository`, todos já disponíveis no composition root da cobrança) e devolvê-lo em `BillingComposition.planChangeService` (novo campo), para `index.ts` injetar as três portas depois.

- [ ] **Step 2:** Em `index.ts`, dentro do `if (REDIS_URL) { ... }` que já monta `campaignSendWorker`/`groupBroadcastSendWorker` (por volta da linha 1018): monte a fila/worker de `billing-grace` seguindo `wireCampaignSendEngine` como modelo — `new Queue<BillingGraceJobData>(BILLING_GRACE_QUEUE_NAME, { connection })`, `new BullMqBillingGraceScheduler(queue)`, `billing.planChangeService` já existe; chame `billing.billingService.setGraceScheduler(scheduler)`. `new Worker(BILLING_GRACE_QUEUE_NAME, job => processor.process(job.data), { connection, removeOnComplete: { count: 0 }, removeOnFail: { count: 500 } })` com `BillingGraceJobProcessor(billing.subscriptionRepository, billing.billing.gateway, logger)` (exponha `subscriptionRepository`/`billing` — o objeto `BillingConfig` — em `BillingComposition` se ainda não estiverem públicos).

- [ ] **Step 3:** Logo depois de `whatsAppSessionService`/`campaignService`/`groupBroadcastService` existirem (ordem de composição já resolvida no arquivo — a cobrança é montada por último hoje, então as três portas já existem quando chegar a vez dela): `billing.planChangeService.setSessionDowngradeHandler(new SessionDowngradeHandlerImpl(whatsAppSessionService))`, idem para campanhas e disparos em grupos.

- [ ] **Step 4:** `npx tsc -p apps/api --noEmit` limpo. Suba a API localmente (Postgres/Redis via `docker compose up -d`) e confirme no log de início que nenhum aviso de "billing desligado"/"grace desligado" aparece com as 6 variáveis + `REDIS_URL` presentes.

---

### Task 5: `/admin` chama a mesma rotina de descida

**Files:**
- Modify: `apps/api/src/services/platform/application/TenantControlService.ts`, `apps/api/src/index.ts` (injeção do `PlanChangeService` no `TenantControlService`)
- Test: `apps/api/tests/services/platform/application/TenantControlService.test.ts`

**Interfaces:**
- Consumes: `PlanChangeService.applyIfDowngrade` (Task 1).

- [ ] **Step 1 (teste, falhando):** "`/admin` troca um Enterprise para Grátis: além de gravar o plano (comportamento já existente), chama `planChangeService.applyIfDowngrade` com `source='admin'`." "Troca para plano MAIOR: `changePlan` grava normalmente, mas a chamada a `applyIfDowngrade` é feita mesmo assim (quem decide se é descida é o `PlanChangeService`, não o `TenantControlService` — consistência com o caminho do Stripe)."

- [ ] **Step 2:** `TenantControlService` ganha um 4º parâmetro construtor opcional `planChangeService?: PlanChangeService`. Em `changePlan`, logo depois de `this.tenants.changePlan(...)` bem-sucedido: `await this.planChangeService?.applyIfDowngrade(tenantId, plan, 'admin')`. Ausente (não injetado ainda por alguma razão) = não quebra, só não desconecta/pausa — mesma degradação graciosa de sempre.

- [ ] **Step 3:** Em `index.ts`, onde `TenantControlService` é construído (Fase 4 do `/admin`, já existe), passe o `planChangeService` da composição de billing — a ordem de montagem do arquivo precisa da cobrança ANTES do `/admin`, ou uma injeção tardia (`setPlanChangeService`) se a ordem atual for a inversa. Confira qual é o caso real e use o padrão que já existe no arquivo para essa mesma situação (`setActiveSubscriptionChecker` já resolve exatamente esse tipo de dependência tardia entre billing e `/admin` — replique a mesma forma).

- [ ] **Step 4:** Suíte de `services/platform` verde.

---

### Task 6: Faixa de aviso no topo (todos os usuários) + botão do portal (dono)

**Files:**
- Create: `apps/dashboard/components/PastDueBanner.tsx`, `apps/dashboard/tests-jsdom/components/PastDueBanner.test.tsx`
- Modify: `apps/dashboard/lib/billingView.ts` (+`pastDueDeadline`), `apps/dashboard/pages/_app.tsx`
- Test: `apps/dashboard/tests/lib/billingView.test.ts` (+`pastDueDeadline`)

**Interfaces:**
- Consumes: `fetchBillingStatus()` (já existe), `useMe()` (papel do usuário logado, já existe — ver `SupportAccessBanner.tsx` para o padrão de leitura de sessão/papel dentro de um componente montado em `_app.tsx`), `formatBillingDate` (já existe).
- Produces:
  ```ts
  // lib/billingView.ts
  /** `pastDueSince + 3 dias`, ou undefined se não estiver em atraso. Mesma tolerância que `billing-grace` usa no servidor. */
  export function pastDueDeadline(billing: BillingStatus): Date | undefined;
  ```

- [ ] **Step 1 (teste, falhando):** `billingView.test.ts` — `pastDueDeadline` soma 3 dias a `subscription.pastDueSince` quando `status==='past_due'`; `undefined` em qualquer outro status ou sem assinatura. Implemente.

- [ ] **Step 2 (teste, falhando):** `PastDueBanner.test.tsx`, mesmo padrão de mocks de `SupportAccessBanner.test.tsx` (polling via `fetchBillingStatus`, `useMe` mockado):
  - "sem atraso: não renderiza nada."
  - "em atraso, usuário QUALQUER (não dono): mostra o prazo em Brasília, SEM botão de gerenciar."
  - "em atraso, DONO: mostra o prazo E o botão que abre o portal (mesma ação de `PlanSettingsTab`, `openBillingPortal` + `navigate`)."
  - "prazo já vencido (o `billing-grace` ainda não rodou/o Stripe ainda não confirmou o cancelamento): mostra 'a qualquer momento' em vez de uma data no passado" — decisão de UX pequena, para nunca mostrar "vence em 15/09" já tendo passado 15/09.

- [ ] **Step 3:** Implemente `PastDueBanner.tsx` — poll leve (`usePollingRefresh`, mesmo hook de sempre) chamando `fetchBillingStatus()`; `role="status"` fixa no topo (não fechável — é dinheiro, diferente de um banner descartável); texto para todos: "Pagamento em atraso — [prazo] a assinatura será cancelada e o plano volta para o Grátis."; para o dono, botão "Atualizar pagamento" chamando `openBillingPortal()`.

- [ ] **Step 4:** Monte em `pages/_app.tsx`, mesma posição de `SupportAccessBanner` (acima do conteúdo, abaixo do necessário para não brigar com o banner de suporte se os dois estiverem ativos ao mesmo tempo — extremamente raro, mas empilhe em vez de sobrepor).

- [ ] **Step 5:** `npx tsc -p apps/dashboard --noEmit && npx jest --selectProjects dashboard dashboard-jsdom && npm run lint -w apps/dashboard && npm run build -w apps/dashboard` — limpos.

---

### Task 7: Documentação e verificação ponta a ponta

- [ ] **Step 1:** `CLAUDE.md` §18 (entrada da etapa 3) e `CONTEXT.md` (glossário: "Tolerância de atraso" deixa de dizer "zero" — trocar para os 3 dias; termo "Descida de plano"/`plan_downgrade`).
- [ ] **Step 2:** Suítes completas (`api` + `dashboard`/`dashboard-jsdom`), com Postgres e Redis de pé, nenhum aviso de "pulando" nos testes de integração.
- [ ] **Step 3 (depende do fundador):** no modo teste do Stripe, com `stripe listen` rodando: usar o cartão de teste que sempre falha (`4000 0000 0000 0341` ou `stripe trigger invoice.payment_failed` contra a assinatura de teste já criada na etapa 2) e confirmar: a faixa aparece na hora para qualquer login daquele tenant; o botão do dono abre o portal; **encurtar manualmente** o atraso pra não esperar 3 dias de verdade — reduza `pastDueSince` no banco de teste antes de deixar o job `billing-grace` rodar (ou rode o processor manualmente contra o `subscriptionId` de teste) e confirme que a assinatura é cancelada no Stripe e o tenant volta a `free`/`self_service`.
- [ ] **Step 4:** Revisão de segurança — cancelamento de assinatura é uma ação que move o estado do cliente automaticamente; confirme que `billing-grace` só cancela depois de reler o Stripe (nunca por confiança no relógio local) e que a descida nunca apaga dado nenhum (sessão/histórico/conversa) — só desconecta e pausa.
- [ ] **Step 5:** Commit — `feat(billing): 3-day past-due grace period and automatic downgrade to Grátis`.
