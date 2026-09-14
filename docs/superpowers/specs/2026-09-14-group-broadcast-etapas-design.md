# Disparo em grupos com múltiplas etapas (publicações em sequência)

**Data:** 2026-09-14
**Status:** aprovado pelo fundador, pronto para plano de implementação

## Contexto

O bounded context `services/groupBroadcasts` (2026-09-11, com recorrência
adicionada em 2026-09-12) hoje suporta um disparo em grupos que publica **uma
única mensagem**, opcionalmente repetida de X em X horas, dentro de uma janela
de horário, até um dos três critérios de término (número de repetições, data
limite, ou "até cancelar").

O fundador quer ir além: uma campanha de disparo em grupos com **várias
publicações DIFERENTES**, cadenciadas uma após a outra — por exemplo,
publicação 1 hoje, publicação 2 amanhã, publicação 3 depois — para os mesmos
grupos, em vez de repetir sempre o mesmo texto.

Esta spec substitui o modelo atual de "uma mensagem, repetida N vezes" por "uma
sequência de publicações (etapas), cada uma com seu próprio texto/mídia e sua
própria configuração de repetição" — decisão do fundador confirmada
explicitamente (ver seção "Decisões confirmadas").

## Decisões confirmadas (brainstorming, 2026-09-14)

1. **Cadência:** intervalo fixo por publicação (ex.: "a cada 24h"), não
   horário exato por publicação. Mesmo padrão de configuração que a
   recorrência já usa hoje (`recurrenceIntervalHours`), só que por etapa.
2. **Relação com o disparo simples de hoje:** a campanha de várias etapas
   **substitui** o modelo atual — o disparo de mensagem única/recorrente vira
   apenas um caso particular de campanha com **uma etapa só**. Não haverá duas
   telas/dois conceitos concorrentes.
3. **Repetição por etapa:** cada etapa pode ter sua própria contagem/critério
   de repetição (as mesmas três formas de término de hoje: número de
   repetições, data limite, "até cancelar"). Isso preserva 100% do
   comportamento das campanhas já em produção (E-Sim, Conta Uber, Carro
   Atrasado): cada uma migra para uma campanha de 1 etapa, sem nenhuma mudança
   de comportamento observável.
4. **Grupos-alvo:** uma lista só, para a campanha inteira — todas as etapas
   publicam para os mesmos grupos. Não há lista de grupos por etapa.
5. **Nomenclatura:** continua se chamando **"Disparo em grupos"** (não
   "campanha", para não colidir com o bounded context `services/campaigns`,
   que já usa esse nome para disparos 1:1 a contatos). A tela ganha uma seção
   **"Publicações"**.
6. **Pausar/cancelar/disjuntor:** agem sobre a campanha inteira, nunca sobre
   uma etapa isolada. Pausar interrompe onde estiver (etapa atual, contagem de
   repetições atual); retomar continua do mesmo ponto. O disjuntor de
   segurança (falhas de envio recentes) olha o histórico da campanha inteira,
   atravessando etapas — uma transição de etapa não "reseta" a suspeita de
   banimento.

## Modelo de dados

### Schema atual (para referência)

`GroupBroadcast` (model Prisma, `prisma/schema.prisma:535`) guarda hoje, direto
na campanha: `messageTemplate`, `mediaContent`/`mediaMimeType`/`mediaFileName`/
`mediaContentType`, `recurrenceIntervalHours`/`recurrenceMaxRuns`/
`recurrenceEndsAt`, `runsCompleted`, `nextRunAt`. `sendWindowStart`/
`sendWindowEnd` e `intervalSeconds` (ritmo entre grupos) são da campanha.
`GroupBroadcastTarget` (`prisma/schema.prisma:598`) é a lista de grupos, com
`sentCount` cumulativo (correção de 2026-09-13) e `status` do ciclo atual.

### Schema novo

Extrai o conteúdo/recorrência de `GroupBroadcast` para uma tabela filha nova,
`GroupBroadcastStep`:

```prisma
model GroupBroadcast {
  id               String                      @id @default(uuid())
  tenantId         String                      @map("tenant_id")
  sessionName      String                      @map("session_name")
  name             String
  status           CampaignStatus              @default(DRAFT)
  intervalSeconds  Int                         @default(60) @map("interval_seconds")
  sendWindowStart  String?                     @map("send_window_start")
  sendWindowEnd    String?                     @map("send_window_end")
  /// Índice (0-based) da etapa em execução agora. Nulo até o disparo iniciar.
  currentStepIndex Int?                        @map("current_step_index")
  pausedReason     String?                     @map("paused_reason")
  createdByUserId  String?                     @map("created_by_user_id")
  createdAt        DateTime                    @default(now()) @map("created_at")
  updatedAt        DateTime                    @updatedAt @map("updated_at")

  steps   GroupBroadcastStep[]
  targets GroupBroadcastTarget[]
  tenant  Tenant                 @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, sessionName])
  @@map("group_broadcasts")
}

/// Uma publicação da sequência. Campos de recorrência IDÊNTICOS aos que
/// `GroupBroadcast` já tinha — só mudaram de dono (agora são por etapa).
model GroupBroadcastStep {
  id                      String                      @id @default(uuid())
  tenantId                String                      @map("tenant_id")
  broadcastId             String                      @map("broadcast_id")
  /// Ordem de execução (0, 1, 2...) — única por campanha.
  order                   Int
  messageTemplate         String                      @db.Text @map("message_template")
  mediaContent            Bytes?                      @map("media_content")
  mediaMimeType           String?                     @map("media_mime_type")
  mediaFileName           String?                     @map("media_file_name")
  mediaContentType        WhatsAppMessageContentType? @map("media_content_type")
  recurrenceIntervalHours Int?                        @map("recurrence_interval_hours")
  recurrenceMaxRuns       Int?                        @map("recurrence_max_runs")
  recurrenceEndsAt        DateTime?                   @map("recurrence_ends_at")
  runsCompleted           Int                         @default(0) @map("runs_completed")
  nextRunAt               DateTime?                   @map("next_run_at")
  createdAt               DateTime                    @default(now()) @map("created_at")

  tenant    Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  broadcast GroupBroadcast @relation(fields: [broadcastId], references: [id], onDelete: Cascade)

  @@unique([broadcastId, order])
  @@index([tenantId, broadcastId])
  @@map("group_broadcast_steps")
}
```

`GroupBroadcastTarget` **não muda de schema** — continua uma lista por
campanha (`broadcastId`), reaberta (`resetTargetsForNextRun`) a cada nova
repetição OU a cada transição de etapa. `sentCount` já é cumulativo
(2026-09-13) e passa a somar publicações de QUALQUER etapa, sem mudança de
código nesse campo — é exatamente a métrica "quantas publicações esse grupo já
recebeu, no total".

### Migração dos dados existentes

Migration única, em dois passos:
1. Criar `GroupBroadcastStep` com as colunas acima.
2. Para cada `GroupBroadcast` existente, criar UMA `GroupBroadcastStep` (order
   `0`) copiando `messageTemplate`/mídia/campos de recorrência daquela linha;
   gravar `currentStepIndex = 0` (ou `null` se a campanha ainda não iniciou,
   isto é, `status = 'DRAFT'`).
3. Remover de `GroupBroadcast` as colunas que migraram para `GroupBroadcastStep`
   (`messageTemplate`, mídia, campos de recorrência, `runsCompleted`,
   `nextRunAt`).

As 3 campanhas em produção (E-Sim, Conta Uber, Carro Atrasado) viram campanhas
de 1 etapa, com o mesmo `recurrenceIntervalHours`/`recurrenceMaxRuns`/
`runsCompleted`/`nextRunAt` que já tinham — nenhuma mudança de comportamento.

## Motor de execução

O ponto de decisão é o mesmo de hoje — `decideNextRun`
(`groupBroadcastRecurrence.ts`) — chamado ao fim de cada ciclo de envio
(`GroupBroadcastSendJobProcessor`, quando `remaining === 0`). Hoje a função
decide só entre "repete a mesma etapa" e "encerra". Passa a decidir em três
saídas:

1. **Repete a etapa atual** (comportamento de hoje: ainda não bateu no teto de
   repetições/data da ETAPA atual) → calcula `nextRunAt` da etapa, agenda via
   `start-group-broadcast-run`, como já acontece.
2. **Avança para a próxima etapa** (a etapa atual esgotou suas repetições E
   existe `steps[currentStepIndex + 1]`) → incrementa `currentStepIndex`,
   reabre os alvos (mesmo `resetTargetsForNextRun`), calcula o `nextRunAt` da
   PRIMEIRA repetição da etapa nova (respeitando a janela de horário da
   campanha, com o fuso `America/Sao_Paulo` já corrigido em 2026-09-13), e
   agenda o próximo ciclo normalmente.
3. **Encerra a campanha** (a etapa atual esgotou E não há próxima etapa) —
   `status = 'completed'`, como hoje.

`GroupBroadcastRunJobProcessor` (que abre um ciclo de envio) passa a ler a
mensagem/mídia da etapa **em `currentStepIndex`**, não mais direto de
`GroupBroadcast` — é a única mudança estrutural nesse processador.

**Pausar/cancelar:** inalterado — mudam só `status`; o job de fila dispara,
relê o status do banco, e não faz nada se não for `running`. Retomar
(`startBroadcast`) continua da etapa/repetição em que estava (`currentStepIndex`/
`runsCompleted` da etapa não mudam ao pausar).

**Disjuntor de segurança** (`shouldPauseGroupBroadcast`, 2 falhas seguidas):
inalterado — olha o histórico de tentativas em `GroupBroadcastTarget`
(`attemptedAt`/`status`), que é da campanha inteira, não da etapa. Uma
transição de etapa não zera esse histórico.

## API / Aplicação

`CreateGroupBroadcastInput` passa a receber `steps: CreateGroupBroadcastStepInput[]`
em vez dos campos de mensagem/recorrência soltos:

```ts
interface CreateGroupBroadcastStepInput {
  messageTemplate: string;
  recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number;
  recurrenceEndsAt?: Date;
}
```
(mídia continua anexada depois da criação, via `attachMedia` — agora recebendo
também `stepId` — o `id` da etapa, NUNCA o `order` — mesmo fluxo de upload em
2 passos que já existe hoje. Referenciar por `id` em vez de posição evita que
uma reordenação de etapas antes de iniciar deixe uma mídia "grudada" na
posição errada.)

Validação no `groupBroadcastsRouter` (Zod): `steps` é um array de 1 a **20**
entradas (teto novo — mesmo espírito do teto de 30 grupos e 100 repetições já
existentes: um número que dá para revisar visualmente antes de disparar). Cada
etapa valida sua própria recorrência com as mesmas regras de hoje
(`recurrenceMaxRuns` mínimo 2, `recurrenceEndsAt` no futuro).

Novos erros de domínio: `NoStepsProvidedError`, `TooManyStepsError` (mesma
forma de `NoGroupsSelectedError`/`TooManyGroupsSelectedError`).

Rotas: mantém a mesma estrutura REST (`GET/POST /group-broadcasts`,
`POST /:id/{start,pause,cancel}`, `DELETE /:id`), sem rota nova — a mudança é
só de FORMATO do corpo de criação e do que o detalhe devolve.

`GroupBroadcastDetail` passa a incluir `steps: GroupBroadcastStep[]` (a lista
completa, na ordem) e `currentStepIndex`, além de `summary`/`targets` (que não
mudam).

`attachMedia`/`removeMedia`/`getMedia` continuam com a mesma régua
("`draft`-only") mas passam a operar sobre `GroupBroadcastStep` (recebem
`stepId`), e a rota HTTP ganha o `id` da etapa no path
(`POST /:broadcastId/steps/:stepId/media`).

## Frontend

**`GroupBroadcastCreateForm`:** o campo único de mensagem vira uma seção
**"Publicações"** — lista de cartões, cada um com texto + anexo de mídia +
controle de repetição (idêntico ao que já existe hoje, só que dentro do
cartão da etapa em vez de solto na tela). Botão "Adicionar publicação"
(desabilitado ao chegar em 20); cada cartão tem "Remover" (mínimo 1 etapa) e
setas ou drag simples para reordenar antes de criar.

**`GroupBroadcastDetailPanel`:** ganha uma seção "Publicações desta campanha"
mostrando a lista de etapas na ordem, destacando qual está em execução agora
("Publicação 2 de 4") e quantas repetições dessa etapa já saíram — mesmo
padrão visual do badge de recorrência que já existe, só que agora contextual
à etapa atual, não à campanha inteira.

**Edição:** só em `status === 'draft'` — mesma régua que já existe para mídia
de campanha 1:1. Depois de iniciada, a lista de etapas fica somente leitura
(o operador vê o que vem a seguir, mas não edita).

## Testes

- `groupBroadcastRecurrence.test.ts`: `decideNextRun` ganha os casos de
  "avança para próxima etapa" e "não há próxima etapa → encerra", ao lado dos
  já existentes de "repete a mesma etapa".
- `GroupBroadcastService.test.ts`: criação com N etapas (valida teto de 20,
  zero etapas rejeitado), `attachMedia` por `stepId`, reordenar etapas em
  rascunho sem perder a mídia já anexada.
- `GroupBroadcastRunJobProcessor`/`GroupBroadcastSendJobProcessor`: mensagem/
  mídia enviada é a da etapa correta; transição de etapa reabre os alvos.
- `groupBroadcastsRouter.test.ts`: validação de `steps` (array vazio, >20,
  recorrência inválida por etapa).
- Migration: teste de integração confirmando que uma `GroupBroadcast` legada
  (1 mensagem, sem `steps`) vira corretamente 1 `GroupBroadcastStep` após a
  migração, preservando `recurrenceIntervalHours`/`runsCompleted`/`nextRunAt`.
- Frontend: `GroupBroadcastCreateForm` (adicionar/remover/reordenar etapas,
  teto de 20), `GroupBroadcastDetailPanel` (mostra etapa atual e progresso).

## Fora de escopo (registrado, não esquecido)

- Grupos-alvo diferentes por etapa (decisão do fundador: uma lista só, pra
  toda a campanha).
- Horário exato por publicação (decisão do fundador: só intervalo fixo).
- Editar uma campanha já iniciada (mesma régua de hoje: só `draft` edita).
