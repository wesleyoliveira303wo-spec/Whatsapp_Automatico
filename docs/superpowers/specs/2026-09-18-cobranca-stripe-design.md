# Cobrança e cadastro automático com Stripe (B5) — Especificação

**Data:** 2026-09-18
**Issue:** #16 (B5 do épico "Endurecimento e escala", #11)
**Estado:** desenho aprovado pelo fundador em quatro partes, nesta data.

## 1. Objetivo

Um cliente cria a conta, escolhe um plano, informa o cartão e passa a usar o
Francis sem que o fundador precise mexer no banco. Hoje todo plano pago é
ativado à mão (`CONTEXT.md`, "Billing manual"); isso deixa de ser o único
caminho.

**Fora de escopo:** emissão de nota fiscal (segue manual), Pix e boleto,
plano anual, cupons, e-mail enviado pelo próprio Francis, cobrança por uso.

## 2. Decisões do fundador (2026-09-18)

| Tema | Decisão |
|---|---|
| Gateway | Stripe |
| Forma de pagamento | Mensal, só cartão |
| Integração | Página de pagamento e portal do cliente hospedados pelo Stripe, mais avisos (webhooks) para o nosso servidor |
| Teste grátis | 1 dia do plano escolhido, liberado só com cartão cadastrado; cobrança automática no dia seguinte |
| Teste por conta | Um só, para sempre |
| Cadastro | Continua sem cartão, criando a conta Grátis; o plano é escolhido depois |
| Pagamento que falha | 3 dias de tolerância; depois volta ao Grátis |
| Nota fiscal | Manual, pelo fundador |
| Planos | Disparos R$ 69, Pro R$ 119, Enterprise R$ 249 |
| Disparos libera | Tudo menos IA |
| WhatsApps por plano | Grátis 1, Disparos 1, Pro 1, Enterprise 5 |
| Excedentes ao descer | Desconecta os mais novos, mantendo o histórico |
| Recurso fora do plano | Some da tela no Disparos; no Grátis continua visível e bloqueado (vitrine) |

Estas decisões **substituem** três registros do `CONTEXT.md` feitos em
2026-09-05 ("Ativação manual" como único caminho, "Período de teste grátis:
zero", "Tolerância de atraso: zero") e os preços antigos (Pro R$ 99,
Enterprise R$ 349). O glossário é atualizado na etapa 1.

## 3. Planos e o que cada um libera

| Plano (código) | Nome na tela | Preço | WhatsApps | Operação | IA |
|---|---|---|---|---|---|
| `free` | Grátis | R$ 0 | 1 | não | não |
| `broadcast` | Disparos | R$ 69 | 1 | sim | não |
| `pro` | Pro | R$ 119 | 1 | sim | sim |
| `enterprise` | Enterprise | R$ 249 | 5 | sim | sim |

- **Operação:** responder pela Dashboard, campanhas para contatos, disparos
  em grupos, Contatos, Pipeline (movimentação manual), Tags, Respostas
  rápidas, Analytics.
- **IA:** resposta automática, classificação automática do Pipeline, Cérebro
  da IA, resumo de conversa por IA.

### 3.1 Uma regra, um lugar

`shared/tenant/domain/planPermiteUso.ts` (hoje: "plano ≠ free libera tudo")
dá lugar a `shared/tenant/domain/planCapabilities.ts`:

```ts
export type PlanCapability = 'operation' | 'ai';
export function planAllows(plan: TenantPlan, capability: PlanCapability): boolean;
export function sessionLimitFor(plan: TenantPlan): number;
```

Os seis pontos que consultam o plano passam a pedir o recurso certo:

| Ponto | Recurso |
|---|---|
| `MessageIngestionService` (agendar resposta de IA) | `ai` |
| `AiReplyJobProcessor` (re-checagem antes de gerar) | `ai` |
| `StageClassificationJobProcessor` | `ai` |
| `ConversationsService` (responder pela Dashboard) | `operation` |
| `CampaignService` (iniciar campanha) | `operation` |
| `GroupBroadcastService` (iniciar disparo em grupos) | `operation` |

Gerar resumo de conversa por IA passa a exigir `ai` no servidor (hoje não
consulta o plano). O Cérebro da IA continua editável por quem tem permissão,
mas sem efeito sem `ai`; a tela some no Disparos (§3.3).

### 3.2 Limite de WhatsApps

Uma sessão **ocupa vaga** quando está conectada ou tem credenciais salvas
(poderia se reconectar sozinha). Iniciar a conexão de uma sessão que não
ocupa vaga é recusado quando o tenant já ocupa `sessionLimitFor(plan)`
vagas, com erro próprio (409) e mensagem que aponta para a aba Plano.

A checagem fica no ponto em que a conexão começa (`WhatsAppSessionService`,
criação e reconexão), não na tela. Sessões que já ocupam vaga nunca são
derrubadas por esta regra; quem derruba excedentes é só a rotina de descida
(§5.2).

### 3.3 Painel

`usePlan`/`PlanContext` passam a expor `allows(capability)` e
`sessionLimit`, espelhando a regra do servidor (a trava real continua no
servidor; o painel só esconde).

- **Grátis:** comportamento atual — telas pagas visíveis com o aviso de
  upgrade (`PlanGate`/`UpgradeState`).
- **Disparos:** o que exige `ai` **some**: item "Cérebro da IA" do menu,
  bloco de resumo da conversa, botão liga/desliga da IA no cabeçalho,
  "Interações de IA" no painel de contexto, e os selos que falam de IA
  ("IA desativada", "Gerada por IA"). Acessar a URL do Cérebro direto leva à
  tela de conversas.
- A troca de plano mora num lugar só: a aba **Plano** (§4).

### 3.4 Planos manuais

Novo campo `Tenant.planSource`: `self_service` | `manual`, default
`self_service`. A migration marca `manual` só os tenants existentes com plano
pago (hoje ativados à mão); os tenants Grátis ficam `self_service` e podem
assinar.

- O Stripe **nunca** altera um tenant `manual`.
- O `/admin` pode dar um plano pago a um tenant sem assinatura no Stripe;
  isso grava `manual`. Voltá-lo ao Grátis pelo `/admin` grava
  `self_service`, devolvendo a ele o caminho de assinar.
- O `/admin` **não** troca o plano de um tenant com assinatura ativa no
  Stripe: responde 409 com "plano gerenciado pela assinatura". Sem isso, a
  cobrança continuaria correndo enquanto o plano dizia outra coisa. Suspender
  e reativar continuam valendo para qualquer tenant.

## 4. Assinar, testar, trocar e cancelar

### 4.1 Aba Plano

Nova aba **Plano** em `/settings`, visível para todos os cargos:

- plano atual, situação (teste até X, ativo, em atraso até X, cancelamento
  agendado para X) e próxima cobrança;
- os três planos pagos com preço, WhatsApps e o que liberam;
- botões **Assinar** (sem assinatura) e **Gerenciar assinatura** (com
  assinatura), só para o **dono** (permissão nova `billing:manage`, só
  `owner`).

Plano pago com origem `manual`: a aba mostra o plano e o texto "ativado pela
equipe do Francis", sem botões.

### 4.2 Teste de 1 dia

1. **Assinar** chama `POST /api/tenants/:tenantId/billing/checkout` com o
   plano escolhido.
2. O servidor cria (ou reaproveita) o cliente no Stripe e uma sessão de
   pagamento: modo assinatura, preço do plano, `payment_method_types:
   ['card']`, `payment_method_collection: 'always'`, `locale: 'pt-BR'`,
   `client_reference_id: tenantId`, e `trial_period_days: 1` **somente se a
   conta nunca usou teste** (`Tenant.trialUsedAt` nulo).
3. O navegador vai para a página do Stripe e volta para
   `/settings?tab=plan&checkout=done`, onde a aba mostra "Ativando seu
   plano…" até o plano mudar (consulta a cada 2s, até 60s; passado isso,
   "A confirmação está demorando — atualize a página em alguns minutos").
4. O plano só muda quando o **aviso** do Stripe chega (§6). A volta do
   navegador nunca ativa nada.
5. Ao ativar, grava `planSource = self_service` e, se houve teste,
   `trialUsedAt`.
6. No dia seguinte o Stripe cobra sozinho.

### 4.3 Portal do cliente

**Gerenciar assinatura** chama `POST /api/tenants/:tenantId/billing/portal`
e abre o portal do Stripe. Configuração do portal (feita uma vez, pelo
fundador, com passo a passo):

- atualizar cartão: sim;
- trocar entre os três planos: sim — **subir** vale na hora com cobrança
  proporcional; **descer** vale no fim do período pago;
- cancelar: sim, **no fim do período pago**; cancelar durante o teste não
  cobra nada.

## 5. Pagamento que falha e descida de plano

### 5.1 Tolerância de 3 dias

1. Aviso `invoice.payment_failed` com a assinatura em atraso: grava
   `Subscription.pastDueSince` (se ainda nulo) e agenda a tarefa
   `billing-grace` para `pastDueSince + 3 dias`
   (`jobId = buildJobId('billing-grace', tenantId, subscriptionId,
   String(pastDueSince.getTime()))`).
2. Faixa no topo para **todos os usuários** do tenant, com prazo em horário
   de Brasília; para o dono, com botão para o portal.
3. `invoice.paid` limpa `pastDueSince`; a faixa some.
4. Quando `billing-grace` roda, **relê a assinatura no Stripe**. Ainda em
   atraso: cancela a assinatura no Stripe na hora. Pago: não faz nada.
5. O cancelamento gera o aviso `customer.subscription.deleted`, que aplica a
   descida para Grátis pelo caminho normal (§6.3). Um único caminho de
   descida, qualquer que seja a causa.

Voltar depois disso é assinar de novo, sem teste.

### 5.2 Rotina de descida

Aplicada sempre que o plano de um tenant diminui — por cancelamento, atraso
vencido, troca para plano menor no portal, ou rebaixamento pelo `/admin`:

1. Grava o novo plano.
2. **Excedentes:** sessões que ocupam vaga, ordenadas por `createdAt`; as
   mais antigas até `sessionLimitFor(novoPlano)` ficam, as demais passam por
   `WhatsAppSessionService.detachSession` (nova): desconecta, evicta do
   registro e **apaga as credenciais**, mantendo o registro da sessão e todo
   o histórico. Reconectar exige QR (e vaga).
3. **Perdeu `operation`:** campanhas e disparos em grupos `running` são
   pausados com motivo `plan_downgrade`, sem cancelar.
4. **Perdeu `ai`:** nada a fazer; a IA é conferida a cada mensagem.
5. Grava `billing.plan_changed` no `AuditLog` do tenant com `from`, `to` e
   `source` (`stripe` | `grace` | `admin`).

Idempotente: aplicar a mesma descida duas vezes não muda nada na segunda.

## 6. Arquitetura

### 6.1 Módulo

Bounded context novo `apps/api/src/services/billing`:

- `domain/` — `Subscription` (entidade), `BillingGateway` (porta para o
  Stripe), `planForPrice`/`priceForPlan` (mapa preço ↔ plano), erros.
- `application/BillingService.ts` — `createCheckout`, `createPortalSession`,
  `handleEvent`, `syncFromStripe(tenantId)`, `expireGrace`.
- `application/PlanChangeService.ts` — a rotina da §5.2; também chamada
  pelo `TenantControlService` (`/admin`).
- `infrastructure/StripeBillingGateway.ts` — biblioteca oficial `stripe`.
  Exceção consciente à preferência do projeto por `fetch` direto (Gemini): a
  conferência de assinatura do webhook não se reescreve à mão.
- `presentation/billingRouter.ts` (rotas do tenant) e
  `billingWebhookRouter.ts` (rota pública).

### 6.2 Banco (migration aditiva)

- enum `TenantPlan` ganha `BROADCAST` (migration só com `ADD VALUE`).
- `Tenant.planSource` (`self_service` | `manual`, default `self_service`;
  a migration grava `manual` nos tenants existentes com plano pago),
  `Tenant.trialUsedAt DateTime?`.
- `Subscription`: `tenantId @unique`, `stripeCustomerId`,
  `stripeSubscriptionId?`, `plan`, `status` (`trialing` | `active` |
  `past_due` | `canceled` | `incomplete`), `trialEndsAt?`,
  `currentPeriodEnd?`, `cancelAtPeriodEnd`, `pastDueSince?`, `updatedAt`.
- `BillingEvent`: `stripeEventId @unique`, `type`, `receivedAt` — append-only,
  a garantia de processar cada aviso uma vez.

### 6.3 Aviso do Stripe (webhook)

- Rota pública `POST /billing/stripe/webhook` direto na API: nova regra no
  `deploy/caddy/Caddyfile` (`@stripe path /billing/stripe/webhook` →
  `api:4000`), como já é feito com `/health`.
- Corpo cru (`express.raw`) só nessa rota; assinatura conferida com
  `STRIPE_WEBHOOK_SECRET`. Assinatura inválida: 400, nada gravado.
- Evento já registrado em `BillingEvent`: 200 sem reprocessar.
- Eventos tratados: `checkout.session.completed`,
  `customer.subscription.created|updated|deleted`, `invoice.paid`,
  `invoice.payment_failed`. Os demais: 200 e ignorados.
- **Estado, não evento:** o tratamento de qualquer um deles termina em
  `syncFromStripe(tenantId)`, que relê a assinatura atual no Stripe e
  reconcilia plano, situação e datas. Avisos fora de ordem não corrompem
  nada.
- Erro inesperado: 500, para o Stripe reenviar. A gravação em `BillingEvent`
  acontece só depois do sucesso.

### 6.4 Configuração (`.env` e `.env.prod.example`, no mesmo PR)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BROADCAST`,
`STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`, `BILLING_PUBLIC_URL` (base das
URLs de volta). Sem `STRIPE_SECRET_KEY`, a cobrança fica desligada: a aba
Plano mostra só o plano atual e o texto "assinatura pelo site em breve"; o
resto do produto funciona igual (mesma degradação graciosa do resto do
projeto).

Os três preços são criados no Stripe por um script
(`scripts/createStripePrices.ts`, idempotente por `lookup_key`), em reais,
mensais.

## 7. Ordem de entrega

1. **Planos e limites** — `broadcast`, `planCapabilities`, os seis pontos,
   resumo exigindo `ai`, limite de WhatsApps, painel escondendo no Disparos,
   `planSource`, `/admin` oferecendo o Disparos, glossário atualizado.
   Funciona sem Stripe.
2. **Assinatura** — tabelas, gateway, checkout com teste, webhook, aba
   Plano, rota no Caddy, script de preços.
3. **Atraso e descida** — tolerância, faixa, `billing-grace`, rotina de
   descida (`detachSession`, pausa de disparos), portal.

## 8. Testes

- Domínio puro: `planAllows`, `sessionLimitFor`, mapa preço ↔ plano,
  decisão de descida (quais sessões ficam).
- `BillingService`/`PlanChangeService` com gateway falso: teste só na
  primeira assinatura; volta do navegador não ativa nada; tenant `manual`
  intocado; descida idempotente; `billing-grace` não age se pago.
- Webhook (supertest): assinatura inválida → 400; evento repetido não
  reprocessa; fora de ordem converge pelo estado.
- Integração contra Postgres real: `Subscription`/`BillingEvent`,
  unicidade do evento, `detachSession` mantendo histórico.
- jsdom: aba Plano por situação e cargo; no Disparos, Cérebro e resumo não
  aparecem; no Grátis, continuam com o aviso de upgrade.
- Ponta a ponta no **modo de teste do Stripe**, com cartões de teste
  (incluindo o que falha), usando `stripe listen` para encaminhar avisos
  ao ambiente local.
- Revisão de segurança antes do deploy (dinheiro e rota pública nova).

## 9. O que depende do fundador

- Conta Stripe ativada com dados e conta bancária (já existe).
- Colocar as chaves de **teste** no `.env` local, nunca no chat; as de
  produção só no `.env` da VM, no deploy.
- Ligar os e-mails automáticos do Stripe (recibo, cartão recusado, teste
  terminando) e configurar o portal (§4.3), com passo a passo fornecido.
- Emitir as notas fiscais.

## 10. Riscos

- **Abuso de teste:** contido por "um teste por conta"; alguém pode criar
  várias contas com cartões diferentes. Aceito nesta fase.
- **Descida durante disparo:** pausa em vez de cancelar, para não perder
  progresso nem gerar reenvio.
- **Aviso perdido:** o Stripe reenvia por até 3 dias; a reconciliação por
  estado cobre avisos fora de ordem. Uma checagem periódica de reconciliação
  fica registrada como evolução, não entra agora.
