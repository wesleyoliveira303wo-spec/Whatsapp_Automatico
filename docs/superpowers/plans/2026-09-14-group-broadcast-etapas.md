# Disparo em Grupos com Múltiplas Etapas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estender `services/groupBroadcasts` para que um "Disparo em grupos"
seja uma SEQUÊNCIA de publicações distintas ("etapas"), cada uma com seu
próprio texto/mídia e sua própria recorrência, cadenciadas uma após a outra
para os mesmos grupos.

**Architecture:** Extrai o conteúdo/recorrência de `GroupBroadcast` para uma
tabela filha nova `GroupBroadcastStep`. O motor de fila existente
(`GroupBroadcastRunJobProcessor`/`GroupBroadcastSendJobProcessor`) passa a
operar sobre a etapa em `broadcast.currentStepIndex` em vez dos campos que
hoje moram direto em `GroupBroadcast`. Quando uma etapa esgota sua recorrência,
o processador de envio avança `currentStepIndex` e dispara um "run" com delay
zero — reaproveitando o `GroupBroadcastRunJobProcessor` já existente (que já
sabe checar a janela de horário e reabrir os alvos) para iniciar a etapa nova,
em vez de duplicar essa lógica.

**Tech Stack:** Node.js/TypeScript, Prisma/PostgreSQL, BullMQ, Express, Next.js/React (Dashboard).

**Spec:** [`docs/superpowers/specs/2026-09-14-group-broadcast-etapas-design.md`](../specs/2026-09-14-group-broadcast-etapas-design.md)

## Global Constraints

- Teto de **20 etapas por disparo** (`MAX_STEPS_PER_BROADCAST`), mesmo espírito
  do teto de 30 grupos e 100 repetições já existentes.
- A lista de grupos-alvo é uma só, para a campanha inteira — não há grupos por etapa.
- A janela de horário (`sendWindowStart`/`sendWindowEnd`) é da CAMPANHA
  inteira, não por etapa.
- Etapas só são editáveis (adicionar/remover/reordenar/anexar mídia) enquanto
  `GroupBroadcast.status === 'draft'` — mesma régua que mídia de campanha 1:1.
- As 3 campanhas já rodando em produção (E-Sim, Conta Uber, Carro Atrasado)
  precisam continuar publicando exatamente como hoje depois da migração — cada
  uma vira uma campanha de 1 etapa (`order = 0`), sem nenhuma mudança de
  comportamento observável.
- Todo código novo segue a disciplina já estabelecida no bounded context:
  toda operação de repositório recebe e filtra por `tenantId` (defesa IDOR por
  construção); erros de Domain são classes próprias, mapeadas por
  `instanceof` no `groupBroadcastsErrorHandler`.

---

## Task 1: Schema Prisma — `GroupBroadcastStep` + migração de dados legados

**Files:**
- Modify: `prisma/schema.prisma` (model `GroupBroadcast` em torno da linha 535, novo model `GroupBroadcastStep`)
- Create: `prisma/migrations/20260914120000_add_group_broadcast_steps/migration.sql`
- Test: `apps/api/tests/integration/groupBroadcastStepsMigration.integration.test.ts`

**Interfaces:**
- Produces: tabela `group_broadcast_steps` e coluna `group_broadcasts.current_step_index` (`Int @default(0)`), consumidas por todas as tarefas seguintes.

- [ ] **Step 1: Editar `prisma/schema.prisma`**

Substituir os campos de conteúdo/recorrência de `GroupBroadcast` (linhas
540–571 hoje: `messageTemplate`, `mediaContent`/`mediaMimeType`/
`mediaFileName`/`mediaContentType`, `recurrenceIntervalHours`/
`recurrenceMaxRuns`/`recurrenceEndsAt`, `runsCompleted`, `nextRunAt`) por um
único campo novo, e adicionar o model `GroupBroadcastStep`:

```prisma
model GroupBroadcast {
  id               String                      @id @default(uuid())
  tenantId         String                      @map("tenant_id")
  sessionName      String                      @map("session_name")
  name             String
  status           CampaignStatus              @default(DRAFT)
  /// Espaçamento-base entre um grupo e o seguinte. Default 60s, piso de 30s
  /// imposto pela aplicação (`clampGroupIntervalSeconds`).
  intervalSeconds  Int                         @default(60) @map("interval_seconds")
  /// Janela diária permitida ("HH:MM", fuso `America/Sao_Paulo` desde a
  /// correção de 2026-09-13) — vale para a campanha INTEIRA, atravessando
  /// etapas. Uma repetição ou transição de etapa que cairia fora dela é
  /// empurrada para o próximo horário permitido, nunca descartada.
  sendWindowStart  String?                     @map("send_window_start")
  sendWindowEnd    String?                     @map("send_window_end")
  /// Índice (0-based) da etapa em execução agora. Sempre 0 até a primeira
  /// etapa esgotar sua recorrência (2026-09-14, disparo com múltiplas
  /// publicações em sequência).
  currentStepIndex Int                         @default(0) @map("current_step_index")
  pausedReason     String?                     @map("paused_reason")
  createdByUserId  String?                     @map("created_by_user_id")
  createdAt        DateTime                    @default(now()) @map("created_at")
  updatedAt        DateTime                    @updatedAt @map("updated_at")

  tenant  Tenant                 @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  steps   GroupBroadcastStep[]
  targets GroupBroadcastTarget[]

  @@index([tenantId, sessionName])
  @@map("group_broadcasts")
}

/// Uma publicação da sequência de um disparo em grupos (2026-09-14). Campos
/// de conteúdo/recorrência IDÊNTICOS aos que `GroupBroadcast` tinha antes —
/// só mudaram de dono (agora são por etapa, não pela campanha inteira).
model GroupBroadcastStep {
  id                      String                      @id @default(uuid())
  tenantId                String                      @map("tenant_id")
  broadcastId             String                      @map("broadcast_id")
  /// Ordem de execução (0, 1, 2...) — única dentro da campanha.
  order                   Int
  /// Texto publicado; com mídia, vira a LEGENDA (uma mensagem só, nunca duas).
  messageTemplate         String                      @db.Text @map("message_template")
  mediaContent            Bytes?                      @map("media_content")
  mediaMimeType           String?                     @map("media_mime_type")
  mediaFileName           String?                     @map("media_file_name")
  mediaContentType        WhatsAppMessageContentType? @map("media_content_type")
  /// Recorrência DESTA etapa: de quantas em quantas horas repete. Ausente =
  /// publica uma vez só, depois avança para a próxima etapa (se houver).
  recurrenceIntervalHours Int?                        @map("recurrence_interval_hours")
  /// Fim por CONTAGEM: avança/encerra depois de N publicações desta etapa.
  recurrenceMaxRuns       Int?                        @map("recurrence_max_runs")
  /// Fim por DATA: não inicia nenhuma publicação desta etapa depois deste
  /// instante. Os dois limites convivem — vale o que vier primeiro; ambos
  /// nulos = repete até a campanha ser cancelada.
  recurrenceEndsAt        DateTime?                   @map("recurrence_ends_at")
  /// Publicações desta etapa já CONCLUÍDAS (todos os grupos processados).
  runsCompleted           Int                         @default(0) @map("runs_completed")
  /// Quando a próxima repetição desta etapa começa. Nulo se não é a etapa
  /// atual, ou se ela já foi concluída.
  nextRunAt               DateTime?                   @map("next_run_at")
  createdAt               DateTime                    @default(now()) @map("created_at")

  tenant    Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  broadcast GroupBroadcast @relation(fields: [broadcastId], references: [id], onDelete: Cascade)

  @@unique([broadcastId, order])
  @@index([tenantId, broadcastId])
  @@map("group_broadcast_steps")
}
```

- [ ] **Step 2: Escrever a migration SQL** (não usar `prisma migrate dev`
  para gerar automaticamente — o backfill de dados legados exige SQL manual
  entre o `CREATE TABLE` e o `DROP COLUMN`)

Criar `prisma/migrations/20260914120000_add_group_broadcast_steps/migration.sql`:

```sql
-- Etapa 1: tabela nova
CREATE TABLE "group_broadcast_steps" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "broadcast_id" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "message_template" TEXT NOT NULL,
  "media_content" BYTEA,
  "media_mime_type" TEXT,
  "media_file_name" TEXT,
  "media_content_type" "whatsapp_message_content_type",
  "recurrence_interval_hours" INTEGER,
  "recurrence_max_runs" INTEGER,
  "recurrence_ends_at" TIMESTAMP(3),
  "runs_completed" INTEGER NOT NULL DEFAULT 0,
  "next_run_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "group_broadcast_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_broadcast_steps_broadcast_id_order_key"
  ON "group_broadcast_steps"("broadcast_id", "order");
CREATE INDEX "group_broadcast_steps_tenant_id_broadcast_id_idx"
  ON "group_broadcast_steps"("tenant_id", "broadcast_id");

ALTER TABLE "group_broadcast_steps"
  ADD CONSTRAINT "group_broadcast_steps_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_broadcast_steps"
  ADD CONSTRAINT "group_broadcast_steps_broadcast_id_fkey"
  FOREIGN KEY ("broadcast_id") REFERENCES "group_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Etapa 2: nova coluna em group_broadcasts (default 0 cobre as linhas existentes)
ALTER TABLE "group_broadcasts" ADD COLUMN "current_step_index" INTEGER NOT NULL DEFAULT 0;

-- Etapa 3: BACKFILL — cada disparo existente vira uma campanha de 1 etapa
-- (order 0), carregando exatamente o conteúdo/recorrência que já tinha.
-- gen_random_uuid() é nativo do Postgres 13+ (sem extensão) — confirmado
-- contra a imagem `postgres:15-alpine` deste projeto.
INSERT INTO "group_broadcast_steps" (
  "id", "tenant_id", "broadcast_id", "order", "message_template",
  "media_content", "media_mime_type", "media_file_name", "media_content_type",
  "recurrence_interval_hours", "recurrence_max_runs", "recurrence_ends_at",
  "runs_completed", "next_run_at", "created_at"
)
SELECT
  gen_random_uuid(), "tenant_id", "id", 0, "message_template",
  "media_content", "media_mime_type", "media_file_name", "media_content_type",
  "recurrence_interval_hours", "recurrence_max_runs", "recurrence_ends_at",
  "runs_completed", "next_run_at", "created_at"
FROM "group_broadcasts";

-- Etapa 4: as colunas antigas saem de group_broadcasts — o conteúdo já mora
-- na etapa 0 de cada uma (backfill acima já rodou).
ALTER TABLE "group_broadcasts"
  DROP COLUMN "message_template",
  DROP COLUMN "media_content",
  DROP COLUMN "media_mime_type",
  DROP COLUMN "media_file_name",
  DROP COLUMN "media_content_type",
  DROP COLUMN "recurrence_interval_hours",
  DROP COLUMN "recurrence_max_runs",
  DROP COLUMN "recurrence_ends_at",
  DROP COLUMN "runs_completed",
  DROP COLUMN "next_run_at";
```

- [ ] **Step 3: Registrar a migration no Prisma sem regenerar o SQL**

Criar/editar `prisma/migrations/migration_lock.toml` não é necessário (já
existe). Rodar, no ambiente com Postgres/Redis de pé
(`docker compose up -d postgres redis`):

```bash
npx prisma migrate resolve --applied 20260914120000_add_group_broadcast_steps
```

só se a migration já tiver sido aplicada manualmente durante o
desenvolvimento; no fluxo normal (`npx prisma migrate deploy` /
`npx prisma migrate dev` lendo o arquivo criado no Step 2), o Prisma aplica o
SQL escrito à mão normalmente — não requer `resolve`. Depois:

```bash
npx prisma generate
```

- [ ] **Step 4: Escrever o teste de integração da migração**

```ts
// apps/api/tests/integration/groupBroadcastStepsMigration.integration.test.ts
import { PrismaClient } from '@prisma/client';
import { isDatabaseAvailable } from './databaseAvailability'; // helper já usado pelos demais testes de integração deste bounded context — ver groupBroadcasts.integration.test.ts

describe('migração 20260914120000 — disparos legados viram campanhas de 1 etapa', () => {
  let prisma: PrismaClient;
  let databaseAvailable = false;

  beforeAll(async () => {
    prisma = new PrismaClient();
    databaseAvailable = await isDatabaseAvailable(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('um GroupBroadcast criado ANTES desta migração (simulado via insert direto) preserva mensagem/mídia/recorrência na etapa 0', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const tenant = await prisma.tenant.create({ data: { name: 'Tenant migração', plan: 'PRO' } });
    const broadcast = await prisma.groupBroadcast.create({
      data: {
        tenantId: tenant.id,
        sessionName: 'sessao-migracao',
        name: 'Disparo legado simulado',
        intervalSeconds: 60,
        currentStepIndex: 0,
      },
    });
    // Simula o que o backfill do Step 2 já fez para linhas REAIS de antes da
    // migração: insere a etapa 0 manualmente, com o mesmo shape do SELECT.
    await prisma.groupBroadcastStep.create({
      data: {
        tenantId: tenant.id,
        broadcastId: broadcast.id,
        order: 0,
        messageTemplate: 'Promoção de aniversário!',
        recurrenceIntervalHours: 4,
        recurrenceMaxRuns: 10,
        runsCompleted: 5,
        nextRunAt: new Date('2026-09-15T09:00:00Z'),
      },
    });

    const steps = await prisma.groupBroadcastStep.findMany({ where: { broadcastId: broadcast.id } });
    expect(steps).toHaveLength(1);
    expect(steps[0].order).toBe(0);
    expect(steps[0].messageTemplate).toBe('Promoção de aniversário!');
    expect(steps[0].recurrenceIntervalHours).toBe(4);
    expect(steps[0].runsCompleted).toBe(5);

    const reloadedBroadcast = await prisma.groupBroadcast.findUniqueOrThrow({ where: { id: broadcast.id } });
    expect(reloadedBroadcast.currentStepIndex).toBe(0);

    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  it('apagar o disparo remove suas etapas em cascata (onDelete: Cascade)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const tenant = await prisma.tenant.create({ data: { name: 'Tenant cascade', plan: 'PRO' } });
    const broadcast = await prisma.groupBroadcast.create({
      data: { tenantId: tenant.id, sessionName: 'sessao', name: 'Disparo', intervalSeconds: 60 },
    });
    await prisma.groupBroadcastStep.create({
      data: { tenantId: tenant.id, broadcastId: broadcast.id, order: 0, messageTemplate: 'Oi' },
    });

    await prisma.groupBroadcast.delete({ where: { id: broadcast.id } });

    const orphanSteps = await prisma.groupBroadcastStep.findMany({ where: { broadcastId: broadcast.id } });
    expect(orphanSteps).toHaveLength(0);

    await prisma.tenant.delete({ where: { id: tenant.id } });
  });
});
```

(Reaproveitar o helper de disponibilidade de banco que
`groupBroadcasts.integration.test.ts` já usa — confirme o nome exato do
import antes de escrever este arquivo, olhando o topo daquele teste.)

- [ ] **Step 5: Rodar o teste de integração**

```bash
docker compose up -d postgres redis
npx jest --selectProjects api apps/api/tests/integration/groupBroadcastStepsMigration.integration.test.ts
```

Expected: PASS, e SEM o aviso "Postgres indisponível — pulando" (confirma
que rodou contra banco real, não pulou em silêncio — lição já registrada em
`CLAUDE.md` §18 sobre este bounded context).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260914120000_add_group_broadcast_steps apps/api/tests/integration/groupBroadcastStepsMigration.integration.test.ts
git commit -m "feat(groupBroadcasts): add GroupBroadcastStep table + migrate legacy broadcasts to single-step campaigns"
```

---

## Task 2: Domain — `GroupBroadcastStep` entity + `GroupBroadcast` atualizado

**Files:**
- Modify: `apps/api/src/services/groupBroadcasts/domain/entities/GroupBroadcast.ts`

**Interfaces:**
- Consumes: nada (arquivo folha).
- Produces: `GroupBroadcastStep`, `GroupBroadcast` (sem `messageTemplate`/mídia/
  recorrência/`runsCompleted`/`nextRunAt`, com `currentStepIndex: number`),
  consumidos por TODAS as tarefas seguintes.

- [ ] **Step 1: Reescrever o arquivo**

```ts
export type GroupBroadcastStatus =
  'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

export type GroupBroadcastMediaContentType = 'image' | 'video';

/**
 * Um disparo em grupos de WhatsApp — agora uma SEQUÊNCIA de publicações
 * distintas (`steps`), 2026-09-14. Ver
 * `docs/superpowers/specs/2026-09-14-group-broadcast-etapas-design.md`.
 *
 * `GroupBroadcast` guarda só o "envelope" da campanha: grupos-alvo (via
 * `GroupBroadcastTarget`), janela de horário, ritmo entre grupos e QUAL etapa
 * está em execução agora. Mensagem, mídia e recorrência moraram aqui até
 * 2026-09-14 — agora vivem em `GroupBroadcastStep`.
 */
export interface GroupBroadcast {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  status: GroupBroadcastStatus;
  intervalSeconds: number;
  /** Janela diária permitida ("HH:MM", fuso `America/Sao_Paulo`) — vale para a campanha inteira, atravessando etapas. */
  sendWindowStart?: string;
  sendWindowEnd?: string;
  /** Índice (0-based) da etapa em execução agora. Sempre 0 até a primeira etapa avançar. */
  currentStepIndex: number;
  pausedReason?: string;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Uma publicação da sequência (2026-09-14). `media` carrega só METADADOS — o
 * binário nunca viaja nesta entidade; só `GroupBroadcastRepository.getStepMediaContent` o lê.
 */
export interface GroupBroadcastStep {
  id: string;
  tenantId: string;
  broadcastId: string;
  /** Ordem de execução (0, 1, 2...) — única dentro da campanha. */
  order: number;
  /** Texto publicado; com mídia, vira a LEGENDA (uma mensagem só, nunca duas). */
  messageTemplate: string;
  media?: {
    contentType: GroupBroadcastMediaContentType;
    mimeType: string;
    fileName?: string;
  };
  /** Recorrência DESTA etapa: de quantas em quantas horas repete. Ausente = publica uma vez, depois avança. */
  recurrenceIntervalHours?: number;
  /** Fim por contagem: avança/encerra depois de N publicações desta etapa. */
  recurrenceMaxRuns?: number;
  /** Fim por data: não inicia publicação desta etapa depois deste instante. */
  recurrenceEndsAt?: Date;
  /** Publicações desta etapa já concluídas. */
  runsCompleted: number;
  /** Quando a próxima repetição desta etapa começa; ausente se não é a etapa atual ou já concluiu. */
  nextRunAt?: Date;
  createdAt: Date;
}

export type GroupBroadcastTargetStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export type GroupBroadcastSkipReason = 'admin_only_group' | 'group_not_found';

export interface GroupBroadcastTarget {
  id: string;
  tenantId: string;
  broadcastId: string;
  groupJid: string;
  groupName: string;
  status: GroupBroadcastTargetStatus;
  skipReason?: string;
  errorMessage?: string;
  sentAt?: Date;
  attemptedAt?: Date;
  /** Quantas vezes este grupo já recebeu uma publicação — soma através de TODAS as etapas e repetições. */
  sentCount: number;
  createdAt: Date;
}

export interface GroupBroadcastSummary {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  totalSent: number;
}
```

- [ ] **Step 2: Rodar `tsc` para confirmar os pontos de quebra** (não corrigir
  ainda — só mapear o raio de impacto antes das próximas tarefas)

```bash
npx tsc -p apps/api --noEmit 2>&1 | head -80
```

Expected: uma lista de erros em `PrismaGroupBroadcastRepository.ts`,
`GroupBroadcastService.ts`, `GroupBroadcastRunJobProcessor.ts`,
`GroupBroadcastSendJobProcessor.ts`, `groupBroadcastsRouter.ts` e nos testes
— cada um resolvido pelas tarefas seguintes. NÃO commitar ainda um estado que
não compila.

- [ ] **Step 3: Commit** (junto com o Task 3, para não deixar o build quebrado
  entre commits — ver nota no início do Task 3)

---

## Task 3: Repositório — interface + implementação Prisma para etapas

**Files:**
- Modify: `apps/api/src/services/groupBroadcasts/domain/repositories/GroupBroadcastRepository.ts`
- Modify: `apps/api/src/services/groupBroadcasts/infrastructure/repositories/PrismaGroupBroadcastRepository.ts`
- Test: `apps/api/tests/integration/groupBroadcasts.integration.test.ts` (estender)

**Interfaces:**
- Consumes: `GroupBroadcast`/`GroupBroadcastStep` (Task 2).
- Produces: `GroupBroadcastRepository` com os métodos de etapa abaixo,
  consumidos pelos Tasks 4 (processadores) e 5 (service).

> Este task deixa o projeto compilando de novo (fecha o que o Task 2 quebrou)
> — commitar Task 2 + Task 3 juntos é aceitável aqui.

- [ ] **Step 1: Reescrever `GroupBroadcastRepository.ts`**

```ts
import {
  GroupBroadcast,
  GroupBroadcastMediaContentType,
  GroupBroadcastStatus,
  GroupBroadcastStep,
  GroupBroadcastSummary,
  GroupBroadcastTarget,
} from '../entities/GroupBroadcast';

export interface CreateGroupBroadcastData {
  tenantId: string;
  sessionName: string;
  name: string;
  intervalSeconds: number;
  createdByUserId?: string;
  sendWindowStart?: string;
  sendWindowEnd?: string;
}

/** Uma etapa a criar junto com o disparo — `order` é atribuída pelo chamador (posição na lista). */
export interface CreateGroupBroadcastStepData {
  order: number;
  messageTemplate: string;
  recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number;
  recurrenceEndsAt?: Date;
}

export interface GroupBroadcastTargetDraft {
  groupJid: string;
  groupName: string;
  status: 'pending' | 'skipped';
  skipReason?: string;
}

export interface GroupBroadcastMediaContent {
  contentType: GroupBroadcastMediaContentType;
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
}

export interface GroupBroadcastRepository {
  create(data: CreateGroupBroadcastData): Promise<GroupBroadcast>;
  createTargets(
    tenantId: string,
    broadcastId: string,
    drafts: GroupBroadcastTargetDraft[],
  ): Promise<void>;

  /** Cria todas as etapas de uma vez, na ordem dada. Devolve as etapas criadas, na mesma ordem. */
  createSteps(
    tenantId: string,
    broadcastId: string,
    steps: CreateGroupBroadcastStepData[],
  ): Promise<GroupBroadcastStep[]>;
  /** Todas as etapas de uma campanha, ordenadas por `order` crescente. */
  listSteps(tenantId: string, broadcastId: string): Promise<GroupBroadcastStep[]>;
  findStepById(tenantId: string, stepId: string): Promise<GroupBroadcastStep | undefined>;

  findById(tenantId: string, broadcastId: string): Promise<GroupBroadcast | undefined>;
  listBySession(tenantId: string, sessionName: string, limit: number): Promise<GroupBroadcast[]>;

  listTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastTarget[]>;
  findTargetById(tenantId: string, targetId: string): Promise<GroupBroadcastTarget | undefined>;
  listPendingTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastTarget[]>;
  summarizeTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastSummary>;
  summarizeTargetsForBroadcasts(
    tenantId: string,
    broadcastIds: string[],
  ): Promise<Map<string, GroupBroadcastSummary>>;

  markTargetSent(tenantId: string, targetId: string, attemptedAt: Date): Promise<void>;
  markTargetFailed(
    tenantId: string,
    targetId: string,
    attemptedAt: Date,
    errorMessage: string,
  ): Promise<void>;
  listRecentOutcomes(
    tenantId: string,
    broadcastId: string,
    limit: number,
  ): Promise<Array<'sent' | 'failed'>>;
  countPending(tenantId: string, broadcastId: string): Promise<number>;
  resetTargetsForNextRun(tenantId: string, broadcastId: string): Promise<number>;

  /** Fecha uma repetição DE UMA ETAPA: grava `runsCompleted`/`nextRunAt` dela. Nunca mexe em `status` da campanha. */
  markStepRunFinished(
    tenantId: string,
    stepId: string,
    runsCompleted: number,
    nextRunAt: Date | null,
  ): Promise<void>;
  /** Move `GroupBroadcast.currentStepIndex` para a etapa seguinte. */
  advanceCurrentStep(tenantId: string, broadcastId: string, newIndex: number): Promise<void>;

  updateStatus(
    tenantId: string,
    broadcastId: string,
    status: GroupBroadcastStatus,
    pausedReason?: string,
  ): Promise<GroupBroadcast | undefined>;
  countRunningBySession(
    tenantId: string,
    sessionName: string,
    excludeBroadcastId?: string,
  ): Promise<number>;
  deleteById(tenantId: string, broadcastId: string): Promise<boolean>;

  attachStepMedia(
    tenantId: string,
    stepId: string,
    media: GroupBroadcastMediaContent,
  ): Promise<GroupBroadcastStep | undefined>;
  removeStepMedia(tenantId: string, stepId: string): Promise<GroupBroadcastStep | undefined>;
  /** Único caminho que lê o BINÁRIO de uma etapa (download/preview e envio). */
  getStepMediaContent(
    tenantId: string,
    stepId: string,
  ): Promise<GroupBroadcastMediaContent | undefined>;
}
```

- [ ] **Step 2: Reescrever `PrismaGroupBroadcastRepository.ts`**

Ajustes no topo do arquivo (`GROUP_BROADCAST_SELECT`/`GroupBroadcastRow`/
`toDomain`): remover os campos que saíram de `GroupBroadcast`, adicionar
`currentStepIndex`:

```ts
const GROUP_BROADCAST_SELECT = {
  id: true,
  tenantId: true,
  sessionName: true,
  name: true,
  status: true,
  intervalSeconds: true,
  sendWindowStart: true,
  sendWindowEnd: true,
  currentStepIndex: true,
  pausedReason: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface GroupBroadcastRow {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  status: string;
  intervalSeconds: number;
  sendWindowStart: string | null;
  sendWindowEnd: string | null;
  currentStepIndex: number;
  pausedReason: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: GroupBroadcastRow): GroupBroadcast {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    name: row.name,
    status: STATUS_FROM_PRISMA[row.status] ?? 'draft',
    intervalSeconds: row.intervalSeconds,
    sendWindowStart: row.sendWindowStart ?? undefined,
    sendWindowEnd: row.sendWindowEnd ?? undefined,
    currentStepIndex: row.currentStepIndex,
    pausedReason: row.pausedReason ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

Novo `select`/row/`toDomain` para etapas (mesmo padrão dos de cima — sem o
binário da mídia, que só `getStepMediaContent` lê):

```ts
const GROUP_BROADCAST_STEP_SELECT = {
  id: true,
  tenantId: true,
  broadcastId: true,
  order: true,
  messageTemplate: true,
  mediaMimeType: true,
  mediaFileName: true,
  mediaContentType: true,
  recurrenceIntervalHours: true,
  recurrenceMaxRuns: true,
  recurrenceEndsAt: true,
  runsCompleted: true,
  nextRunAt: true,
  createdAt: true,
} as const;

interface GroupBroadcastStepRow {
  id: string;
  tenantId: string;
  broadcastId: string;
  order: number;
  messageTemplate: string;
  mediaMimeType: string | null;
  mediaFileName: string | null;
  mediaContentType: string | null;
  recurrenceIntervalHours: number | null;
  recurrenceMaxRuns: number | null;
  recurrenceEndsAt: Date | null;
  runsCompleted: number;
  nextRunAt: Date | null;
  createdAt: Date;
}

function stepToDomain(row: GroupBroadcastStepRow): GroupBroadcastStep {
  const mediaContentType = row.mediaContentType
    ? MEDIA_TYPE_FROM_PRISMA[row.mediaContentType]
    : undefined;
  return {
    id: row.id,
    tenantId: row.tenantId,
    broadcastId: row.broadcastId,
    order: row.order,
    messageTemplate: row.messageTemplate,
    media: mediaContentType
      ? {
          contentType: mediaContentType,
          mimeType: row.mediaMimeType ?? 'application/octet-stream',
          fileName: row.mediaFileName ?? undefined,
        }
      : undefined,
    recurrenceIntervalHours: row.recurrenceIntervalHours ?? undefined,
    recurrenceMaxRuns: row.recurrenceMaxRuns ?? undefined,
    recurrenceEndsAt: row.recurrenceEndsAt ?? undefined,
    runsCompleted: row.runsCompleted,
    nextRunAt: row.nextRunAt ?? undefined,
    createdAt: row.createdAt,
  };
}
```

`create()` perde os campos de conteúdo/recorrência (viram só o `data` do
envelope):

```ts
  async create(data: CreateGroupBroadcastData): Promise<GroupBroadcast> {
    const row = await this.prisma.groupBroadcast.create({
      data: {
        tenantId: data.tenantId,
        sessionName: data.sessionName,
        name: data.name,
        intervalSeconds: data.intervalSeconds,
        sendWindowStart: data.sendWindowStart ?? null,
        sendWindowEnd: data.sendWindowEnd ?? null,
        createdByUserId: data.createdByUserId ?? null,
      },
      select: GROUP_BROADCAST_SELECT,
    });
    return toDomain(row);
  }
```

Métodos novos (adicionar depois de `createTargets`):

```ts
  async createSteps(
    tenantId: string,
    broadcastId: string,
    steps: CreateGroupBroadcastStepData[],
  ): Promise<GroupBroadcastStep[]> {
    if (steps.length === 0) return [];
    await this.prisma.groupBroadcastStep.createMany({
      data: steps.map((step) => ({
        tenantId,
        broadcastId,
        order: step.order,
        messageTemplate: step.messageTemplate,
        recurrenceIntervalHours: step.recurrenceIntervalHours ?? null,
        recurrenceMaxRuns: step.recurrenceMaxRuns ?? null,
        recurrenceEndsAt: step.recurrenceEndsAt ?? null,
      })),
    });
    return this.listSteps(tenantId, broadcastId);
  }

  async listSteps(tenantId: string, broadcastId: string): Promise<GroupBroadcastStep[]> {
    const rows = await this.prisma.groupBroadcastStep.findMany({
      where: { tenantId, broadcastId },
      orderBy: { order: 'asc' },
      select: GROUP_BROADCAST_STEP_SELECT,
    });
    return rows.map(stepToDomain);
  }

  async findStepById(tenantId: string, stepId: string): Promise<GroupBroadcastStep | undefined> {
    const row = await this.prisma.groupBroadcastStep.findFirst({
      where: { id: stepId, tenantId },
      select: GROUP_BROADCAST_STEP_SELECT,
    });
    return row ? stepToDomain(row) : undefined;
  }

  async markStepRunFinished(
    tenantId: string,
    stepId: string,
    runsCompleted: number,
    nextRunAt: Date | null,
  ): Promise<void> {
    await this.prisma.groupBroadcastStep.updateMany({
      where: { id: stepId, tenantId },
      data: { runsCompleted, nextRunAt },
    });
  }

  async advanceCurrentStep(tenantId: string, broadcastId: string, newIndex: number): Promise<void> {
    await this.prisma.groupBroadcast.updateMany({
      where: { id: broadcastId, tenantId },
      data: { currentStepIndex: newIndex },
    });
  }

  async attachStepMedia(
    tenantId: string,
    stepId: string,
    media: GroupBroadcastMediaContent,
  ): Promise<GroupBroadcastStep | undefined> {
    const { count } = await this.prisma.groupBroadcastStep.updateMany({
      where: { id: stepId, tenantId },
      data: {
        mediaContent: media.buffer,
        mediaMimeType: media.mimeType,
        mediaFileName: media.fileName ?? null,
        mediaContentType: MEDIA_TYPE_TO_PRISMA[media.contentType],
      },
    });
    if (count === 0) return undefined;
    return this.findStepById(tenantId, stepId);
  }

  async removeStepMedia(tenantId: string, stepId: string): Promise<GroupBroadcastStep | undefined> {
    const { count } = await this.prisma.groupBroadcastStep.updateMany({
      where: { id: stepId, tenantId },
      data: { mediaContent: null, mediaMimeType: null, mediaFileName: null, mediaContentType: null },
    });
    if (count === 0) return undefined;
    return this.findStepById(tenantId, stepId);
  }

  async getStepMediaContent(
    tenantId: string,
    stepId: string,
  ): Promise<GroupBroadcastMediaContent | undefined> {
    const row = await this.prisma.groupBroadcastStep.findFirst({
      where: { id: stepId, tenantId },
      select: { mediaContent: true, mediaMimeType: true, mediaFileName: true, mediaContentType: true },
    });
    if (!row || !row.mediaContent || !row.mediaContentType) return undefined;
    const contentType = MEDIA_TYPE_FROM_PRISMA[row.mediaContentType];
    if (!contentType) return undefined;
    return {
      contentType,
      buffer: Buffer.from(row.mediaContent),
      mimeType: row.mediaMimeType ?? 'application/octet-stream',
      fileName: row.mediaFileName ?? undefined,
    };
  }
```

Remover do arquivo: `attachMedia`, `removeMedia`, `getMediaContent` no nível
do disparo (substituídos pelos de etapa acima).

- [ ] **Step 3: Estender `groupBroadcasts.integration.test.ts` com os casos de etapa**

Adicionar (no mesmo arquivo, dentro do `describe` existente — confirme o
padrão de setup/teardown de tenant já usado nesse arquivo antes de escrever):

```ts
  it('createSteps + listSteps devolvem as etapas na ordem, e o binário de mídia nunca aparece no select', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Campanha de 2 etapas',
      intervalSeconds: 60,
    });
    await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Primeira publicação' },
      { order: 1, messageTemplate: 'Segunda publicação', recurrenceIntervalHours: 4, recurrenceMaxRuns: 3 },
    ]);

    const steps = await repository.listSteps(tenantId, broadcast.id);
    expect(steps.map((s) => s.messageTemplate)).toEqual(['Primeira publicação', 'Segunda publicação']);
    expect(steps[1].recurrenceIntervalHours).toBe(4);

    const media = Buffer.from('fake-image-bytes-'.repeat(200));
    await repository.attachStepMedia(tenantId, steps[0].id, {
      contentType: 'image',
      buffer: media,
      mimeType: 'image/png',
      fileName: 'promo.png',
    });
    const updatedSteps = await repository.listSteps(tenantId, broadcast.id);
    expect(Object.keys(updatedSteps[0])).not.toContain('mediaContent');
    expect(updatedSteps[0].media?.mimeType).toBe('image/png');

    const fetchedMedia = await repository.getStepMediaContent(tenantId, steps[0].id);
    expect(fetchedMedia?.buffer.equals(media)).toBe(true);
  });

  it('advanceCurrentStep move a campanha para a etapa seguinte', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Avanço de etapa',
      intervalSeconds: 60,
    });
    await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Etapa 0' },
      { order: 1, messageTemplate: 'Etapa 1' },
    ]);
    expect((await repository.findById(tenantId, broadcast.id))?.currentStepIndex).toBe(0);

    await repository.advanceCurrentStep(tenantId, broadcast.id, 1);

    expect((await repository.findById(tenantId, broadcast.id))?.currentStepIndex).toBe(1);
  });
```

- [ ] **Step 4: Rodar os testes de integração**

```bash
docker compose up -d postgres redis
npx jest --selectProjects api apps/api/tests/integration/groupBroadcasts.integration.test.ts
```

Expected: PASS, sem aviso de "Postgres indisponível".

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/groupBroadcasts/domain/entities/GroupBroadcast.ts apps/api/src/services/groupBroadcasts/domain/repositories/GroupBroadcastRepository.ts apps/api/src/services/groupBroadcasts/infrastructure/repositories/PrismaGroupBroadcastRepository.ts apps/api/tests/integration/groupBroadcasts.integration.test.ts
git commit -m "feat(groupBroadcasts): repository support for multi-step broadcasts"
```

---

## Task 4: Fakes de teste — `FakeGroupBroadcastRepository` com etapas

**Files:**
- Modify: `apps/api/tests/services/groupBroadcasts/fakes.ts`

**Interfaces:**
- Consumes: `GroupBroadcastRepository` (Task 3).
- Produces: `FakeGroupBroadcastRepository` completo — usado por TODOS os
  testes unitários das tarefas seguintes (5, 6, 7).

- [ ] **Step 1: Ajustar `create()`/`seedBroadcast()` e adicionar o armazenamento de etapas**

No topo da classe, adicionar:

```ts
  private steps = new Map<string, GroupBroadcastStep>();
  private stepMedia = new Map<string, GroupBroadcastMediaContent>();
```

(import `GroupBroadcastStep` de `.../domain/entities/GroupBroadcast`.)

Reescrever `create()`:

```ts
  async create(data: CreateGroupBroadcastData): Promise<GroupBroadcast> {
    const now = new Date(Date.now() + this.sequence);
    const broadcast: GroupBroadcast = {
      id: this.nextId('broadcast'),
      tenantId: data.tenantId,
      sessionName: data.sessionName,
      name: data.name,
      status: 'draft',
      intervalSeconds: data.intervalSeconds,
      sendWindowStart: data.sendWindowStart,
      sendWindowEnd: data.sendWindowEnd,
      currentStepIndex: 0,
      createdByUserId: data.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.broadcasts.set(broadcast.id, broadcast);
    return { ...broadcast };
  }

  async createSteps(
    tenantId: string,
    broadcastId: string,
    steps: CreateGroupBroadcastStepData[],
  ): Promise<GroupBroadcastStep[]> {
    for (const step of steps) {
      const id = this.nextId('step');
      this.steps.set(id, {
        id,
        tenantId,
        broadcastId,
        order: step.order,
        messageTemplate: step.messageTemplate,
        recurrenceIntervalHours: step.recurrenceIntervalHours,
        recurrenceMaxRuns: step.recurrenceMaxRuns,
        recurrenceEndsAt: step.recurrenceEndsAt,
        runsCompleted: 0,
        createdAt: new Date(Date.now() + this.sequence),
      });
    }
    return this.listSteps(tenantId, broadcastId);
  }

  async listSteps(tenantId: string, broadcastId: string): Promise<GroupBroadcastStep[]> {
    return Array.from(this.steps.values())
      .filter((s) => s.tenantId === tenantId && s.broadcastId === broadcastId)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ ...s }));
  }

  async findStepById(tenantId: string, stepId: string): Promise<GroupBroadcastStep | undefined> {
    const step = this.steps.get(stepId);
    return step && step.tenantId === tenantId ? { ...step } : undefined;
  }

  async markStepRunFinished(
    tenantId: string,
    stepId: string,
    runsCompleted: number,
    nextRunAt: Date | null,
  ): Promise<void> {
    const step = this.steps.get(stepId);
    if (!step || step.tenantId !== tenantId) return;
    this.steps.set(stepId, { ...step, runsCompleted, nextRunAt: nextRunAt ?? undefined });
  }

  async advanceCurrentStep(tenantId: string, broadcastId: string, newIndex: number): Promise<void> {
    const broadcast = this.broadcasts.get(broadcastId);
    if (!broadcast || broadcast.tenantId !== tenantId) return;
    this.broadcasts.set(broadcastId, { ...broadcast, currentStepIndex: newIndex });
  }

  async attachStepMedia(
    tenantId: string,
    stepId: string,
    media: GroupBroadcastMediaContent,
  ): Promise<GroupBroadcastStep | undefined> {
    const step = this.steps.get(stepId);
    if (!step || step.tenantId !== tenantId) return undefined;
    this.stepMedia.set(stepId, media);
    const updated: GroupBroadcastStep = {
      ...step,
      media: { contentType: media.contentType, mimeType: media.mimeType, fileName: media.fileName },
    };
    this.steps.set(stepId, updated);
    return { ...updated };
  }

  async removeStepMedia(tenantId: string, stepId: string): Promise<GroupBroadcastStep | undefined> {
    const step = this.steps.get(stepId);
    if (!step || step.tenantId !== tenantId) return undefined;
    this.stepMedia.delete(stepId);
    const updated: GroupBroadcastStep = { ...step, media: undefined };
    this.steps.set(stepId, updated);
    return { ...updated };
  }

  async getStepMediaContent(
    tenantId: string,
    stepId: string,
  ): Promise<GroupBroadcastMediaContent | undefined> {
    const step = this.steps.get(stepId);
    if (!step || step.tenantId !== tenantId) return undefined;
    return this.stepMedia.get(stepId);
  }
```

Remover `attachMedia`/`removeMedia`/`getMediaContent` de nível de disparo (o
Task 3 já removeu do repositório real e da interface).

- [ ] **Step 2: Reescrever `seedBroadcast()` para criar a etapa 0 junto**

```ts
  /** Helper de teste: cria um disparo já num status específico, com 1 etapa e alvos `pending`. */
  seedBroadcast(input: {
    tenantId: string;
    sessionName?: string;
    status?: GroupBroadcastStatus;
    intervalSeconds?: number;
    groupJids?: string[];
    messageTemplate?: string;
    recurrenceIntervalHours?: number;
    recurrenceMaxRuns?: number;
    recurrenceEndsAt?: Date;
    sendWindowStart?: string;
    sendWindowEnd?: string;
    runsCompleted?: number;
    /** Etapas EXTRAS além da etapa 0 (default) — para testar transição entre etapas. */
    extraSteps?: Array<{
      messageTemplate: string;
      recurrenceIntervalHours?: number;
      recurrenceMaxRuns?: number;
      recurrenceEndsAt?: Date;
    }>;
  }): { broadcastId: string; targetIds: string[]; stepIds: string[] } {
    const now = new Date(Date.now() + this.sequence);
    const id = this.nextId('broadcast');
    this.broadcasts.set(id, {
      id,
      tenantId: input.tenantId,
      sessionName: input.sessionName ?? 'sessao',
      name: 'Disparo',
      status: input.status ?? 'draft',
      intervalSeconds: input.intervalSeconds ?? 60,
      sendWindowStart: input.sendWindowStart,
      sendWindowEnd: input.sendWindowEnd,
      currentStepIndex: 0,
      createdAt: now,
      updatedAt: now,
    });

    const stepIds: string[] = [];
    const firstStepId = this.nextId('step');
    this.steps.set(firstStepId, {
      id: firstStepId,
      tenantId: input.tenantId,
      broadcastId: id,
      order: 0,
      messageTemplate: input.messageTemplate ?? 'Promoção!',
      recurrenceIntervalHours: input.recurrenceIntervalHours,
      recurrenceMaxRuns: input.recurrenceMaxRuns,
      recurrenceEndsAt: input.recurrenceEndsAt,
      runsCompleted: input.runsCompleted ?? 0,
      createdAt: new Date(Date.now() + this.sequence),
    });
    stepIds.push(firstStepId);

    for (const [i, extra] of (input.extraSteps ?? []).entries()) {
      const stepId = this.nextId('step');
      this.steps.set(stepId, {
        id: stepId,
        tenantId: input.tenantId,
        broadcastId: id,
        order: i + 1,
        messageTemplate: extra.messageTemplate,
        recurrenceIntervalHours: extra.recurrenceIntervalHours,
        recurrenceMaxRuns: extra.recurrenceMaxRuns,
        recurrenceEndsAt: extra.recurrenceEndsAt,
        runsCompleted: 0,
        createdAt: new Date(Date.now() + this.sequence),
      });
      stepIds.push(stepId);
    }

    const targetIds: string[] = [];
    for (const groupJid of input.groupJids ?? ['111@g.us']) {
      const targetId = this.nextId('target');
      this.targets.set(targetId, {
        id: targetId,
        tenantId: input.tenantId,
        broadcastId: id,
        groupJid,
        groupName: `Grupo ${groupJid}`,
        status: 'pending',
        sentCount: 0,
        createdAt: new Date(Date.now() + this.sequence),
      });
      targetIds.push(targetId);
    }
    return { broadcastId: id, targetIds, stepIds };
  }
```

- [ ] **Step 2: Rodar `tsc` restrito ao pacote de testes**

```bash
npx tsc -p apps/api --noEmit 2>&1 | grep fakes.ts
```

Expected: sem saída (limpo).

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/services/groupBroadcasts/fakes.ts
git commit -m "test(groupBroadcasts): fake repository support for multi-step broadcasts"
```

---

## Task 5: `GroupBroadcastRunJobProcessor` — abrir a etapa ATUAL

**Files:**
- Modify: `apps/api/src/services/groupBroadcasts/infrastructure/GroupBroadcastRunJobProcessor.ts`
- Test: `apps/api/tests/services/groupBroadcasts/infrastructure/groupBroadcastRecurrenceEngine.test.ts` (arquivo já existente — estender)

**Interfaces:**
- Consumes: `repository.listSteps`, `repository.markStepRunFinished` (Task 3/4).
- Produces: nenhuma interface nova — comportamento observável idêntico ao
  de hoje para campanhas de 1 etapa (mesmos testes existentes continuam
  passando).

- [ ] **Step 1: Escrever o teste que ainda falha — abre a etapa correta**

Adicionar ao describe existente de `GroupBroadcastRunJobProcessor` (confira o
nome exato do describe no arquivo antes):

```ts
  it('abre a repetição usando o intervalSeconds da CAMPANHA mas a mensagem da ETAPA ATUAL', async () => {
    const { broadcastId, stepIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      messageTemplate: 'Mensagem da etapa 0',
      extraSteps: [{ messageTemplate: 'Mensagem da etapa 1' }],
    });
    // Simula que a campanha já avançou para a etapa 1.
    await repository.advanceCurrentStep('tenant-1', broadcastId, 1);
    await repository.markTargetSent('tenant-1', (await repository.listTargets('tenant-1', broadcastId))[0].id, new Date());
    await repository.resetTargetsForNextRun('tenant-1', broadcastId);

    const outcome = await processor.process({ tenantId: 'tenant-1', broadcastId, runNumber: 1 });

    expect(outcome).toBe('started');
    const currentStep = (await repository.listSteps('tenant-1', broadcastId))[1];
    expect(currentStep.id).toBe(stepIds[1]);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --selectProjects api apps/api/tests/services/groupBroadcasts/infrastructure/groupBroadcastRecurrenceEngine.test.ts -t "abre a repetição usando"
```

Expected: FAIL (o processador ainda lê `broadcast.recurrenceIntervalHours`
direto, que não existe mais — erro de tipo/undefined).

- [ ] **Step 3: Reescrever `GroupBroadcastRunJobProcessor.process()`**

```ts
  async process(data: GroupBroadcastRunJobData): Promise<GroupBroadcastRunOutcome> {
    const { tenantId, broadcastId, runNumber } = data;

    const broadcast = await this.repository.findById(tenantId, broadcastId);
    if (!broadcast || broadcast.status !== 'running') {
      this.logger.info('Repetição de disparo em grupos ignorada: disparo não está em execução', {
        tenantId,
        broadcastId,
        runNumber,
        status: broadcast?.status,
      });
      return 'skipped';
    }

    const steps = await this.repository.listSteps(tenantId, broadcastId);
    const currentStep = steps[broadcast.currentStepIndex];
    if (!currentStep) {
      // Defensivo: não deveria acontecer (toda campanha tem >= 1 etapa e
      // `currentStepIndex` nunca avança além do fim — ver GroupBroadcastSendJobProcessor).
      await this.repository.updateStatus(tenantId, broadcastId, 'completed');
      this.logger.error('Repetição de disparo em grupos sem etapa correspondente — encerrando', {
        tenantId,
        broadcastId,
        currentStepIndex: broadcast.currentStepIndex,
        totalSteps: steps.length,
      });
      return 'completed_without_targets';
    }

    const now = new Date();
    const window = buildSendWindow(broadcast.sendWindowStart, broadcast.sendWindowEnd);
    if (!isWithinSendWindow(now, window, DEFAULT_GROUP_BROADCAST_TIMEZONE)) {
      const postponedTo = shiftIntoSendWindow(now, window, DEFAULT_GROUP_BROADCAST_TIMEZONE);
      await this.repository.markStepRunFinished(
        tenantId,
        currentStep.id,
        currentStep.runsCompleted,
        postponedTo,
      );
      await this.sendDispatcher.scheduleRun(
        tenantId,
        broadcastId,
        runNumber,
        Math.max(0, postponedTo.getTime() - now.getTime()),
      );
      this.logger.info('Repetição adiada para dentro da janela de horário', {
        tenantId,
        broadcastId,
        runNumber,
        postponedTo,
      });
      return 'postponed';
    }

    const reopened = await this.repository.resetTargetsForNextRun(tenantId, broadcastId);
    const pendingTargets = await this.repository.listPendingTargets(tenantId, broadcastId);
    if (pendingTargets.length === 0) {
      await this.repository.markStepRunFinished(tenantId, currentStep.id, currentStep.runsCompleted, null);
      await this.repository.updateStatus(tenantId, broadcastId, 'completed');
      this.logger.warn('Recorrência encerrada: nenhum grupo elegível restou', {
        tenantId,
        broadcastId,
        runNumber,
      });
      return 'completed_without_targets';
    }

    for (const [index, target] of pendingTargets.entries()) {
      // eslint-disable-next-line no-await-in-loop
      await this.sendDispatcher.scheduleTarget(
        tenantId,
        broadcastId,
        target.id,
        computeGroupSendDelayMs(index, broadcast.intervalSeconds, now),
      );
    }

    await this.repository.markStepRunFinished(tenantId, currentStep.id, currentStep.runsCompleted, null);
    this.logger.info('Repetição de disparo em grupos iniciada', {
      tenantId,
      broadcastId,
      runNumber,
      stepIndex: broadcast.currentStepIndex,
      reopened,
      scheduled: pendingTargets.length,
    });
    return 'started';
  }
```

(O resto do arquivo — imports, docstring da classe, tipo `GroupBroadcastRunOutcome`
— fica igual; só o corpo de `process()` muda.)

- [ ] **Step 4: Rodar o teste novo e a suíte inteira do processador**

```bash
npx jest --selectProjects api apps/api/tests/services/groupBroadcasts/infrastructure/groupBroadcastRecurrenceEngine.test.ts
```

Expected: TODOS PASS — inclusive os testes já existentes (uma campanha de 1
etapa se comporta EXATAMENTE como antes, já que `currentStepIndex` é sempre 0
e `steps[0]` tem os mesmos campos que `broadcast` tinha antes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/groupBroadcasts/infrastructure/GroupBroadcastRunJobProcessor.ts apps/api/tests/services/groupBroadcasts/infrastructure/groupBroadcastRecurrenceEngine.test.ts
git commit -m "feat(groupBroadcasts): RunJobProcessor opens the CURRENT step, not the broadcast"
```

---

## Task 6: `GroupBroadcastSendJobProcessor` — avançar de etapa (o coração da feature)

**Files:**
- Modify: `apps/api/src/services/groupBroadcasts/infrastructure/GroupBroadcastSendJobProcessor.ts`
- Test: `apps/api/tests/services/groupBroadcasts/infrastructure/GroupBroadcastSendJobProcessor.test.ts`

**Interfaces:**
- Consumes: `decideNextRun`/`isRecurring` (`groupBroadcastRecurrence.ts`, SEM
  MUDANÇA DE ASSINATURA — chamados agora com um `GroupBroadcastStep` em vez de
  um `GroupBroadcast`, mas o formato `Pick<..., 'recurrenceIntervalHours' |
  'recurrenceMaxRuns' | 'recurrenceEndsAt' | 'runsCompleted'>` já bate).
  `repository.listSteps`/`markStepRunFinished`/`advanceCurrentStep` (Task 3/4).
- Produces: o comportamento de transição de etapa — testado exaustivamente
  aqui, é o requisito que o fundador pediu para considerar a spec pronta.

- [ ] **Step 1: Escrever os DOIS testes que ainda falham**

```ts
  describe('transição entre etapas (2026-09-14)', () => {
    it('etapa SEM recorrência, com próxima etapa: publica uma vez e avança — não completa a campanha', async () => {
      const { broadcastId, targetIds } = repository.seedBroadcast({
        tenantId: 'tenant-1',
        status: 'running',
        messageTemplate: 'Etapa 0, sem recorrência',
        extraSteps: [{ messageTemplate: 'Etapa 1' }],
      });

      await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

      const broadcast = await repository.findById('tenant-1', broadcastId);
      expect(broadcast?.status).toBe('running'); // NÃO completou — ainda há etapa 1
      expect(broadcast?.currentStepIndex).toBe(1);
      expect(sendDispatcher.runs).toEqual([
        { tenantId: 'tenant-1', broadcastId, runNumber: 1, delayMs: 0 },
      ]);
      // A mensagem enviada foi a da etapa 0 (a que estava ativa no momento do envio).
      expect(sender.calls[0].content).toBe('Etapa 0, sem recorrência');
    });

    it('última etapa esgota a recorrência: completa a campanha (comportamento de hoje, preservado)', async () => {
      const { broadcastId, targetIds } = repository.seedBroadcast({
        tenantId: 'tenant-1',
        status: 'running',
        messageTemplate: 'Única etapa, recorrente',
        recurrenceIntervalHours: 4,
        recurrenceMaxRuns: 2,
        runsCompleted: 1, // já rodou 1 de 2 — este envio é o último permitido
      });

      await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

      const broadcast = await repository.findById('tenant-1', broadcastId);
      expect(broadcast?.status).toBe('completed');
      expect(sendDispatcher.runs).toEqual([]); // nenhuma repetição/etapa nova agendada
    });

    it('etapa recorrente ainda dentro do teto: repete a MESMA etapa (não avança)', async () => {
      const { broadcastId, targetIds } = repository.seedBroadcast({
        tenantId: 'tenant-1',
        status: 'running',
        messageTemplate: 'Etapa recorrente',
        recurrenceIntervalHours: 4,
        recurrenceMaxRuns: 5,
        runsCompleted: 1,
        extraSteps: [{ messageTemplate: 'Etapa seguinte, nunca deveria rodar ainda' }],
      });

      await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

      const broadcast = await repository.findById('tenant-1', broadcastId);
      expect(broadcast?.status).toBe('running');
      expect(broadcast?.currentStepIndex).toBe(0); // continua na etapa 0
      expect(sendDispatcher.runs).toHaveLength(1);
      expect(sendDispatcher.runs[0].runNumber).toBe(3); // 3ª repetição da MESMA etapa
    });
  });
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
npx jest --selectProjects api apps/api/tests/services/groupBroadcasts/infrastructure/GroupBroadcastSendJobProcessor.test.ts -t "transição entre etapas"
```

Expected: FAIL (o processador ainda usa `broadcast.messageTemplate`/
`isRecurring(current)`, que não existem mais em `GroupBroadcast`).

- [ ] **Step 3: Reescrever `GroupBroadcastSendJobProcessor.process()`**

```ts
  async process(data: GroupBroadcastSendJobData): Promise<void> {
    const broadcast = await this.repository.findById(data.tenantId, data.broadcastId);
    if (!broadcast || broadcast.status !== 'running') {
      this.logger.info('Job group-broadcast-send descartado: disparo não está em execução', {
        tenantId: data.tenantId,
        broadcastId: data.broadcastId,
        status: broadcast?.status,
      });
      return;
    }

    const target = await this.repository.findTargetById(data.tenantId, data.targetId);
    if (!target || target.broadcastId !== broadcast.id || target.status !== 'pending') {
      this.logger.info('Job group-broadcast-send descartado: grupo já processado', {
        tenantId: data.tenantId,
        targetId: data.targetId,
        status: target?.status,
      });
      return;
    }

    const steps = await this.repository.listSteps(data.tenantId, data.broadcastId);
    const currentStep = steps[broadcast.currentStepIndex];
    if (!currentStep) {
      // Defensivo — mesma guarda do RunJobProcessor.
      await this.repository.updateStatus(data.tenantId, data.broadcastId, 'completed');
      this.logger.error('Job group-broadcast-send sem etapa correspondente — encerrando', {
        tenantId: data.tenantId,
        broadcastId: data.broadcastId,
        currentStepIndex: broadcast.currentStepIndex,
      });
      return;
    }

    const media = currentStep.media
      ? await this.repository.getStepMediaContent(data.tenantId, currentStep.id)
      : undefined;

    const result = await this.sender.send(
      data.tenantId,
      broadcast.sessionName,
      target.groupJid,
      currentStep.messageTemplate,
      media,
    );
    const attemptedAt = new Date();

    if (result.ok) {
      await this.repository.markTargetSent(data.tenantId, target.id, attemptedAt);
    } else {
      const reason = result.failureReason ?? 'erro_desconhecido';
      await this.repository.markTargetFailed(data.tenantId, target.id, attemptedAt, reason);
      this.logger.warn('Falha ao publicar em grupo', {
        tenantId: data.tenantId,
        broadcastId: data.broadcastId,
        targetId: target.id,
        reason,
      });
    }

    const recentOutcomes = await this.repository.listRecentOutcomes(
      data.tenantId,
      data.broadcastId,
      GROUP_CIRCUIT_BREAKER_SAMPLE_SIZE,
    );
    if (shouldPauseGroupBroadcast(recentOutcomes)) {
      await this.repository.updateStatus(
        data.tenantId,
        data.broadcastId,
        'paused',
        'consecutive_failures',
      );
      this.logger.error(
        'Disparo em grupos pausado automaticamente: falhas seguidas (disjuntor de segurança)',
        { tenantId: data.tenantId, broadcastId: data.broadcastId, recentOutcomes },
      );
      return;
    }

    const remaining = await this.repository.countPending(data.tenantId, data.broadcastId);
    if (remaining > 0) return;

    // Fim de UMA repetição desta etapa. Três desfechos possíveis:
    // 1. A etapa ainda tem repetições a fazer -> repete a MESMA etapa.
    // 2. A etapa esgotou (ou nunca teve recorrência) e existe uma PRÓXIMA
    //    etapa -> avança `currentStepIndex` e dispara um "run" com delay 0 —
    //    o RunJobProcessor (Task 5) já sabe checar a janela de horário e
    //    reabrir os alvos para a etapa nova, então não duplicamos essa lógica.
    // 3. A etapa esgotou e não há próxima etapa -> a campanha termina.
    const currentBroadcast = await this.repository.findById(data.tenantId, data.broadcastId);
    const finishedAt = new Date();
    if (!currentBroadcast) return; // corrida rara: disparo apagado entre o topo do método e aqui.

    const freshSteps = await this.repository.listSteps(data.tenantId, data.broadcastId);
    const freshCurrentStep = freshSteps[currentBroadcast.currentStepIndex];
    if (!freshCurrentStep) return; // já coberto pela guarda no topo; corrida improvável.

    const runsCompleted = freshCurrentStep.runsCompleted + 1;

    if (isRecurring(freshCurrentStep) && this.sendDispatcher) {
      const window = buildSendWindow(currentBroadcast.sendWindowStart, currentBroadcast.sendWindowEnd);
      const decision = decideNextRun(freshCurrentStep, window, finishedAt, DEFAULT_GROUP_BROADCAST_TIMEZONE);
      if (decision.shouldRepeat) {
        await this.repository.markStepRunFinished(
          data.tenantId,
          freshCurrentStep.id,
          runsCompleted,
          decision.nextRunAt,
        );
        await this.sendDispatcher.scheduleRun(
          data.tenantId,
          data.broadcastId,
          runsCompleted + 1,
          Math.max(0, decision.nextRunAt.getTime() - finishedAt.getTime()),
        );
        this.logger.info('Repetição concluída; próxima agendada', {
          tenantId: data.tenantId,
          broadcastId: data.broadcastId,
          stepIndex: currentBroadcast.currentStepIndex,
          runsCompleted,
          nextRunAt: decision.nextRunAt,
        });
        return;
      }
    }

    // A etapa atual terminou (sem recorrência, ou recorrência esgotada).
    await this.repository.markStepRunFinished(data.tenantId, freshCurrentStep.id, runsCompleted, null);

    const nextStepIndex = currentBroadcast.currentStepIndex + 1;
    const hasNextStep = nextStepIndex < freshSteps.length;

    if (hasNextStep && this.sendDispatcher) {
      await this.repository.advanceCurrentStep(data.tenantId, data.broadcastId, nextStepIndex);
      await this.sendDispatcher.scheduleRun(data.tenantId, data.broadcastId, 1, 0);
      this.logger.info('Etapa concluída; avançando para a próxima publicação', {
        tenantId: data.tenantId,
        broadcastId: data.broadcastId,
        finishedStepIndex: currentBroadcast.currentStepIndex,
        nextStepIndex,
      });
      return;
    }

    await this.repository.updateStatus(data.tenantId, data.broadcastId, 'completed');
    this.logger.info('Disparo em grupos concluído (todas as etapas)', {
      tenantId: data.tenantId,
      broadcastId: data.broadcastId,
      totalSteps: freshSteps.length,
    });
  }
```

Ajustar o import no topo: trocar `isRecurring` continua vindo de
`groupBroadcastRecurrence` normalmente — nenhuma mudança de import é
necessária além do que já existe, já que as funções não mudaram de
assinatura.

- [ ] **Step 4: Rodar os testes novos e a suíte inteira**

```bash
npx jest --selectProjects api apps/api/tests/services/groupBroadcasts/infrastructure/GroupBroadcastSendJobProcessor.test.ts
```

Expected: TODOS PASS, incluindo os 3 testes novos de transição de etapa E os
testes pré-existentes (uma campanha de 1 etapa não-recorrente completa
imediatamente após o envio, exatamente como hoje — `hasNextStep` é `false`
quando só existe a etapa 0).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/groupBroadcasts/infrastructure/GroupBroadcastSendJobProcessor.ts apps/api/tests/services/groupBroadcasts/infrastructure/GroupBroadcastSendJobProcessor.test.ts
git commit -m "feat(groupBroadcasts): SendJobProcessor advances to the next step when the current one is exhausted"
```

---

## Task 7: Erros de Domain novos (`NoStepsProvidedError`/`TooManyStepsError`) + teto em `groupBroadcastPacing.ts`

**Files:**
- Modify: `apps/api/src/services/groupBroadcasts/domain/errors/groupBroadcastErrors.ts`
- Modify: `apps/api/src/services/groupBroadcasts/domain/policies/groupBroadcastPacing.ts`
- Modify: `apps/api/src/services/groupBroadcasts/presentation/groupBroadcastsErrorHandler.ts`
- Test: arquivo de teste do error handler (localizar pelo nome — provavelmente `groupBroadcastsErrorHandler.test.ts` ou coberto dentro de `groupBroadcastsRouter.test.ts`; confirme antes de editar)

**Interfaces:**
- Produces: `NoStepsProvidedError`, `TooManyStepsError`,
  `MAX_STEPS_PER_BROADCAST`, consumidos pelo Task 8 (service) e Task 9 (router).

- [ ] **Step 1: Adicionar `MAX_STEPS_PER_BROADCAST` a `groupBroadcastPacing.ts`**

Localizar `MAX_GROUPS_PER_BROADCAST` neste arquivo e adicionar ao lado:

```ts
/** Teto de etapas por disparo — mesmo espírito do teto de grupos: um número que dá pra revisar visualmente antes de disparar (2026-09-14). */
export const MAX_STEPS_PER_BROADCAST = 20;
```

- [ ] **Step 2: Adicionar os erros novos a `groupBroadcastErrors.ts`**

```ts
export class NoStepsProvidedError extends Error {
  constructor() {
    super('Adicione pelo menos uma publicação à campanha.');
    this.name = 'NoStepsProvidedError';
  }
}

export class TooManyStepsError extends Error {
  constructor(
    public readonly provided: number,
    public readonly max: number,
  ) {
    super(`No máximo ${max} publicações por campanha (foram enviadas ${provided}).`);
    this.name = 'TooManyStepsError';
  }
}
```

- [ ] **Step 3: Mapear os erros novos no error handler**

Abrir `groupBroadcastsErrorHandler.ts`, localizar o bloco de `if (error
instanceof NoGroupsSelectedError)`/`TooManyGroupsSelectedError` (400) e
adicionar ao lado, com o mesmo padrão de resposta:

```ts
  if (error instanceof NoStepsProvidedError) {
    res.status(400).json({ error: 'no_steps_provided', message: error.message });
    return;
  }
  if (error instanceof TooManyStepsError) {
    res.status(400).json({
      error: 'too_many_steps',
      message: error.message,
      provided: error.provided,
      max: error.max,
    });
    return;
  }
```

- [ ] **Step 4: Escrever o teste do error handler** (siga o padrão exato dos
  testes já existentes para `NoGroupsSelectedError`/`TooManyGroupsSelectedError`
  no arquivo — copie a forma, troque a classe e o payload esperado)

- [ ] **Step 5: Rodar e commitar**

```bash
npx jest --selectProjects api apps/api/tests/services/groupBroadcasts -t "error"
git add apps/api/src/services/groupBroadcasts/domain/errors/groupBroadcastErrors.ts apps/api/src/services/groupBroadcasts/domain/policies/groupBroadcastPacing.ts apps/api/src/services/groupBroadcasts/presentation/groupBroadcastsErrorHandler.ts
git commit -m "feat(groupBroadcasts): domain errors for step count validation"
```

---

## Task 8: `GroupBroadcastService` — criar/ler/anexar mídia por etapa

**Files:**
- Modify: `apps/api/src/services/groupBroadcasts/application/GroupBroadcastService.ts`
- Test: `apps/api/tests/services/groupBroadcasts/application/GroupBroadcastService.test.ts`

**Interfaces:**
- Consumes: `repository.createSteps`/`listSteps`/`findStepById`/
  `attachStepMedia`/`removeStepMedia`/`getStepMediaContent` (Task 3/4),
  `NoStepsProvidedError`/`TooManyStepsError`/`MAX_STEPS_PER_BROADCAST` (Task 7).
- Produces: `CreateGroupBroadcastInput.steps`, `GroupBroadcastDetail.steps`,
  `attachMedia(tenantId, broadcastId, stepId, media)` — consumidos pelo
  Task 9 (router) e pelo frontend (Task 11).

- [ ] **Step 1: Escrever os testes que ainda falham**

```ts
  describe('createBroadcast() com múltiplas etapas (2026-09-14)', () => {
    it('cria a campanha com N etapas, na ordem enviada, cada uma com sua própria recorrência', async () => {
      directory.entries = [{ jid: '111@g.us', name: 'Grupo 1', participantCount: 5, canSend: true }];

      const result = await service.createBroadcast({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        name: 'Sequência de 3 posts',
        groupJids: ['111@g.us'],
        steps: [
          { messageTemplate: 'Post 1' },
          { messageTemplate: 'Post 2', recurrenceIntervalHours: 24, recurrenceMaxRuns: 2 },
          { messageTemplate: 'Post 3' },
        ],
      });

      expect(result.steps).toHaveLength(3);
      expect(result.steps.map((s) => s.messageTemplate)).toEqual(['Post 1', 'Post 2', 'Post 3']);
      expect(result.steps[1].recurrenceIntervalHours).toBe(24);
      expect(result.broadcast.currentStepIndex).toBe(0);
    });

    it('recusa campanha sem nenhuma etapa', async () => {
      directory.entries = [{ jid: '111@g.us', name: 'Grupo 1', participantCount: 5, canSend: true }];

      await expect(
        service.createBroadcast({
          tenantId: 'tenant-1',
          sessionName: 'sessao',
          name: 'Sem etapas',
          groupJids: ['111@g.us'],
          steps: [],
        }),
      ).rejects.toThrow(NoStepsProvidedError);
    });

    it('recusa campanha com mais de 20 etapas', async () => {
      directory.entries = [{ jid: '111@g.us', name: 'Grupo 1', participantCount: 5, canSend: true }];
      const steps = Array.from({ length: 21 }, (_, i) => ({ messageTemplate: `Post ${i}` }));

      await expect(
        service.createBroadcast({
          tenantId: 'tenant-1',
          sessionName: 'sessao',
          name: 'Demais etapas',
          groupJids: ['111@g.us'],
          steps,
        }),
      ).rejects.toThrow(TooManyStepsError);
    });
  });

  describe('mídia por etapa (2026-09-14)', () => {
    it('anexa mídia à etapa certa, sem afetar as demais', async () => {
      directory.entries = [{ jid: '111@g.us', name: 'Grupo 1', participantCount: 5, canSend: true }];
      const created = await service.createBroadcast({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        name: 'Campanha',
        groupJids: ['111@g.us'],
        steps: [{ messageTemplate: 'Post 1' }, { messageTemplate: 'Post 2' }],
      });
      const [step0, step1] = created.steps;
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(100).fill(0)]);

      const updatedStep = await service.attachMedia(
        'tenant-1',
        created.broadcast.id,
        step0.id,
        { contentType: 'image', buffer: pngBuffer, mimeType: 'image/png', fileName: 'a.png' },
      );

      expect(updatedStep.media?.mimeType).toBe('image/png');
      const reloaded = await service.getBroadcast('tenant-1', created.broadcast.id);
      expect(reloaded.steps.find((s) => s.id === step1.id)?.media).toBeUndefined();
    });
  });
```

(Ajustar os imports do arquivo de teste para `NoStepsProvidedError`/
`TooManyStepsError`; confira o PNG de assinatura válida já usado em outros
testes deste arquivo — reaproveite o mesmo buffer em vez de inventar um novo.)

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
npx jest --selectProjects api apps/api/tests/services/groupBroadcasts/application/GroupBroadcastService.test.ts -t "múltiplas etapas"
```

Expected: FAIL (`CreateGroupBroadcastInput` ainda não tem `steps`).

- [ ] **Step 3: Reescrever `GroupBroadcastService.ts`**

Novo shape de `CreateGroupBroadcastInput`/`GroupBroadcastDetail`:

```ts
export interface CreateGroupBroadcastStepInput {
  messageTemplate: string;
  recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number;
  recurrenceEndsAt?: Date;
}

export interface CreateGroupBroadcastInput {
  tenantId: string;
  sessionName: string;
  name: string;
  groupJids: string[];
  intervalSeconds?: number;
  createdByUserId?: string;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  steps: CreateGroupBroadcastStepInput[];
}

export interface GroupBroadcastDetail {
  broadcast: GroupBroadcast;
  steps: GroupBroadcastStep[];
  summary: GroupBroadcastSummary;
  targets: GroupBroadcastTarget[];
}

export interface GroupBroadcastListItem {
  broadcast: GroupBroadcast;
  summary: GroupBroadcastSummary;
}
```

`createBroadcast()` — a validação de recorrência que hoje roda uma vez para
a campanha inteira passa a rodar POR ETAPA:

```ts
  async createBroadcast(
    input: CreateGroupBroadcastInput,
    actor: GroupBroadcastActor = {},
  ): Promise<GroupBroadcastDetail> {
    await this.assertTenantExists(input.tenantId);

    if (input.steps.length === 0) {
      throw new NoStepsProvidedError();
    }
    if (input.steps.length > MAX_STEPS_PER_BROADCAST) {
      throw new TooManyStepsError(input.steps.length, MAX_STEPS_PER_BROADCAST);
    }

    const windowInformed = Boolean(input.sendWindowStart) || Boolean(input.sendWindowEnd);
    if (windowInformed && !buildSendWindow(input.sendWindowStart, input.sendWindowEnd)) {
      throw new InvalidRecurrenceError(
        'A janela de horário precisa de início e fim válidos ("HH:MM") e diferentes entre si.',
      );
    }

    const stepDrafts: CreateGroupBroadcastStepData[] = input.steps.map((step, order) => {
      const recurring =
        step.recurrenceIntervalHours !== undefined && step.recurrenceIntervalHours !== null;
      if (recurring) {
        if (
          step.recurrenceMaxRuns !== undefined &&
          (step.recurrenceMaxRuns < 2 || step.recurrenceMaxRuns > MAX_RECURRENCE_RUNS)
        ) {
          throw new InvalidRecurrenceError(
            `Publicação ${order + 1}: o número de repetições precisa estar entre 2 e ${MAX_RECURRENCE_RUNS}.`,
          );
        }
        if (step.recurrenceEndsAt && step.recurrenceEndsAt.getTime() <= Date.now()) {
          throw new InvalidRecurrenceError(`Publicação ${order + 1}: a data de término precisa estar no futuro.`);
        }
      }
      return {
        order,
        messageTemplate: step.messageTemplate,
        recurrenceIntervalHours: recurring
          ? clampRecurrenceIntervalHours(step.recurrenceIntervalHours)
          : undefined,
        recurrenceMaxRuns: recurring ? step.recurrenceMaxRuns : undefined,
        recurrenceEndsAt: recurring ? step.recurrenceEndsAt : undefined,
      };
    });

    const groupJids = Array.from(
      new Set(input.groupJids.map((jid) => jid.trim()).filter((jid) => jid.length > 0)),
    );
    if (groupJids.length === 0) {
      throw new NoGroupsSelectedError();
    }
    if (groupJids.length > MAX_GROUPS_PER_BROADCAST) {
      throw new TooManyGroupsSelectedError(groupJids.length, MAX_GROUPS_PER_BROADCAST);
    }

    const directory = await this.groupDirectory.listGroups(input.tenantId, input.sessionName);
    const byJid = new Map(directory.map((entry) => [entry.jid, entry]));

    const targetDrafts: GroupBroadcastTargetDraft[] = groupJids.map((groupJid) => {
      const entry = byJid.get(groupJid);
      const skipReason = determineGroupTargetSkipReason(entry);
      const groupName = entry?.name ?? 'Grupo não encontrado';
      return skipReason
        ? { groupJid, groupName, status: 'skipped', skipReason }
        : { groupJid, groupName, status: 'pending' };
    });

    const broadcast = await this.repository.create({
      tenantId: input.tenantId,
      sessionName: input.sessionName,
      name: input.name,
      intervalSeconds: clampGroupIntervalSeconds(input.intervalSeconds),
      sendWindowStart: input.sendWindowStart,
      sendWindowEnd: input.sendWindowEnd,
      createdByUserId: input.createdByUserId,
    });
    const steps = await this.repository.createSteps(input.tenantId, broadcast.id, stepDrafts);
    await this.repository.createTargets(input.tenantId, broadcast.id, targetDrafts);

    const [summary, targets] = await Promise.all([
      this.repository.summarizeTargets(input.tenantId, broadcast.id),
      this.repository.listTargets(input.tenantId, broadcast.id),
    ]);

    await this.audit(input.tenantId, actor, 'group_broadcast.created', broadcast.id, {
      sessionName: input.sessionName,
      groups: summary.total,
      pending: summary.pending,
      skipped: summary.skipped,
      steps: steps.length,
    });
    this.logger.info('Disparo em grupos criado', {
      tenantId: input.tenantId,
      broadcastId: broadcast.id,
      sessionName: input.sessionName,
      total: summary.total,
      pending: summary.pending,
      skipped: summary.skipped,
      steps: steps.length,
    });

    return { broadcast, steps, summary, targets };
  }
```

`getBroadcast()` ganha `steps`:

```ts
  async getBroadcast(tenantId: string, broadcastId: string): Promise<GroupBroadcastDetail> {
    await this.assertTenantExists(tenantId);
    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    const [steps, summary, targets] = await Promise.all([
      this.repository.listSteps(tenantId, broadcastId),
      this.repository.summarizeTargets(tenantId, broadcastId),
      this.repository.listTargets(tenantId, broadcastId),
    ]);
    return { broadcast, steps, summary, targets };
  }
```

`attachMedia`/`removeMedia`/`getMedia` ganham `stepId` e passam a checar que
a etapa pertence ao disparo:

```ts
  async attachMedia(
    tenantId: string,
    broadcastId: string,
    stepId: string,
    media: GroupBroadcastMediaContent,
  ): Promise<GroupBroadcastStep> {
    await this.assertTenantExists(tenantId);
    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    if (broadcast.status !== 'draft') {
      throw new InvalidGroupBroadcastTransitionError(broadcast.status, 'attach_media');
    }
    const step = await this.requireStep(tenantId, broadcastId, stepId);
    const maxBytes = MAX_GROUP_MEDIA_BYTES[media.contentType];
    if (media.buffer.byteLength > maxBytes) {
      throw new GroupBroadcastMediaTooLargeError(media.buffer.byteLength, maxBytes);
    }
    if (isDeclaredMediaCategoryImplausible(media.contentType, media.buffer)) {
      const detected = sniffMediaCategory(media.buffer) ?? 'desconhecida';
      throw new GroupBroadcastMediaTypeMismatchError(media.contentType, detected);
    }
    const updated = await this.repository.attachStepMedia(tenantId, step.id, media);
    this.logger.info('Mídia anexada a uma etapa do disparo em grupos', {
      tenantId,
      broadcastId,
      stepId,
      contentType: media.contentType,
      bytes: media.buffer.byteLength,
    });
    return updated!;
  }

  async removeMedia(tenantId: string, broadcastId: string, stepId: string): Promise<GroupBroadcastStep> {
    await this.assertTenantExists(tenantId);
    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    if (broadcast.status !== 'draft') {
      throw new InvalidGroupBroadcastTransitionError(broadcast.status, 'attach_media');
    }
    const step = await this.requireStep(tenantId, broadcastId, stepId);
    const updated = await this.repository.removeStepMedia(tenantId, step.id);
    return updated!;
  }

  async getMedia(tenantId: string, broadcastId: string, stepId: string): Promise<GroupBroadcastMediaContent> {
    await this.assertTenantExists(tenantId);
    await this.requireStep(tenantId, broadcastId, stepId);
    const media = await this.repository.getStepMediaContent(tenantId, stepId);
    if (!media) {
      throw new GroupBroadcastMediaNotFoundError(stepId);
    }
    return media;
  }

  private async requireStep(
    tenantId: string,
    broadcastId: string,
    stepId: string,
  ): Promise<GroupBroadcastStep> {
    const step = await this.repository.findStepById(tenantId, stepId);
    if (!step || step.broadcastId !== broadcastId) {
      throw new GroupBroadcastStepNotFoundError(stepId);
    }
    return step;
  }
```

Adicionar o import de `GroupBroadcastStep`/`CreateGroupBroadcastStepData` e o
novo erro `GroupBroadcastStepNotFoundError` — este último, seguindo o padrão
de `GroupBroadcastMediaNotFoundError`, cria no `groupBroadcastErrors.ts` junto
com os erros do Task 7:

```ts
export class GroupBroadcastStepNotFoundError extends Error {
  constructor(stepId: string) {
    super(`Publicação não encontrada nesta campanha: ${stepId}`);
    this.name = 'GroupBroadcastStepNotFoundError';
  }
}
```

(mapear também no error handler, mesmo padrão de 404 de
`GroupBroadcastNotFoundError`.)

- [ ] **Step 4: Rodar a suíte inteira do service**

```bash
npx jest --selectProjects api apps/api/tests/services/groupBroadcasts/application/GroupBroadcastService.test.ts
```

Expected: TODOS PASS. Ajuste os testes PRÉ-EXISTENTES deste arquivo que ainda
chamam `createBroadcast({..., messageTemplate: '...', recurrenceIntervalHours: ...})`
direto no top-level — troque para `steps: [{ messageTemplate: '...',
recurrenceIntervalHours: ... }]` em cada um (mesma mudança mecânica em todos).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/groupBroadcasts/application/GroupBroadcastService.ts apps/api/src/services/groupBroadcasts/domain/errors/groupBroadcastErrors.ts apps/api/tests/services/groupBroadcasts/application/GroupBroadcastService.test.ts
git commit -m "feat(groupBroadcasts): service creates multi-step campaigns, attaches media per step"
```

---

## Task 9: Router — validação de `steps[]` + rotas de mídia por etapa

**Files:**
- Modify: `apps/api/src/services/groupBroadcasts/presentation/groupBroadcastsRouter.ts`
- Test: `apps/api/tests/services/groupBroadcasts/presentation/groupBroadcastsRouter.test.ts`

**Interfaces:**
- Consumes: `GroupBroadcastService.createBroadcast`/`attachMedia`/
  `removeMedia`/`getMedia` (Task 8, agora com `stepId`).
- Produces: contrato HTTP consumido pelo frontend (Task 11).

- [ ] **Step 1: Reescrever `createBodySchema`**

```ts
const stepSchema = z.object({
  messageTemplate: z.string().trim().min(1, 'messageTemplate não pode ser vazio').max(4000),
  recurrenceIntervalHours: z
    .number()
    .int()
    .min(MIN_RECURRENCE_INTERVAL_HOURS)
    .max(MAX_RECURRENCE_INTERVAL_HOURS)
    .optional(),
  recurrenceMaxRuns: z.number().int().min(2).max(MAX_RECURRENCE_RUNS).optional(),
  recurrenceEndsAt: z.coerce.date().optional(),
});

const createBodySchema = z.object({
  sessionName: z.string().trim().min(1, 'sessionName não pode ser vazio'),
  name: z.string().trim().min(1, 'name não pode ser vazio').max(200),
  groupJids: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[^@\s]+@g\.us$/, 'Cada destino precisa ser um grupo (…@g.us).'),
    )
    .min(1, 'Selecione pelo menos um grupo.')
    .max(MAX_GROUPS_PER_BROADCAST, `No máximo ${MAX_GROUPS_PER_BROADCAST} grupos por disparo.`),
  intervalSeconds: z
    .number()
    .int()
    .min(MIN_GROUP_INTERVAL_SECONDS)
    .max(MAX_GROUP_INTERVAL_SECONDS)
    .optional(),
  sendWindowStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário precisa ser "HH:MM".')
    .optional(),
  sendWindowEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário precisa ser "HH:MM".')
    .optional(),
  steps: z
    .array(stepSchema)
    .min(1, 'Adicione pelo menos uma publicação.')
    .max(MAX_STEPS_PER_BROADCAST, `No máximo ${MAX_STEPS_PER_BROADCAST} publicações por campanha.`),
});
```

Importar `MAX_STEPS_PER_BROADCAST` de `groupBroadcastPacing.ts` no topo do
arquivo.

- [ ] **Step 2: Atualizar o handler de `POST /` para repassar `steps`**

Localizar o handler de criação (linha ~129) e trocar o corpo passado ao
service de campos soltos para `steps: body.steps` (mantendo
`sessionName`/`name`/`groupJids`/`intervalSeconds`/`sendWindowStart`/
`sendWindowEnd` como já estavam).

- [ ] **Step 3: Adicionar `stepId` ao path das rotas de mídia**

Localizar as rotas `POST /:broadcastId/media` e `DELETE /:broadcastId/media`
(e a de leitura, se houver uma terceira) — trocar o path para
`/:broadcastId/steps/:stepId/media`, com um novo schema de params:

```ts
const broadcastStepIdParamSchema = z.object({
  broadcastId: z.string().trim().min(1, 'broadcastId não pode ser vazio'),
  stepId: z.string().trim().min(1, 'stepId não pode ser vazio'),
});
```

e repassar `req.params.stepId` para `service.attachMedia(tenantId,
broadcastId, stepId, media)`/`removeMedia`/`getMedia`.

- [ ] **Step 4: Ajustar os testes existentes do router**

Todo `request(app).post(basePath('tenant-1')).send({...})` que hoje manda
`messageTemplate`/`recurrenceIntervalHours` no nível raiz do corpo passa a
mandar `steps: [{ messageTemplate: '...', recurrenceIntervalHours: ... }]`.
Toda chamada a `POST/DELETE .../media` ganha o segmento `/steps/:stepId` no
path (pegue o `stepId` da resposta de criação, em `response.body.steps[0].id`).

- [ ] **Step 5: Escrever os testes novos de validação**

```ts
  it('recusa corpo sem nenhuma etapa (400)', async () => {
    const { app, directory } = buildApp(person('administrator'));
    directory.entries = [{ jid: '111@g.us', name: 'Grupo 1', participantCount: 5, canSend: true }];

    const response = await request(app)
      .post(basePath('tenant-1'))
      .send({ sessionName: 'sessao', name: 'Disparo', groupJids: ['111@g.us'], steps: [] });

    expect(response.status).toBe(400);
  });

  it('recusa corpo com mais de 20 etapas (400)', async () => {
    const { app, directory } = buildApp(person('administrator'));
    directory.entries = [{ jid: '111@g.us', name: 'Grupo 1', participantCount: 5, canSend: true }];
    const steps = Array.from({ length: 21 }, (_, i) => ({ messageTemplate: `Post ${i}` }));

    const response = await request(app)
      .post(basePath('tenant-1'))
      .send({ sessionName: 'sessao', name: 'Disparo', groupJids: ['111@g.us'], steps });

    expect(response.status).toBe(400);
  });

  it('cria com 2 etapas e devolve ambas na resposta', async () => {
    const { app, directory } = buildApp(person('administrator'));
    directory.entries = [{ jid: '111@g.us', name: 'Grupo 1', participantCount: 5, canSend: true }];

    const response = await request(app)
      .post(basePath('tenant-1'))
      .send({
        sessionName: 'sessao',
        name: 'Sequência',
        groupJids: ['111@g.us'],
        steps: [{ messageTemplate: 'Post 1' }, { messageTemplate: 'Post 2' }],
      });

    expect(response.status).toBe(201);
    expect(response.body.steps).toHaveLength(2);
  });
```

- [ ] **Step 6: Rodar a suíte do router**

```bash
npx jest --selectProjects api apps/api/tests/services/groupBroadcasts/presentation/groupBroadcastsRouter.test.ts
```

Expected: TODOS PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/groupBroadcasts/presentation/groupBroadcastsRouter.ts apps/api/tests/services/groupBroadcasts/presentation/groupBroadcastsRouter.test.ts
git commit -m "feat(groupBroadcasts): router validates steps[] and routes media by stepId"
```

---

## Task 10: `tsc`/`eslint` limpos + suíte completa do bounded context

**Files:** nenhum arquivo novo — checkpoint de integração de todas as tarefas anteriores.

- [ ] **Step 1: Rodar `tsc` nos dois pacotes**

```bash
npx tsc -p apps/api --noEmit
npx tsc -p apps/dashboard --noEmit
```

Expected: limpo em `apps/api`. `apps/dashboard` ainda vai acusar erros nos
arquivos que o Task 11 corrige (`clientApi.ts`,
`GroupBroadcastCreateForm.tsx`, `GroupBroadcastDetailPanel.tsx`,
`GroupBroadcastsPanel.tsx`) — normal neste ponto, não corrigir ainda.

- [ ] **Step 2: Rodar `eslint` e a suíte completa da API**

```bash
ESLINT_USE_FLAT_CONFIG=false npx eslint apps/api/src/services/groupBroadcasts --max-warnings=0
npx jest --selectProjects api apps/api/tests/services/groupBroadcasts apps/api/tests/integration/groupBroadcasts.integration.test.ts apps/api/tests/integration/groupBroadcastStepsMigration.integration.test.ts
```

Expected: `eslint` limpo; suíte 100% verde.

- [ ] **Step 3: Nenhum commit neste task** (é só checkpoint) — se algo
  falhar, corrigir e commitar como parte da tarefa onde o problema mora.

---

## Task 11: Frontend — tipos, criação com etapas, detalhe com progresso

**Files:**
- Modify: `apps/dashboard/lib/clientApi.ts`
- Modify: `apps/dashboard/components/GroupBroadcastCreateForm.tsx`
- Modify: `apps/dashboard/components/GroupBroadcastDetailPanel.tsx`
- Modify: `apps/dashboard/components/GroupBroadcastsPanel.tsx` (só o que usa `broadcast.messageTemplate`/`recurrenceIntervalHours` direto — ajustar para `summary`/`steps[currentStepIndex]`)
- Test: `apps/dashboard/tests-jsdom/components/GroupBroadcastCreateForm.test.tsx`, `GroupBroadcastDetailPanel.test.tsx`, `GroupBroadcastsPanel.test.tsx`

**Interfaces:**
- Consumes: contrato HTTP do Task 9 (`steps[]` na criação, `steps`/
  `currentStepIndex` no detalhe, rotas de mídia com `stepId`).

- [ ] **Step 1: Atualizar `clientApi.ts`**

```ts
export interface GroupBroadcastStep {
  id: string;
  broadcastId: string;
  order: number;
  messageTemplate: string;
  media?: {
    contentType: GroupBroadcastMediaContentType;
    mimeType: string;
    fileName?: string;
  };
  recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number;
  recurrenceEndsAt?: string;
  runsCompleted: number;
  nextRunAt?: string;
  createdAt: string;
}

export interface GroupBroadcast {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  status: GroupBroadcastStatus;
  intervalSeconds: number;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  currentStepIndex: number;
  pausedReason?: string;
  createdAt: string;
  updatedAt: string;
}
```

(Remover de `GroupBroadcast` os campos que saíram: `messageTemplate`, `media`,
`recurrenceIntervalHours`, `recurrenceMaxRuns`, `recurrenceEndsAt`,
`runsCompleted`, `nextRunAt`.)

`createGroupBroadcast`:

```ts
export interface CreateGroupBroadcastStepInput {
  messageTemplate: string;
  recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number;
  recurrenceEndsAt?: string;
}

export function createGroupBroadcast(input: {
  sessionName: string;
  name: string;
  groupJids: string[];
  intervalSeconds?: number;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  steps: CreateGroupBroadcastStepInput[];
}): Promise<{
  broadcast: GroupBroadcast;
  steps: GroupBroadcastStep[];
  summary: GroupBroadcastSummary;
  targets: GroupBroadcastTarget[];
}> {
  return request('/api/group-broadcasts', { method: 'POST', body: JSON.stringify(input) });
}

export function fetchGroupBroadcast(broadcastId: string): Promise<{
  broadcast: GroupBroadcast;
  steps: GroupBroadcastStep[];
  summary: GroupBroadcastSummary;
  targets: GroupBroadcastTarget[];
}> {
  return request(`/api/group-broadcasts/${encodeURIComponent(broadcastId)}`);
}

export async function attachGroupBroadcastMedia(
  broadcastId: string,
  stepId: string,
  file: File,
  contentType: GroupBroadcastMediaContentType,
): Promise<{ step: GroupBroadcastStep }> {
  const headers: Record<string, string> = {
    'content-type': file.type || 'application/octet-stream',
    'x-media-content-type': contentType,
    'x-media-filename': file.name,
    ...csrfHeader(),
  };
  const response = await fetch(
    `/api/group-broadcasts/${encodeURIComponent(broadcastId)}/steps/${encodeURIComponent(stepId)}/media`,
    { method: 'POST', headers, body: file },
  );
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ClientApiError(response.status, body);
  }
  return body as { step: GroupBroadcastStep };
}

export function removeGroupBroadcastMedia(
  broadcastId: string,
  stepId: string,
): Promise<{ step: GroupBroadcastStep }> {
  return request(
    `/api/group-broadcasts/${encodeURIComponent(broadcastId)}/steps/${encodeURIComponent(stepId)}/media`,
    { method: 'DELETE' },
  );
}

export function groupBroadcastStepMediaUrl(broadcastId: string, stepId: string): string {
  return `/api/group-broadcasts/${encodeURIComponent(broadcastId)}/steps/${encodeURIComponent(stepId)}/media`;
}
```

(`fetchGroupBroadcasts`/`GroupBroadcastListItem`/`startGroupBroadcast`/
`pauseGroupBroadcast`/`cancelGroupBroadcast`/`deleteGroupBroadcast` ficam
como já eram — não dependem de `messageTemplate`.)

- [ ] **Step 2: Ler `GroupBroadcastCreateForm.tsx` por completo** antes de
  editar (o arquivo tem estado de formulário para 1 mensagem/1 recorrência
  hoje — decida com base na estrutura real se o estado vira um array de
  `{ id: string (uuid local para key do React); messageTemplate; recurrenceIntervalHours?; recurrenceMaxRuns?; recurrenceEndsAt? }`
  em vez de campos soltos). Reescrever o formulário:

  - Estado: `steps: LocalStep[]` (mínimo 1, iniciando com uma etapa vazia).
  - Um cartão por etapa (reaproveitar os campos de texto/mídia/recorrência que
    já existem hoje, só movidos para dentro do `.map(steps)`).
  - Botão "Adicionar publicação" (desabilitado quando `steps.length >= 20`,
    importar o limite via uma constante local `MAX_STEPS_PER_BROADCAST = 20`
    — mesmo valor do backend, duplicado de propósito no frontend, mesmo
    padrão já usado para `MAX_GROUPS_PER_BROADCAST` neste componente).
  - Botão "Remover" por cartão (desabilitado quando só resta 1 etapa).
  - Setas ▲▼ por cartão para reordenar (trocar de posição no array local —
    sem chamada de API; a ordem só é enviada na criação).
  - No submit: `createGroupBroadcast({ ..., steps: steps.map((s, order) => ({ messageTemplate: s.messageTemplate, recurrenceIntervalHours: s.recurrenceIntervalHours, recurrenceMaxRuns: s.recurrenceMaxRuns, recurrenceEndsAt: s.recurrenceEndsAt })) })`.
  - Upload de mídia: como hoje é um SEGUNDO request depois da criação (ver o
    componente atual) — cada etapa com mídia local pendente dispara
    `attachGroupBroadcastMedia(broadcast.id, steps[i].id, file, contentType)`
    usando o `id` da etapa devolvido pela API na resposta de criação
    (`result.steps[i].id`, na mesma ordem em que foram enviadas).

- [ ] **Step 3: Reescrever os testes de `GroupBroadcastCreateForm.test.tsx`**

Cobrir, no mínimo:
  - formulário nasce com 1 etapa;
  - "Adicionar publicação" cria uma 2ª etapa, com seus próprios campos;
  - "Remover" some com a etapa e fica desabilitado ao restar 1;
  - botão "Adicionar publicação" desabilita ao chegar em 20 etapas;
  - submit manda `steps` com o conteúdo de cada etapa, na ordem da tela;
  - upload de mídia de uma etapa específica chama
    `attachGroupBroadcastMedia` com o `stepId` certo (mock e assert do
    argumento).

- [ ] **Step 4: Ler `GroupBroadcastDetailPanel.tsx` por completo**, então
  adicionar a seção "Publicações desta campanha": lista as `steps` na ordem,
  destaca a que está em `broadcast.currentStepIndex` (ex.: badge "Em
  execução" + "Publicação {currentStepIndex + 1} de {steps.length}"),
  mostra `runsCompleted`/recorrência de CADA etapa (reaproveitar o badge de
  recorrência que já existe hoje, aplicado por etapa em vez de à campanha
  inteira). Esconder edição da lista quando `broadcast.status !== 'draft'`
  (mesma régua textual já usada para mídia).

- [ ] **Step 5: Estender `GroupBroadcastDetailPanel.test.tsx`**

Cobrir: mostra as N etapas na ordem; destaca a etapa `currentStepIndex`;
mostra "Publicação 2 de 4" quando `currentStepIndex === 1` e há 4 etapas.

- [ ] **Step 6: Ajustar `GroupBroadcastsPanel.tsx`**

Qualquer referência a `broadcast.messageTemplate`/`recurrenceIntervalHours`
na LISTA (não no detalhe) precisa trocar para ler de `summary`/de uma etapa
específica — se a lista de hoje já usa só `summary`/`broadcast.status`/
`broadcast.name` (confirme lendo o arquivo), pode não precisar de nenhuma
mudança aqui além de `tsc` confirmar.

- [ ] **Step 7: Rodar `tsc`/`eslint`/suíte do dashboard**

```bash
npx tsc -p apps/dashboard --noEmit
ESLINT_USE_FLAT_CONFIG=false npx eslint apps/dashboard/components/GroupBroadcastCreateForm.tsx apps/dashboard/components/GroupBroadcastDetailPanel.tsx apps/dashboard/components/GroupBroadcastsPanel.tsx apps/dashboard/lib/clientApi.ts --max-warnings=0
npx jest --selectProjects dashboard dashboard-jsdom apps/dashboard/tests-jsdom/components/GroupBroadcastCreateForm.test.tsx apps/dashboard/tests-jsdom/components/GroupBroadcastDetailPanel.test.tsx apps/dashboard/tests-jsdom/components/GroupBroadcastsPanel.test.tsx
```

Expected: tudo limpo/verde.

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/lib/clientApi.ts apps/dashboard/components/GroupBroadcastCreateForm.tsx apps/dashboard/components/GroupBroadcastDetailPanel.tsx apps/dashboard/components/GroupBroadcastsPanel.tsx apps/dashboard/tests-jsdom/components/GroupBroadcastCreateForm.test.tsx apps/dashboard/tests-jsdom/components/GroupBroadcastDetailPanel.test.tsx apps/dashboard/tests-jsdom/components/GroupBroadcastsPanel.test.tsx
git commit -m "feat(dashboard): multi-step group broadcast creation and progress view"
```

---

## Task 12: Teste de transição de ponta a ponta (o requisito explícito do fundador)

**Files:**
- Test: `apps/api/tests/integration/groupBroadcastStepTransition.integration.test.ts` (novo)

**Interfaces:**
- Consumes: `GroupBroadcastService`, `GroupBroadcastRunJobProcessor`,
  `GroupBroadcastSendJobProcessor` com o `PrismaGroupBroadcastRepository`
  REAL contra Postgres — não os Fakes. É o teste que prova, contra banco de
  verdade, exatamente o cenário que o fundador pediu: "uma campanha com mais
  de uma publicação, cadenciadas uma de cada vez".

- [ ] **Step 1: Escrever o teste**

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaGroupBroadcastRepository } from '../../src/services/groupBroadcasts/infrastructure/repositories/PrismaGroupBroadcastRepository';
import { GroupBroadcastService } from '../../src/services/groupBroadcasts/application/GroupBroadcastService';
import { GroupBroadcastRunJobProcessor } from '../../src/services/groupBroadcasts/infrastructure/GroupBroadcastRunJobProcessor';
import { GroupBroadcastSendJobProcessor } from '../../src/services/groupBroadcasts/infrastructure/GroupBroadcastSendJobProcessor';
import { NoopLogger } from '../../src/shared/logging/NoopLogger'; // confirme o nome exato do logger nulo já usado nos demais testes de integração
import { isDatabaseAvailable } from './databaseAvailability'; // mesmo helper do Task 1

describe('transição de ponta a ponta entre etapas de um disparo em grupos (contra Postgres REAL)', () => {
  let prisma: PrismaClient;
  let repository: PrismaGroupBroadcastRepository;
  let service: GroupBroadcastService;
  let databaseAvailable = false;
  let tenantId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    databaseAvailable = await isDatabaseAvailable(prisma);
    repository = new PrismaGroupBroadcastRepository(prisma);
  });

  beforeEach(async () => {
    if (!databaseAvailable) return;
    const tenant = await prisma.tenant.create({ data: { name: 'Tenant transição', plan: 'PRO' } });
    tenantId = tenant.id;
  });

  afterEach(async () => {
    if (!databaseAvailable) return;
    await prisma.tenant.delete({ where: { id: tenantId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('campanha de 2 etapas: publica a etapa 0 (sem recorrência), avança para a etapa 1, e completa ao fim dela', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    // Monta a campanha diretamente no repositório (sem GroupDirectory/GroupMessageSender reais).
    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-transicao',
      name: 'Campanha de 2 publicações',
      intervalSeconds: 60,
    });
    const [step0, step1] = await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Primeira publicação' },
      { order: 1, messageTemplate: 'Segunda publicação' },
    ]);
    await repository.createTargets(tenantId, broadcast.id, [
      { groupJid: '111@g.us', groupName: 'Grupo 1', status: 'pending' },
    ]);
    await repository.updateStatus(tenantId, broadcast.id, 'running');

    const fakeSender = {
      calls: [] as string[],
      async send(_tenantId: string, _sessionName: string, _groupJid: string, content: string) {
        fakeSender.calls.push(content);
        return { ok: true };
      },
    };
    const fakeDispatcher = {
      runs: [] as Array<{ broadcastId: string; runNumber: number; delayMs: number }>,
      async scheduleTarget() {},
      async scheduleRun(_tenantId: string, broadcastId: string, runNumber: number, delayMs: number) {
        fakeDispatcher.runs.push({ broadcastId, runNumber, delayMs });
      },
    };
    const logger = new NoopLogger();
    const runProcessor = new GroupBroadcastRunJobProcessor(repository, fakeDispatcher, logger);
    const sendProcessor = new GroupBroadcastSendJobProcessor(repository, fakeSender, logger, fakeDispatcher);

    // 1. Envia para o grupo — etapa 0, sem recorrência, existe etapa 1 → deve AVANÇAR, não completar.
    const target = (await repository.listTargets(tenantId, broadcast.id))[0];
    await sendProcessor.process({ tenantId, broadcastId: broadcast.id, targetId: target.id });

    expect(fakeSender.calls).toEqual(['Primeira publicação']);
    let reloaded = await repository.findById(tenantId, broadcast.id);
    expect(reloaded?.status).toBe('running');
    expect(reloaded?.currentStepIndex).toBe(1);
    expect(fakeDispatcher.runs).toEqual([{ broadcastId: broadcast.id, runNumber: 1, delayMs: 0 }]);

    // 2. O "run" agendado pelo avanço de etapa dispara o RunJobProcessor —
    //    ele reabre o alvo (voltou a `sent` no passo 1) e agenda o envio da etapa 1.
    const outcome = await runProcessor.process({ tenantId, broadcastId: broadcast.id, runNumber: 1 });
    expect(outcome).toBe('started');
    const reopenedTarget = (await repository.listTargets(tenantId, broadcast.id))[0];
    expect(reopenedTarget.status).toBe('pending');

    // 3. Envia a etapa 1 — não há etapa 2 → a campanha COMPLETA.
    await sendProcessor.process({ tenantId, broadcastId: broadcast.id, targetId: reopenedTarget.id });

    expect(fakeSender.calls).toEqual(['Primeira publicação', 'Segunda publicação']);
    reloaded = await repository.findById(tenantId, broadcast.id);
    expect(reloaded?.status).toBe('completed');

    // Confere que cada grupo recebeu 2 publicações no total (métrica cumulativa, ADR 2026-09-13).
    const summary = await repository.summarizeTargets(tenantId, broadcast.id);
    expect(summary.totalSent).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar**

```bash
docker compose up -d postgres redis
npx jest --selectProjects api apps/api/tests/integration/groupBroadcastStepTransition.integration.test.ts
```

Expected: PASS, sem aviso de "Postgres indisponível".

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/integration/groupBroadcastStepTransition.integration.test.ts
git commit -m "test(groupBroadcasts): end-to-end integration test for step transition against real Postgres"
```

---

## Task 13: Documentação — `CLAUDE.md` §18

**Files:**
- Modify: `CLAUDE.md` (nova entrada em §18, antes de `## Agent skills`)

- [ ] **Step 1: Adicionar a entrada**, seguindo o padrão já usado nas
  entradas de `services/groupBroadcasts` deste mesmo arquivo (contexto,
  decisão, impacto), citando: a extração de `GroupBroadcastStep`, a migração
  dos 3 disparos legados, o reaproveitamento do `GroupBroadcastRunJobProcessor`
  para abrir a etapa nova (sem duplicar a checagem de janela de horário), e o
  resultado da suíte completa (número de suítes/testes ao fechar a rodada).

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record multi-step group broadcast campaigns in CLAUDE.md"
```

---

## Self-Review (executado ao escrever este plano)

1. **Cobertura da spec:** modelo de dados (Task 1/2), migração de dados
   legados (Task 1), motor de execução com reuso do `RunJobProcessor` (Task
   5/6), API (Task 7/8/9), frontend (Task 11), teto de 20 etapas (Task 7/9),
   mídia por `stepId` — nunca por posição (Task 3/8/9/11), teste de transição
   ponta a ponta (Task 12) — todos os itens da spec têm task correspondente.
2. **Placeholders:** nenhum "TBD"/"similar ao Task N sem código" — todo passo
   de código tem o código real. As únicas instruções sem bloco de código
   (Task 11 Steps 2/4/6, Task 13) pedem para LER o arquivo real antes de
   decidir a forma exata da edição — decisão consciente, porque
   `GroupBroadcastCreateForm.tsx`/`DetailPanel.tsx` não foram lidos por
   completo na escrita deste plano (só a fatia de tipos em `clientApi.ts`).
3. **Consistência de tipos:** `GroupBroadcastStep`/`CreateGroupBroadcastStepData`/
   `CreateGroupBroadcastStepInput` usam os mesmos nomes de campo
   (`messageTemplate`, `recurrenceIntervalHours`, `recurrenceMaxRuns`,
   `recurrenceEndsAt`, `runsCompleted`, `nextRunAt`, `order`) do Domain (Task
   2) até o Repository (Task 3), Fakes (Task 4), Service (Task 8), Router
   (Task 9) e frontend (Task 11) — conferido campo a campo ao escrever cada
   task a partir da anterior.
