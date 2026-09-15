# Editar campanhas depois de criadas — Plano de Implementação

> **Para executores:** SUB-SKILL OBRIGATÓRIA: usar
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam
> checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** permitir editar uma campanha já criada — disparos para grupos e
para contatos — pausando, ajustando e retomando, sem perder o histórico do que
já foi publicado.

**Arquitetura:** o cliente envia o estado final desejado; o servidor calcula a
diferença por funções puras de Domain e aplica. Salvar nunca agenda nada — quem
agenda continua sendo o start/retomar, que já reagenda tudo do zero. Remoção de
item com histórico usa o mecanismo de supressão que já existe (`skipped`), nunca
`DELETE`.

**Stack:** TypeScript, Express, Prisma/PostgreSQL, BullMQ, Next.js (Pages
Router), Jest.

**Spec:** `docs/superpowers/specs/2026-09-15-editar-campanhas-design.md`

## Restrições globais

- Idioma: código e identificadores em inglês; comentários, mensagens de erro e
  textos de UI em português (CLAUDE.md §"Idioma Oficial").
- **Salvar uma edição NUNCA chama o dispatcher.** Invariante com teste dedicado.
- Remoção de item **com histórico** (`sentCount > 0` / status `SENT`, `FAILED`
  ou `REPLIED`) nunca usa `DELETE`: marca `skipped` com
  `skipReason = 'removed_by_operator'`.
- Estados que aceitam edição: `draft` e `paused`. Qualquer outro → 409.
- Permissão das rotas novas: `campaign:manage` (a mesma da criação).
- Tetos preservados: 30 grupos (`MAX_GROUPS_PER_BROADCAST`), 20 publicações
  (`MAX_STEPS_PER_BROADCAST`), 5.000 destinatários, 20.000 caracteres de perfil.
- `order` de etapa nunca é reatribuída.
- Nenhuma migration. Esta entrega não altera o schema.
- Ao fim de cada tarefa: `npx tsc -p apps/api --noEmit` e
  `ESLINT_USE_FLAT_CONFIG=false npx eslint <arquivos tocados>` limpos.

---

## Estrutura de arquivos

**Criar:**
- `apps/api/src/services/groupBroadcasts/domain/policies/reconcileBroadcastEdit.ts` — funções puras de diff (etapas e grupos)
- `apps/api/tests/services/groupBroadcasts/domain/reconcileBroadcastEdit.test.ts`
- `apps/api/src/services/campaigns/domain/policies/reconcileCampaignRecipients.ts` — função pura de diff (destinatários)
- `apps/api/tests/services/campaigns/domain/reconcileCampaignRecipients.test.ts`
- `apps/dashboard/pages/api/group-broadcasts/[broadcastId]/index.ts` — proxy BFF do PUT (se ainda não existir rota de detalhe)
- `apps/dashboard/pages/api/campaigns/[campaignId]/index.ts` — idem

**Modificar:**
- `apps/api/src/services/groupBroadcasts/domain/repositories/GroupBroadcastRepository.ts` — port: métodos de edição
- `apps/api/src/services/groupBroadcasts/infrastructure/repositories/PrismaGroupBroadcastRepository.ts`
- `apps/api/src/services/groupBroadcasts/application/GroupBroadcastService.ts` — `updateBroadcast`, `resumeMode`
- `apps/api/src/services/groupBroadcasts/presentation/groupBroadcastsRouter.ts` — rota PUT, mídia em `paused`
- `apps/api/src/services/groupBroadcasts/domain/errors/groupBroadcastErrors.ts` — ação `'edit'`
- `apps/api/src/services/campaigns/domain/repositories/CampaignRepository.ts`
- `apps/api/src/services/campaigns/infrastructure/repositories/PrismaCampaignRepository.ts`
- `apps/api/src/services/campaigns/application/CampaignService.ts` — `updateCampaign`, `resumeMode`
- `apps/api/src/services/campaigns/presentation/campaignsRouter.ts`
- `apps/api/tests/services/groupBroadcasts/fakes.ts` e `apps/api/tests/services/campaigns/fakes.ts`
- `apps/dashboard/lib/clientApi.ts` — funções de update
- `apps/dashboard/components/GroupBroadcastCreateForm.tsx` — modo edição
- `apps/dashboard/components/CampaignCreateForm.tsx` — modo edição
- `apps/dashboard/components/GroupBroadcastDetailPanel.tsx` / `CampaignDetailPanel.tsx` — botão Editar + diálogo de retomada
- `apps/dashboard/components/GroupBroadcastsPanel.tsx` / `CampaignsPanel.tsx` — item "Editar" no menu

---

## Task 1: Funções puras de reconciliação (grupos)

**Arquivos:**
- Criar: `apps/api/src/services/groupBroadcasts/domain/policies/reconcileBroadcastEdit.ts`
- Teste: `apps/api/tests/services/groupBroadcasts/domain/reconcileBroadcastEdit.test.ts`

**Interfaces produzidas:**

```ts
export interface ExistingStep { id: string; order: number; runsCompleted: number; hasHistory: boolean; }
export interface DesiredStep { id?: string; messageTemplate: string; recurrenceIntervalHours?: number; recurrenceMaxRuns?: number; recurrenceEndsAt?: Date; }
export interface StepReconciliation {
  toUpdate: Array<{ id: string; desired: DesiredStep }>;
  toCreate: Array<{ order: number; desired: DesiredStep }>;
  toDelete: string[];
  toFinish: string[];
}
export function reconcileSteps(existing: ExistingStep[], desired: DesiredStep[]): StepReconciliation;

export interface ExistingTarget { id: string; groupJid: string; hasHistory: boolean; }
export interface TargetReconciliation {
  toCreate: string[];      // groupJids novos
  toDelete: string[];      // ids sem histórico
  toSuppress: string[];    // ids com histórico
}
export function reconcileTargets(existing: ExistingTarget[], desiredJids: string[]): TargetReconciliation;
```

- [ ] **Passo 1: escrever os testes que falham**

```ts
import { reconcileSteps, reconcileTargets } from '../../../../src/services/groupBroadcasts/domain/policies/reconcileBroadcastEdit';

describe('reconcileSteps', () => {
  it('etapa existente com id continua: entra em toUpdate, nunca em toDelete', () => {
    const r = reconcileSteps(
      [{ id: 's1', order: 0, runsCompleted: 2, hasHistory: true }],
      [{ id: 's1', messageTemplate: 'texto novo' }],
    );
    expect(r.toUpdate).toEqual([{ id: 's1', desired: { id: 's1', messageTemplate: 'texto novo' } }]);
    expect(r.toDelete).toEqual([]);
    expect(r.toFinish).toEqual([]);
  });

  it('etapa nova (sem id) recebe a próxima order livre', () => {
    const r = reconcileSteps(
      [{ id: 's1', order: 0, runsCompleted: 0, hasHistory: false }],
      [{ id: 's1', messageTemplate: 'a' }, { messageTemplate: 'nova' }],
    );
    expect(r.toCreate).toEqual([{ order: 1, desired: { messageTemplate: 'nova' } }]);
  });

  it('etapa removida SEM histórico é apagada', () => {
    const r = reconcileSteps(
      [{ id: 's1', order: 0, runsCompleted: 0, hasHistory: false }, { id: 's2', order: 1, runsCompleted: 0, hasHistory: false }],
      [{ id: 's1', messageTemplate: 'a' }],
    );
    expect(r.toDelete).toEqual(['s2']);
    expect(r.toFinish).toEqual([]);
  });

  it('etapa removida COM histórico é encerrada, nunca apagada', () => {
    const r = reconcileSteps(
      [{ id: 's1', order: 0, runsCompleted: 0, hasHistory: false }, { id: 's2', order: 1, runsCompleted: 3, hasHistory: true }],
      [{ id: 's1', messageTemplate: 'a' }],
    );
    expect(r.toFinish).toEqual(['s2']);
    expect(r.toDelete).toEqual([]);
  });

  it('order nova nunca colide com order já usada, mesmo depois de remoções', () => {
    const r = reconcileSteps(
      [{ id: 's1', order: 0, runsCompleted: 0, hasHistory: false }, { id: 's2', order: 5, runsCompleted: 1, hasHistory: true }],
      [{ id: 's1', messageTemplate: 'a' }, { id: 's2', messageTemplate: 'b' }, { messageTemplate: 'nova' }],
    );
    expect(r.toCreate[0].order).toBe(6);
  });
});

describe('reconcileTargets', () => {
  it('jid novo entra em toCreate', () => {
    const r = reconcileTargets([{ id: 't1', groupJid: '1@g.us', hasHistory: false }], ['1@g.us', '2@g.us']);
    expect(r.toCreate).toEqual(['2@g.us']);
  });

  it('removido SEM histórico é apagado; COM histórico é suprimido', () => {
    const r = reconcileTargets(
      [
        { id: 't1', groupJid: '1@g.us', hasHistory: false },
        { id: 't2', groupJid: '2@g.us', hasHistory: true },
      ],
      [],
    );
    expect(r.toDelete).toEqual(['t1']);
    expect(r.toSuppress).toEqual(['t2']);
  });

  it('jid repetido na lista desejada não duplica', () => {
    const r = reconcileTargets([], ['1@g.us', '1@g.us']);
    expect(r.toCreate).toEqual(['1@g.us']);
  });
});
```

- [ ] **Passo 2: rodar e confirmar que falha**

`npx jest --selectProjects api reconcileBroadcastEdit` → FAIL (módulo não existe).

- [ ] **Passo 3: implementar**

Implementar `reconcileSteps` e `reconcileTargets` conforme as interfaces acima.
`reconcileSteps`: indexa `existing` por `id`; `desired` com `id` conhecido →
`toUpdate`; `desired` sem `id` → `toCreate` com `order` começando em
`max(order existente) + 1` e incrementando; `existing` ausente do desejado →
`toFinish` se `hasHistory`, senão `toDelete`.
`reconcileTargets`: deduplica `desiredJids` preservando a ordem; jid não
existente → `toCreate`; existente ausente do desejado → `toSuppress` se
`hasHistory`, senão `toDelete`.

- [ ] **Passo 4: rodar e confirmar que passa**

- [ ] **Passo 5: commit**

```bash
git add apps/api/src/services/groupBroadcasts/domain/policies/reconcileBroadcastEdit.ts apps/api/tests/services/groupBroadcasts/domain/reconcileBroadcastEdit.test.ts
git commit -m "feat(groupBroadcasts): pure reconciliation policy for campaign edits"
```

---

## Task 2: Métodos de edição no repositório de grupos

**Arquivos:**
- Modificar: `.../domain/repositories/GroupBroadcastRepository.ts`,
  `.../infrastructure/repositories/PrismaGroupBroadcastRepository.ts`,
  `apps/api/tests/services/groupBroadcasts/fakes.ts`
- Teste: `apps/api/tests/integration/groupBroadcasts.integration.test.ts`

**Interfaces produzidas (port):**

```ts
updateBroadcastSettings(tenantId: string, broadcastId: string, data: {
  name: string; intervalSeconds: number;
  sendWindowStart?: string; sendWindowEnd?: string;
  stepLaunchOffsetMinutes?: number;
}): Promise<GroupBroadcast | undefined>;

updateStep(tenantId: string, stepId: string, data: {
  messageTemplate: string; recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number; recurrenceEndsAt?: Date;
}): Promise<GroupBroadcastStep | undefined>;

deleteSteps(tenantId: string, stepIds: string[]): Promise<number>;
deleteTargets(tenantId: string, targetIds: string[]): Promise<number>;
suppressTargets(tenantId: string, targetIds: string[], skipReason: string): Promise<number>;
countStepTargetsWithHistory(tenantId: string, broadcastId: string): Promise<Map<string, number>>;
```

`suppressTargets` marca o `GroupBroadcastTarget` **e** todos os
`GroupBroadcastStepTarget` daqueles alvos como `SKIPPED` numa transação —
é isso que os mantém fora de `resetStepTargetsForNextRun`, que nunca reabre
`skipped`. `sentCount` é preservado.

`countStepTargetsWithHistory` devolve, por `targetId`, a soma de `sentCount`
entre todas as etapas — é o `hasHistory` que a Task 1 consome.

- [ ] **Passo 1: teste de integração contra Postgres real**

Em `groupBroadcasts.integration.test.ts`, adicionar: criar disparo com 2 grupos,
marcar um como enviado (`sentCount = 1`), chamar `suppressTargets` nele,
e afirmar que (a) o alvo e seus stepTargets ficaram `SKIPPED`, (b) `sentCount`
continua 1, (c) `resetStepTargetsForNextRun` não o reabre.

- [ ] **Passo 2: rodar e confirmar que falha** (método não existe)

- [ ] **Passo 3: implementar port + Prisma + Fake**

- [ ] **Passo 4: rodar a suíte de groupBroadcasts inteira**

`npx jest --selectProjects api apps/api/tests/services/groupBroadcasts apps/api/tests/integration/groupBroadcasts.integration.test.ts`
— exigir ausência do aviso "Postgres indisponível — pulando".

- [ ] **Passo 5: commit**

```bash
git commit -am "feat(groupBroadcasts): repository methods for editing an existing broadcast"
```

---

## Task 3: `GroupBroadcastService.updateBroadcast`

**Arquivos:**
- Modificar: `.../application/GroupBroadcastService.ts`,
  `.../domain/errors/groupBroadcastErrors.ts`
- Teste: `apps/api/tests/services/groupBroadcasts/application/GroupBroadcastService.test.ts`

**Interfaces produzidas:**

```ts
export interface UpdateGroupBroadcastInput {
  tenantId: string; broadcastId: string; name: string; groupJids: string[];
  intervalSeconds?: number; sendWindowStart?: string; sendWindowEnd?: string;
  stepLaunchOffsetMinutes?: number; steps: UpdateGroupBroadcastStepInput[];
}
export interface UpdateGroupBroadcastStepInput {
  id?: string; messageTemplate: string; recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number; recurrenceEndsAt?: Date;
}
async updateBroadcast(input: UpdateGroupBroadcastInput, actor?: GroupBroadcastActor): Promise<GroupBroadcastDetail>;
```

`InvalidGroupBroadcastTransitionError` ganha `'edit'` na união de ações.

Ordem de execução dentro do método:
1. `assertTenantExists`; carregar disparo (404 se não existe).
2. Estado ≠ `draft`/`paused` → `InvalidGroupBroadcastTransitionError(status, 'edit')`.
3. Validar payload com as mesmas regras de `createBroadcast` (recorrência,
   janela, tetos, ao menos 1 etapa, ao menos 1 grupo).
4. `GroupDirectory.listGroups` — conferência ao vivo dos grupos desejados.
5. `countStepTargetsWithHistory` → montar `ExistingTarget[]` e `ExistingStep[]`.
6. `reconcileTargets` / `reconcileSteps`.
7. Aplicar: `updateBroadcastSettings`, `updateStep`(N), `createSteps`(novas),
   `createTargets`(novos), `deleteSteps`, `deleteTargets`, `suppressTargets`,
   e por fim `initializeStepTargets` (idempotente, materializa só o que falta).
8. Auditar `group_broadcast.edited` com o resumo numérico.
9. Devolver `GroupBroadcastDetail` recarregado.

- [ ] **Passo 1: testes**

Casos obrigatórios: (a) editar texto de etapa que já publicou preserva
`runsCompleted`; (b) remover etapa com histórico chama `markStepFinished`, não
`deleteSteps`; (c) remover grupo com histórico chama `suppressTargets`;
(d) grupo novo só-admin entra como `skipped`; (e) campanha `running` → 409;
(f) payload sem etapa ativa → 400; (g) **o dispatcher nunca é chamado**
(`expect(dispatcher.runs).toHaveLength(0); expect(dispatcher.scheduled).toHaveLength(0); expect(dispatcher.postponedRuns).toHaveLength(0)`).

- [ ] **Passo 2: rodar e confirmar que falha**
- [ ] **Passo 3: implementar**
- [ ] **Passo 4: rodar a suíte de groupBroadcasts**
- [ ] **Passo 5: commit**

```bash
git commit -am "feat(groupBroadcasts): updateBroadcast reconciles steps and targets without touching the queue"
```

---

## Task 4: Rota `PUT` de grupos + mídia em campanha pausada

**Arquivos:**
- Modificar: `.../presentation/groupBroadcastsRouter.ts`,
  `.../application/GroupBroadcastService.ts` (`attachMedia`/`removeMedia`)
- Teste: `apps/api/tests/services/groupBroadcasts/presentation/groupBroadcastsRouter.test.ts`

Rota `PUT /:broadcastId` com `requirePermission('campaign:manage')`, corpo
validado por zod espelhando `createBodySchema` mais `steps[].id` opcional.
`attachMedia`/`removeMedia` passam a aceitar `draft` **e** `paused`.

- [ ] **Passo 1: testes** — 200 no caminho feliz; 403 sem permissão; 404 de
  outro tenant (IDOR); 409 com `running`; 400 com corpo inválido; anexar mídia
  em `paused` retorna 200 e em `running` retorna 409.
- [ ] **Passo 2: rodar e confirmar que falha**
- [ ] **Passo 3: implementar**
- [ ] **Passo 4: rodar a suíte**
- [ ] **Passo 5: commit**

```bash
git commit -am "feat(groupBroadcasts): PUT route for editing, media allowed while paused"
```

---

## Task 5: Reconciliação e edição de campanhas para contatos

**Arquivos:**
- Criar: `apps/api/src/services/campaigns/domain/policies/reconcileCampaignRecipients.ts` + teste
- Modificar: `CampaignRepository.ts`, `PrismaCampaignRepository.ts`,
  `CampaignService.ts`, `campaignsRouter.ts`, `apps/api/tests/services/campaigns/fakes.ts`

**Interfaces produzidas:**

```ts
export interface ExistingRecipient { id: string; contactId?: string; phoneE164?: string; hasHistory: boolean; }
export interface RecipientReconciliation { toCreateContactIds: string[]; toCreatePhones: string[]; toDelete: string[]; toSuppress: string[]; }
export function reconcileRecipients(existing: ExistingRecipient[], desiredContactIds: string[], desiredPhones: string[]): RecipientReconciliation;

// CampaignRepository
suppressRecipients(tenantId: string, recipientIds: string[], skipReason: string): Promise<number>;
deleteRecipients(tenantId: string, recipientIds: string[]): Promise<number>;
updateCampaignContent(tenantId: string, campaignId: string, data: { name: string; description?: string; messageTemplate: string }): Promise<Campaign | undefined>;

// CampaignService
async updateCampaign(input: UpdateCampaignInput): Promise<CreateCampaignResult>;
```

`hasHistory` = status `SENT`, `FAILED` ou `REPLIED`. Destinatário novo passa por
`fetchEligibility` + `determineSkipReason` (opt-out, conversa ativa com humano,
contatado nos últimos 7 dias), exatamente como em `createCampaign`.

- [ ] **Passo 1: testes** — a função pura (3 casos: novo, removido sem
  histórico, removido com histórico); o serviço (preserva `sentAt`/`repliedAt`
  ao suprimir; 409 em `running`; dispatcher nunca chamado).
- [ ] **Passo 2: rodar e confirmar que falha**
- [ ] **Passo 3: implementar**
- [ ] **Passo 4: rodar a suíte de campaigns + integração**
- [ ] **Passo 5: commit**

```bash
git commit -am "feat(campaigns): edit an existing campaign preserving recipient history"
```

---

## Task 6: Retomar com escolha (`resumeMode`)

**Arquivos:**
- Modificar: `GroupBroadcastService.ts` (`startBroadcast`),
  `CampaignService.ts` (`startCampaign`), os dois routers
- Teste: suítes de serviço dos dois contextos

**Interface produzida:**

```ts
export type ResumeMode = 'now' | 'scheduled';
async startBroadcast(tenantId: string, broadcastId: string, actor?: GroupBroadcastActor, resumeMode?: ResumeMode): Promise<GroupBroadcast>;
```

Padrão `'now'` — preserva todos os chamadores atuais. Em `'scheduled'`, uma
etapa cujo `nextRunAt` esteja no futuro é agendada para aquele instante
(`delayMs = nextRunAt - agora`) em vez de `initialLaunchOffsetMs`; etapa sem
`nextRunAt` segue a regra atual. Nas rotas, `resumeMode` entra como campo
opcional do corpo do POST de start.

- [ ] **Passo 1: testes** — `'scheduled'` com `nextRunAt` futuro agenda para
  ele; `'scheduled'` sem `nextRunAt` se comporta como `'now'`; `'now'` mantém
  o comportamento atual (não-regressão); omitir o parâmetro equivale a `'now'`.
- [ ] **Passo 2: rodar e confirmar que falha**
- [ ] **Passo 3: implementar**
- [ ] **Passo 4: rodar as duas suítes**
- [ ] **Passo 5: commit**

```bash
git commit -am "feat(campaigns): resume can honour the already-scheduled run instead of publishing now"
```

---

## Task 7: BFF e cliente HTTP do dashboard

**Arquivos:**
- Criar/modificar: `apps/dashboard/pages/api/group-broadcasts/[broadcastId]/index.ts`,
  `apps/dashboard/pages/api/campaigns/[campaignId]/index.ts`
- Modificar: `apps/dashboard/lib/clientApi.ts`
- Teste: `apps/dashboard/tests/pages/api/...`

Proxies finos seguindo o padrão das rotas existentes (`requireSession`, CSRF,
repasse de 400/403/404/409). `clientApi` ganha `updateGroupBroadcast` e
`updateCampaign`, e `startGroupBroadcast`/`startCampaign` passam a aceitar
`resumeMode`.

- [ ] **Passo 1: testes de proxy** (200, 401 sem sessão, repasse de 409)
- [ ] **Passo 2: rodar e confirmar que falha**
- [ ] **Passo 3: implementar**
- [ ] **Passo 4: rodar `npx jest --selectProjects dashboard`**
- [ ] **Passo 5: commit**

```bash
git commit -am "feat(dashboard): BFF routes and client functions for editing campaigns"
```

---

## Task 8: Formulários em modo edição

**Arquivos:**
- Modificar: `apps/dashboard/components/GroupBroadcastCreateForm.tsx`,
  `apps/dashboard/components/CampaignCreateForm.tsx`
- Teste: os `.test.tsx` correspondentes (jsdom)

Cada formulário ganha prop opcional `editing?: { broadcast/campaign, steps, targets }`.
Quando presente: nasce preenchido, o título e o botão mudam para "Salvar
alterações", e o submit chama `update*` em vez de `create*`. Em grupos, um
grupo selecionado que não aparece na listagem ao vivo é exibido marcado como
**indisponível** (não some), e cada publicação mostra "publicou N vezes".

- [ ] **Passo 1: testes jsdom** — nasce preenchido; grupo indisponível aparece
  marcado; submit chama a função de update com o payload esperado; contador de
  publicações visível.
- [ ] **Passo 2: rodar e confirmar que falha**
- [ ] **Passo 3: implementar**
- [ ] **Passo 4: rodar `dashboard-jsdom`**
- [ ] **Passo 5: commit**

```bash
git commit -am "feat(dashboard): reuse creation forms in edit mode"
```

---

## Task 9: Botões e diálogo de retomada

**Arquivos:**
- Modificar: `GroupBroadcastDetailPanel.tsx`, `CampaignDetailPanel.tsx`,
  `GroupBroadcastsPanel.tsx`, `CampaignsPanel.tsx`
- Teste: os `.test.tsx` correspondentes

Item **Editar** no menu "⋮" da tabela e botão **Editar** no topo do detalhe.
Campanha rodando → rótulo **Pausar e editar** com `ConfirmDialog` avisando que
a campanha vai parar; ao confirmar, pausa e abre o formulário. Estados
terminais → botão desabilitado com o motivo. **Retomar** abre diálogo com
"Publicar agora" / "Esperar o horário marcado" (padrão) **somente** quando
alguma etapa ativa tem `nextRunAt` futuro.

Seguir `.claude/rules/ui-telas-de-listagem.md`: acessibilidade dos menus
(`aria-haspopup`, `aria-expanded`, Escape fecha), vocabulário "disparo".

- [ ] **Passo 1: testes jsdom** — botão presente nos 4 lugares; desabilitado em
  estado terminal; "Pausar e editar" quando rodando; diálogo de retomada só com
  `nextRunAt`; escolher "agora" chama start com `resumeMode: 'now'`.
- [ ] **Passo 2: rodar e confirmar que falha**
- [ ] **Passo 3: implementar**
- [ ] **Passo 4: rodar `dashboard-jsdom`**
- [ ] **Passo 5: commit**

```bash
git commit -am "feat(dashboard): edit buttons and resume-with-choice dialog"
```

---

## Task 10: Fechamento — suíte completa e documentação

- [ ] **Passo 1:** `npx jest --selectProjects api` e
  `npx jest --selectProjects dashboard dashboard-jsdom` — tudo verde, com
  Postgres e Redis de pé (conferir ausência do aviso de "pulando").
- [ ] **Passo 2:** `npx tsc -p apps/api --noEmit`,
  `npx tsc -p apps/dashboard --noEmit`,
  `npm run build -w apps/dashboard`, lint dos dois pacotes.
- [ ] **Passo 3:** entrada em `CLAUDE.md` §18 (contexto, as 3 decisões do
  fundador, a invariante de "salvar não agenda", os limites conhecidos da §11
  da spec).
- [ ] **Passo 4: commit**

```bash
git commit -am "docs: record the campaign editing feature in CLAUDE.md"
```

---

## Auto-revisão do plano

**Cobertura da spec:** §5 (estados) → Tasks 3, 4, 5; §6.1/6.2 (reconciliação de
grupos) → Tasks 1, 2, 3; §6.3 (destinatários) → Task 5; §7 (API) → Tasks 4, 5;
§8 (UI) → Tasks 8, 9; §9 (retomar) → Tasks 6, 9; §10 (testes) → distribuídos,
com a trava de "não agenda" nas Tasks 3 e 5 e o teste contra Postgres real na
Task 2. Auditoria (§7) → Task 3 e Task 5. Sem lacuna.

**Consistência de tipos:** `hasHistory` tem o mesmo significado nas Tasks 1, 2,
3 e 5 (`sentCount > 0` em grupos; status terminal em contatos).
`ResumeMode` é definido na Task 6 e consumido nas Tasks 7 e 9.
`skipReason = 'removed_by_operator'` é o mesmo literal nas Tasks 2, 3 e 5.
