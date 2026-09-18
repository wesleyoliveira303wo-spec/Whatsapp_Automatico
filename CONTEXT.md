# Francis — Glossário de Domínio

Francis é um CRM de atendimento no WhatsApp com IA para pequenas e médias
empresas. Este arquivo é **só um glossário** — a linguagem canônica do
projeto. Histórico de decisões, arquitetura e estado ficam em `CLAUDE.md`
(§18), `DECISIONS.md`, `PROJECT_STATUS.md` e `ROADMAP.md`.

Termos já bem estabelecidos no `CLAUDE.md` (não repetidos aqui): **Tenant**,
**Sessão** (uma conexão de WhatsApp), **Cérebro da IA**, **Pipeline**,
**escalonamento / handoff**, **Campanha / disparo**, **Contato**.

## Planos e monetização

**Plano** (`Tenant.plan`):
O nível de acesso de um tenant. Um de `free`, `broadcast`, `pro`,
`enterprise`. Todo tenant novo nasce `free`. O que cada plano libera e
quantos números aceita vive num lugar só: `planCapabilities.ts` na API,
espelhado em `lib/plans.ts` no painel.
_Avoid_: tier, licença. Não confundir com **Assinatura**: o plano é o que o
tenant pode usar; a assinatura é como um plano pago é cobrado.

**Plano Grátis** (`free`):
O tenant cria conta, conecta um WhatsApp e **vê as mensagens chegando na
Dashboard, em tempo real — e nada além disso**. A IA não responde; o
operador não responde pela Dashboard (só-leitura); os recursos (Cérebro da
IA, Campanhas, Contatos, Pipeline, Tags, Analytics, respostas rápidas,
resumo de conversa) ficam visíveis mas bloqueados com um aviso de upgrade.
É uma **demonstração** — existe para criar desejo, não para operar.
_Avoid_: trial, free tier, período de teste.

**Plano Disparos** (`broadcast`):
R$ 69/mês. **1 número** de WhatsApp. **Tudo menos IA**: responder pela
Dashboard, disparos para contatos e para grupos, Contatos, Pipeline manual,
Tags, respostas rápidas e Analytics. O que depende de IA **some da tela** —
não aparece bloqueado, simplesmente não está lá (decisão do fundador,
2026-09-18).
_Avoid_: plano básico, plano sem IA.

**Plano Pro** (`pro`):
R$ 119/mês. **1 número** de WhatsApp. Uso completo do produto, IA incluída.
_Avoid_: plano básico, starter.

**Plano Enterprise** (`enterprise`):
R$ 249/mês. **Até 5 números** de WhatsApp. Uso completo.
_Avoid_: plano premium, business.

**Trava de plano** (paywall):
A regra que diz o que cada plano pode usar. São dois **recursos**:
- **operação** (`operation`) — responder pela Dashboard, disparos, Contatos,
  Pipeline manual, Tags, respostas rápidas, Analytics. Disparos, Pro e
  Enterprise têm.
- **IA** (`ai`) — tudo que chama o provedor de IA: resposta automática,
  classificação do Pipeline, resumo de conversa, resumo do negócio, geração
  de mensagens de prospecção. Só Pro e Enterprise têm. É o único custo
  variável do produto, e por isso é o que separa o Disparos do Pro.

Além dos recursos, cada plano tem um **limite de números**: 1 no Grátis,
Disparos e Pro; 5 no Enterprise. Um número **ocupa vaga** quando está
conectado ou tem credenciais guardadas (poderia voltar sozinho); conectar um
número novo além do limite é recusado. A trava de verdade é sempre a API —
o painel só esconde.
_Avoid_: gate, feature flag, restrição.

**Origem do plano** (`Tenant.planSource`):
Quem manda no plano do tenant. `manual` — ativado pelo fundador (script ou
`/admin`); a cobrança automática **nunca** mexe nele. `self_service` — o
próprio cliente assina (ou está no Grátis, podendo assinar). Plano pago
ativado à mão vira `manual`; voltar ao Grátis devolve o tenant ao
`self_service`.
_Avoid_: tipo de conta, canal de venda.

**Assinatura** (`Subscription`, no Stripe):
O pagamento mensal, no cartão, de um plano pago de origem `self_service`. Uma
por tenant. O dono assina na aba **Plano** (Configurações), paga numa página
do Stripe, e troca de plano, atualiza o cartão ou cancela no portal do
Stripe. O plano do tenant segue o estado da assinatura — lido do Stripe a
cada aviso —, nunca o contrário. Implementada na etapa 2 do B5 (2026-09-18);
só vale em produção quando as chaves do Stripe estiverem configuradas.
_Avoid_: mensalidade, plano (ver acima).

**Teste grátis de 1 dia**:
Na primeira assinatura, o cliente usa o plano escolhido por 1 dia sem pagar.
O cartão é cadastrado na hora e a primeira cobrança acontece no dia seguinte,
se ele não cancelar. Um por conta (`Tenant.trialUsedAt`), mesmo que cancele
e volte.
_Avoid_: trial de 7/14/30 dias. Não confundir com o **Plano Grátis**, que é
permanente e não pede cartão.

**Billing manual**:
Ativar um plano pago à mão: o cliente chama o fundador no WhatsApp, o
fundador ativa o plano (script ou `/admin`) e o pagamento é combinado por
fora (Pix). Com a **Assinatura** no ar, passa a valer só para os planos de
origem `manual` (cortesia, contrato, Pix) — e o `/admin` recusa trocar o
plano de quem paga pelo Stripe. Spec:
`docs/superpowers/specs/2026-09-18-cobranca-stripe-design.md`.
_Avoid_: checkout (checkout é a página de pagamento do Stripe).

## Fase de testes controlados (decidido em 2026-09-05)

> **Substituído pelo B5 (2026-09-18)** — cobrança automática pelo Stripe, com
> teste de 1 dia só com cartão cadastrado e 3 dias de tolerância antes de
> voltar ao Grátis (ver a spec citada em _Billing manual_). Os três termos
> abaixo valem até a etapa 2 do B5 entrar no ar.

**Ativação manual**:
O fundador ativa e desativa o plano de cada tenant PESSOALMENTE, no banco.
Não há gateway de pagamento e **não haverá por ora** — o pagamento é
combinado no WhatsApp e pago por Pix. Decisão consciente, não pendência:
o produto está em fase de testes com pessoas de confiança, escolhidas pelo
fundador, e automatizar cobrança antes de saber se o produto se sustenta
resolveria um problema que ainda não existe.
_Avoid_: self-service, checkout, assinatura automática.

**Período de teste grátis**: **zero**. Não existe trial com prazo — o Plano
Grátis (demonstração permanente) já cumpre o papel de deixar a pessoa
conhecer o produto.
_Avoid_: trial de 7/14/30 dias.

**Tolerância de atraso**: **zero**. Sem cobrança automática não há
inadimplência a tolerar: se o pagamento não vem, o fundador desativa o plano
à mão.
_Avoid_: grace period, período de carência.

**Painel de controle do fundador** — o **`/admin`** (necessidade registrada em
2026-09-05; entregue nas Fases 1–6 e em produção desde 2026-09-09):
A tela em que o fundador acompanha, por tenant, se o cliente está tirando bom
ou mau proveito do produto — indicadores e sinais de atenção por cliente,
saúde da plataforma, alterar plano, suspender/reativar e suporte assistido
(acesso à conta do cliente só com o aceite dele, por 2h). Login próprio,
separado do login dos clientes. Detalhe em `ADMIN_PLATFORM_MASTER_PLAN.md` e
`CLAUDE.md` §18. Foi a peça que substituiu o "self-signup com billing" no lugar
de prioridade — ver issue #16.
_Avoid_: super-admin, back-office (o fundador observa e controla o plano; não
edita dados do cliente por fora — mexer na conta de alguém exige o suporte
assistido, com consentimento).

## Lançamento

**Lançamento suave** (soft launch):
A forma como o Francis vai ao ar pela primeira vez: a **landing page e o
cadastro (`/register`) são públicos e abertos** a qualquer um, mas o uso
real fica atrás do plano pago (ver Trava de plano). Não é um "beta fechado"
(o fundador não escolhe quem entra) nem um "lançamento comercial completo"
(não há billing automático nem LGPD completo; o console de admin — `/admin` —
passou a existir em 2026-09-09).
_Avoid_: beta fechado, GA, lançamento oficial.
