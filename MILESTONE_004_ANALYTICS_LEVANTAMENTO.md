# Milestone 4 — Analytics — Levantamento Arquitetural

> ✅ **MILESTONE IMPLEMENTADA (M4A–M4E concluídos, 2026-07-18)** — ver ADR #60 e `PROJECT_STATUS.md` §28 para o registro de encerramento, incluindo as pendências de validação na máquina real (lock do npm, `prisma migrate`, suíte `dashboard-jsdom`, `next build`). Este documento permanece como registro do plano aprovado (ADR #59).

> Documento de planejamento. Nenhum código foi implementado a partir daqui — mesmo processo já usado nos Blocos 3A–6 (ver `BLOCO_5_LEVANTAMENTO_ARQUITETURAL.md`, `BLOCO_6_LEVANTAMENTO_ARQUITETURAL.md` e `DECISIONS.md` ADRs #52–#58). Escopo desta rodada: **somente pesquisa, decisões e plano de execução**, sem qualquer alteração de arquivo de código. Todas as afirmações foram verificadas por leitura direta de código/schema/ADRs nesta sessão (`Read`/`Grep`), não por suposição.
>
> **Decisão de escopo (D35, já tomada pelo usuário)**: a próxima milestone é **Analytics de produto por tenant, derivado dos dados já existentes**. CRM (Leads/Campanhas) e Auth (usuários/JWT) estão **explicitamente fora** desta milestone.

---

## 1. Resumo Executivo

A Milestone 4 é a primeira cujo valor vem inteiramente de **ler e agregar dados que já existem** — não há entidade de negócio nova. As tabelas vivas que carregam sinal analítico são `AiInteraction` (custo/tokens/latência/status por tentativa de IA), `WhatsAppMessage` (fluxo inbound/outbound), `WhatsAppSessionEvent` (estabilidade de conexão) e `WhatsAppConversation` (contagem por status `bot`/`human`). É a milestone de **menor superfície de escrita** de todo o projeto.

A leitura direta do schema revelou o achado que define a milestone: **os índices atuais não suportam agregação temporal por tenant**. `AiInteraction` tem `@@index([tenantId, conversationId, createdAt])` — o `conversationId` no meio impede que uma consulta "custo total do tenant por dia" (filtra `tenantId` + range de `createdAt`, sem `conversationId`) use o índice eficientemente. `WhatsAppMessage` tem `@@index([tenantId])` e `@@index([conversationId, occurredAt])`, mas nenhum `[tenantId, occurredAt]`. Portanto, Analytics exige tocar o Prisma (novos índices → migration aditiva). Este é o único ponto que fura o "só ler dados existentes" — resolvido em **D43**, e é uma mudança de backend aprovada explicitamente pelo usuário.

**D51 (restrição de escopo aprovada, governa toda a milestone)**: Analytics é um bounded context **exclusivamente read-only**. É **proibido** nesta milestone criar novas entidades de negócio, tabelas de rollup, cache persistente, jobs, BullMQ, Redis, schedulers ou qualquer mecanismo de pré-agregação. A **única** alteração permitida no schema Prisma é a migration aditiva de índices de D43. Toda métrica é derivada por consulta direta, no momento da requisição, sobre as tabelas existentes.

Fora isso, a milestone é limpa: um novo bounded context `services/analytics` read-only, endpoints de agregação, BFF fino, e a primeira UI verdadeiramente visual do projeto (gráficos) — que finalmente justifica adotar `recharts` + jsdom (decisão adiada duas vezes pelas ADRs #51/#58).

**Decisões**: D42–D51 (10, todas aprovadas). **Sub-blocos**: M4A–M4F (6).

---

## 2. Decisões Arquiteturais (D42–D51 — todas aprovadas pelo usuário)

### D42 — Escopo de métricas do MVP — APROVADA

Recorte derivável das tabelas atuais, agrupável por dia dentro de uma faixa `[from, to]`:

- **Uso de IA** (de `AiInteraction`): nº de interações; contagem por `status` (`success`/`validation_rejected`/`provider_error`); soma de `tokensInput`/`tokensOutput`; soma de `costUsd`; latência média (`latencyMs`).
- **Fluxo de mensagens** (de `WhatsAppMessage`): contagem `inbound` vs `outbound` por dia.
- **Conversas** (de `WhatsAppConversation`): contagem atual por `status` (`bot`/`human`); novas conversas por dia (`createdAt`).
- **(Extensão opcional dentro da milestone) Estabilidade de sessão** (de `WhatsAppSessionEvent`): transições/quedas por dia.

Fora de escopo (D42-C rejeitada): métricas **operacionais** (latência de API, profundidade de fila, hit-rate de Redis) — são observabilidade de infra (Prometheus/OpenTelemetry), uma milestone própria, não esta.

### D43 — Migration aditiva de índices — APROVADA (única mudança de schema permitida, ver D51)

Adicionar, de forma estritamente aditiva (sem alterar nenhuma coluna/contrato de dados existente):

- `@@index([tenantId, createdAt])` em `AiInteraction` (model `AiInteraction`, tabela `ai_interactions`).
- `@@index([tenantId, occurredAt])` em `WhatsAppMessage` (tabela `whatsapp_messages`).
- `WhatsAppSessionEvent` já possui `@@index([tenantId, sessionName, occurredAt])`, cujo prefixo `tenantId` serve a agregação temporal por tenant — **nenhum índice novo necessário** aqui.
- `WhatsAppConversation` já possui `@@index([tenantId])`; contagem por status é sobre volume pequeno — **nenhum índice novo necessário** (revisitar só se um tenant tiver dezenas de milhares de conversas e a contagem por status ficar lenta).

Índices são metadados de performance, não contrato de dados — não quebram nenhuma das invariantes do § final. Alternativa de rollup pré-agregado (D43-C) rejeitada por YAGNI e, agora, proibida por D51.

### D44 — Técnica de agregação — APROVADA (híbrido)

- **Séries temporais** (custo/dia, mensagens/dia, novas conversas/dia): `$queryRaw` com `date_trunc('day', ...)` + `SUM`/`COUNT`/`AVG` no Postgres. `Prisma.sql`/parâmetros SEMPRE — `tenantId` como parâmetro vinculado, **nunca** interpolado/concatenado (primeira SQL crua do projeto; injection é o risco central, ver §4).
- **Agregações não-temporais** (soma total do período, contagem por `status`/`provider`): Prisma `aggregate`/`groupBy` do query builder (type-safe).
- Bucketização em memória (D44-C) **proibida para séries** — traria N linhas para a aplicação, colide com D51 (nada de pré-agregação/cache) e com o teto de performance de `CLAUDE.md` §14.

### D45 — Fuso horário do bucketing — APROVADA (UTC)

`date_trunc` em **UTC**, fixo. Documentado explicitamente na resposta da API (mesmo espírito das limitações documentadas de D12/D26). Fuso por tenant (exigiria coluna nova em `Tenant` — proibido por D51) e fuso por parâmetro do cliente ficam registrados como evolução futura, fora desta milestone.

### D46 — Serialização de custo agregado — APROVADA (invariante, não opção)

`costUsd` é `Decimal(12,8)` no banco / `string` no domínio, **nunca** `number`. `SUM(cost_usd)` volta como `Decimal`; a cadeia inteira (Postgres → `AnalyticsRepository` → DTO → JSON) preserva **string decimal exata**, jamais `Number()`. O componente de gráfico converte para número **só na fronteira de renderização** (eixo do recharts), nunca no transporte. Restrição herdada do Bloco 3b (arredondamento de float é inaceitável para dinheiro).

### D47 — Novo bounded context `services/analytics` read-only — APROVADA

Novo `services/analytics` com seu próprio `AnalyticsRepository`, que consulta as tabelas via Prisma/`$queryRaw` **diretamente** — sem depender de, nem alterar, os repositórios dos outros bounded contexts (`AiInteractionRepository`, `MessageRepository` etc. permanecem **intocados**, cumprindo a restrição do usuário). Agregação read-only é uma preocupação própria do contexto de analytics; ler tabelas de outros contextos por SQL de leitura não é invadir o domínio alheio (não muta nada, não importa entidades ricas de outro contexto). Adicionar `sumCostByTenant` ao `AiInteractionRepository` existente (D47-C) foi rejeitado — violaria "não alterar Application/Infra do backend existente".

### D48 — Contrato do endpoint de agregação — APROVADA

Endpoints por métrica sob `/api/tenants/:tenantId/analytics/...`, atrás de `requireApiKey`, montados path-scoped com `analyticsErrorHandler` próprio (padrão D16/D17/D18 do Bloco 5):

- `GET .../analytics/ai-usage?from=&to=&granularity=day`
- `GET .../analytics/messages?from=&to=&granularity=day`
- `GET .../analytics/conversations?from=&to=&granularity=day`
- `GET .../analytics/session-stability?from=&to=&granularity=day` (se D42 extensão)

`from`/`to` obrigatórios (ISO date), validados por Zod na rota; teto de janela (ex.: 366 dias — mesmo espírito de `MAX_LIST_LIMIT`); `granularity` só `day` no MVP. GraphQL (D48-C) rejeitada — projeto é REST; doc que promete GraphQL é stale (ver D20).

### D49 — recharts + jsdom — APROVADA

- **`recharts`**: dependência de UI justificada por necessidade real (gráficos) — primeira lib de UI nova aprovada (ao contrário de shadcn, rejeitada em D30).
- **jsdom + Testing Library**: adotados agora, como decisão de infraestrutura de teste própria (não a reboque) — a M4 é a primeira milestone majoritariamente visual, encerrando a pendência que as ADRs #51/#58 deixaram em aberto ("revisitar quando a superfície de UI crescer"). Reconfiguração via **terceiro projeto Jest** (`dashboard-jsdom`), isolado, para **não** migrar as suítes `.test.ts` `node` atuais (risco de regressão). Lógica de transformação (série → formato recharts) continua extraída para `lib/` puro testável (`node`); jsdom cobre só a renderização condicional (loading/erro/vazio).

### D50 — Estrutura da UI — APROVADA

Página própria `/analytics` + terceiro link no `Sidebar` (consistente com D34: uma página por área). Widgets embutidos na home (D50-B) rejeitados.

### D51 — Analytics é exclusivamente read-only — APROVADA (restrição-mãe da milestone)

Analytics deriva **todas** as métricas diretamente das tabelas existentes, por consulta no momento da requisição. **Proibido** nesta milestone: novas entidades de negócio, tabelas de rollup, cache persistente, jobs, BullMQ, Redis, schedulers, qualquer pré-agregação. **Única** alteração de schema permitida: a migration aditiva de índices de D43. Esta decisão governa e restringe todas as demais — em qualquer conflito futuro, D51 prevalece (ex.: se a performance de uma agregação incomodar, a resposta é índice/consulta melhor, **nunca** um rollup/cache).

---

## 3. Sub-blocos executáveis (M4A–M4F)

> Mesma disciplina incremental dos Blocos 4/5/6: cada sub-bloco termina com lint + testes pertinentes + `tsc` verdes antes do próximo. Nenhum avança com a etapa anterior quebrada.

### M4A — Abertura da milestone (higiene + migration de índices)

**Escopo**: (1) avisos de "documento superado, ver CLAUDE.md/DECISIONS.md" no topo dos 4 arquivos stale (`ARCHITECTURE.md`, `PROJECT_CONTEXT.md`, `CODING_STANDARDS.md`, `specs/M003-Conversations.md`) — fecha o risco de D20 pela terceira vez; (2) migration Prisma aditiva de D43 (`[tenantId, createdAt]` em `AiInteraction`, `[tenantId, occurredAt]` em `WhatsAppMessage`).
**Critérios de aceite**: `prisma migrate dev` gera a migration; `prisma generate` limpo; os 536 testes existentes continuam verdes (nenhum contrato muda); nenhuma coluna alterada (só `@@index`). No sandbox, a corrupção conhecida do Prisma Client (ADR #56) pode impedir `generate` — documentar, validar na máquina real.
**Sem código de feature.**

### M4B — Backend: domain + application de `services/analytics`

**Escopo**: `AnalyticsRepository` (port, `services/analytics/domain/repositories/`) com métodos de agregação (`aiUsageByPeriod`, `messageFlowByPeriod`, `conversationCounts`, opcional `sessionStabilityByPeriod`); DTOs de série temporal (`AnalyticsPeriodPoint`, etc.); `AnalyticsService` (`application/`) que valida o tenant via `TenantRepository` (padrão `assertTenantExists`, herda o mapeamento correto de `TenantNotFoundError` — D14/Bloco 5), aplica o teto de janela (D48) e delega ao port. Erros de domínio próprios se necessário (ex.: `InvalidAnalyticsRangeError`).
**Critérios de aceite**: testes unitários de `AnalyticsService` com um `FakeAnalyticsRepository` (janela inválida → erro; tenant inexistente → `TenantNotFoundError`; teto de janela aplicado; delegação correta). `costUsd` string ponta a ponta. Lint/tsc verdes.

### M4C — Backend: infrastructure + wiring

**Escopo**: `PrismaAnalyticsRepository` (`$queryRaw`+`date_trunc` para séries; `aggregate`/`groupBy` para não-temporais; `costUsd` sempre string — D44/D46; `tenantId` sempre parâmetro vinculado — §4); `createAnalyticsComposition(prisma, logger)` (padrão dos composition roots existentes); `analyticsRouter` (Zod, thin router — D18) + `analyticsErrorHandler` (mapeia `TenantNotFoundError`, path-scoped — D14/D17); wiring em `index.ts` (montar sob `/api/tenants/:tenantId/analytics`, atrás de `requireApiKey`, error handler path-scoped; degradação graciosa não se aplica — analytics não depende de Redis).
**Critérios de aceite**: teste de repo com Prisma mockado (formato do `$queryRaw`, parametrização de `tenantId`, `costUsd` string); teste de integração de rota (supertest + Fakes, incluindo fechamento de IDOR e faixa inválida → 400); `analyticsErrorHandler` mapeando `TenantNotFoundError` → 404 (teste dedicado, padrão Bloco 5). Lint/tsc; `tsc` do `apps/api` continua com só a corrupção pré-existente do Prisma Client (ADR #56), agora com eventuais novos call sites do mesmo tipo — documentar, sem impacto em teste.

### M4D — BFF (dashboard `pages/api`)

**Escopo**: `createApiClient('analytics')` (D21, já pronto para reuso — só instanciar); rotas proxy `pages/api/analytics/{ai-usage,messages,conversations,session-stability}.ts` (proxy fino, `requireSession`, repassam `from`/`to`/`granularity`); DTOs de analytics em `lib/clientApi.ts` + funções `fetchAiUsage`/etc.
**Critérios de aceite**: testes de rota (padrão `tests/pages/api/*`, `node`, sem jsdom) — repasse de query, 401 sem sessão, 405 por método. Lint/tsc.

### M4E — Dashboard: UI de Analytics

**Escopo**: setup do terceiro projeto Jest `dashboard-jsdom` + `recharts`/`@testing-library`/`jsdom` no `package.json` (D49); `lib/analyticsView.ts` (transformações puras série→recharts, testadas em `node`); hooks (`useAiUsageAnalytics`, `useMessagesAnalytics`, `useConversationsAnalytics` — fetch simples, seletor de faixa de tempo em estado local); componentes de gráfico (`AiCostChart`, `MessageFlowChart`, `ConversationStatusChart`, `MetricCard`, `DateRangePicker`) usando o token `primary` (D30); página `pages/analytics.tsx` (guard `requirePageSession`, estados loading/erro/vazio); link "Analytics" no `Sidebar` (D50).
**Critérios de aceite**: testes de `analyticsView` (`node`); primeiros testes de componente (`jsdom`) cobrindo estados loading/erro/vazio de pelo menos um gráfico; as suítes `node` existentes intocadas e verdes. Lint/tsc. `costUsd` convertido para número só na fronteira do recharts.

### M4F — Validação final + documentação

**Escopo**: suíte completa (`node` + `dashboard-jsdom`), lint dos dois workspaces, `tsc`, `next build` (a confirmar na máquina real — pendência conhecida M2/M3); ADR nova de encerramento da M4; `MILESTONE_004_ANALYTICS_LEVANTAMENTO.md` marcado como concluído; `PROJECT_STATUS.md` §28; `ROADMAP.md` M4 → DONE.
**Critérios de aceite**: todas as suítes verdes; lint limpo; `tsc` só com a corrupção conhecida do Prisma (ADR #56); documentação atualizada; relatório final com arquivos afetados, decisões implementadas, e confirmação de que nada além da M4 foi iniciado.

---

## 4. Riscos

| Risco                                                               | Categoria         | Descrição                                                                                        | Mitigação                                                                                                                                                             |
| ------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Migration de índices (D43) toca o backend "protegido"**           | Schema            | Único ponto que altera o Prisma.                                                                 | Estritamente aditiva (só `@@index`), aprovada explicitamente; não altera nenhuma coluna/contrato; 536 testes existentes continuam verdes como prova de não-regressão. |
| **`$queryRaw` é a primeira SQL crua do projeto**                    | Segurança         | Injection se `tenantId`/datas forem interpolados.                                                | `Prisma.sql`/parâmetros vinculados SEMPRE; `tenantId` nunca concatenado; teste explícito de que a query é parametrizada.                                              |
| **jsdom reconfigura o Jest**                                        | Tooling/testes    | Trocar `testEnvironment` global quebraria as suítes `node` atuais.                               | Terceiro projeto Jest isolado (`dashboard-jsdom`); os projetos `api`/`dashboard` (node) ficam intocados.                                                              |
| **Precisão de `costUsd` (D46)**                                     | Correção de dados | Alguém faz `Number(sum)` "para o gráfico" e vaza float no transporte.                            | Invariante testada: DTO/JSON sempre string; conversão só no eixo do recharts.                                                                                         |
| **`next build` não-validável no sandbox + recharts (bundle maior)** | Build             | Compile webpack excede o teto de execução do ambiente.                                           | Confirmar na máquina real (mesma pendência M2/M3, ADRs #50/#51).                                                                                                      |
| **Corrupção do Prisma Client no sandbox (ADR #56)**                 | Ambiente          | `prisma generate` bloqueado por rede; novos call sites de agregação podem herdar erros de `tsc`. | Documentar; zero impacto em `npm test` (`import type` apagado pelo ts-jest); irrelevante na máquina real.                                                             |
| **Bucket UTC pode confundir tenant em outro fuso (D45)**            | UX/produto        | "Por dia" à meia-noite UTC.                                                                      | Limitação documentada na resposta da API; evolução (fuso por parâmetro) registrada, fora do escopo.                                                                   |
| **Tentação de cache/rollup ao ver latência (D51)**                  | Escopo            | Uma agregação pesada pode tentar um rollup.                                                      | D51 é restrição-mãe: a resposta é índice/consulta melhor, nunca pré-agregação — proibido nesta milestone.                                                             |

**Nenhuma violação de Clean Architecture/DDD prevista**: `services/analytics` lê tabelas por SQL de leitura sem importar entidades ricas nem repositórios de outros contextos; a direção de dependência se mantém. O único acoplamento é a leitura de tabelas físicas de outros contextos — aceitável para um contexto de analytics read-only, e isolado no `AnalyticsRepository` (nunca vaza para Application/Presentation).

## 5. Dependências e Pré-requisitos

- **Migration de D43 aplicada** (M4A) antes de M4C (as consultas dependem dos índices para performance; funcionam sem eles, mas fora do teto de `CLAUDE.md` §14).
- **`recharts` + `jsdom`/Testing Library** adicionados ao `apps/dashboard/package.json` (M4E) — únicas dependências novas da milestone.
- **Nenhuma dependência de Redis/BullMQ/worker** (D51) — analytics não toca a infraestrutura de fila.
- **Ordem**: M4A → M4B → M4C → M4D → M4E → M4F (backend antes do BFF antes da UI; higiene/migration primeiro).

## 6. Estratégia de Testes

- **Backend unit** (M4B): `AnalyticsService` com `FakeAnalyticsRepository` — validação de faixa, teto de janela, `TenantNotFoundError`, delegação, `costUsd` string.
- **Backend infra** (M4C): `PrismaAnalyticsRepository` com Prisma mockado — forma do `$queryRaw`, parametrização de `tenantId` (teste anti-injection explícito), mapeamento de linhas → DTO, `costUsd` string.
- **Backend integração** (M4C): supertest + Fakes — 200 com payload agregado, 400 para faixa inválida, 404 para tenant inexistente, fechamento de IDOR (tenant da sessão nunca de parâmetro), 401/405.
- **BFF** (M4D): rotas proxy no projeto `node` (sem jsdom) — repasse de query, 401/405, mesmo padrão de `tests/pages/api/sessions/*`.
- **Frontend lógica pura** (M4E): `lib/analyticsView.ts` no projeto `node` — transformações série→recharts, buracos de datas preenchidos, `costUsd` string→número só na fronteira.
- **Frontend componente** (M4E): projeto novo `dashboard-jsdom` — estados loading/erro/vazio de ao menos um gráfico (primeiros testes de componente do projeto).
- **Não-regressão**: as 80 suítes / 536 testes atuais permanecem verdes em toda etapa.

## 7. Arquivos que provavelmente serão afetados

**Novos backend**: `apps/api/src/services/analytics/domain/repositories/AnalyticsRepository.ts`, `apps/api/src/services/analytics/domain/errors/*` (se necessário), `apps/api/src/services/analytics/application/AnalyticsService.ts`, `apps/api/src/services/analytics/infrastructure/repositories/PrismaAnalyticsRepository.ts`, `apps/api/src/services/analytics/presentation/{analyticsRouter,analyticsErrorHandler}.ts`, `apps/api/src/services/analytics/compositionRoot.ts` + testes espelhados em `apps/api/tests/services/analytics/*`.
**Modificados backend**: `prisma/schema.prisma` (só `@@index` — D43); `apps/api/src/index.ts` (montar router path-scoped).
**Novos BFF**: `apps/dashboard/pages/api/analytics/*.ts` + testes.
**Modificados dashboard**: `apps/dashboard/lib/apiClient.ts` (+`callAnalyticsApi`), `apps/dashboard/lib/clientApi.ts` (DTOs + funções), `apps/dashboard/components/Sidebar.tsx` (+link), `apps/dashboard/package.json` (+recharts/jsdom/testing-library), `jest.config.js` (+projeto `dashboard-jsdom`).
**Novos dashboard**: `apps/dashboard/lib/analyticsView.ts`, `apps/dashboard/hooks/useAiUsageAnalytics.ts` (+ outros), componentes de gráfico, `apps/dashboard/pages/analytics.tsx` + testes.
**Docs**: `DECISIONS.md` (ADR de planejamento + ADR de encerramento), `MILESTONE_004_ANALYTICS_LEVANTAMENTO.md` (este), `PROJECT_STATUS.md`, `ROADMAP.md`, avisos nos 4 documentos stale.

## 8. Contratos públicos invariantes (a M4 NÃO pode quebrar)

- Os 5 endpoints REST do Bloco 5 (`conversations`/`ai-interactions`) e os de sessões (M2).
- Assinaturas de `createWhatsAppSessionsRegistry`/`createWhatsAppSessionsComposition` (ADR #45).
- Fronteira de socket da ADR #54 (worker nunca toca Registry).
- Contrato da API key por tenant (`requireApiKey`).
- `costUsd` como string decimal exata; `AiInteraction` append-only.
- **Específico da M4 (D47/D51)**: **nenhum método novo nos repositórios existentes** — `AiInteractionRepository`/`MessageRepository`/etc. permanecem intocados; toda agregação vive no novo `AnalyticsRepository`. **Nenhuma tabela/coluna nova** — só índices (D43).

---

_Aguardando aprovação do plano de sub-blocos (M4A–M4F) antes de iniciar a implementação de M4A. Nenhum código deve ser escrito até essa aprovação._
