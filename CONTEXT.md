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
O nível de acesso de um tenant. Um de `free`, `pro`, `enterprise`. Todo
tenant novo nasce `free`.
_Avoid_: assinatura, tier, licença.

**Plano Grátis** (`free`):
O tenant cria conta, conecta um WhatsApp e **vê as mensagens chegando na
Dashboard, em tempo real — e nada além disso**. A IA não responde; o
operador não responde pela Dashboard (só-leitura); os recursos (Cérebro da
IA, Campanhas, Contatos, Pipeline, Tags, Analytics, respostas rápidas,
resumo de conversa) ficam visíveis mas bloqueados com um aviso de upgrade.
É uma **demonstração** — existe para criar desejo, não para operar.
_Avoid_: trial, free tier, período de teste.

**Plano Pro** (`pro`):
R$ 99/mês. **1 número** de WhatsApp. Uso completo do produto.
_Avoid_: plano básico, starter.

**Plano Enterprise** (`enterprise`):
R$ 349/mês. **Até 5 números** de WhatsApp. Uso completo.
_Avoid_: plano premium, business.

**Trava de plano** (paywall):
A regra que separa o Grátis do pago. No lançamento é **uma só**: a IA
responde automaticamente e o operador responde pela Dashboard **apenas se o
plano do tenant ≠ `free`**. Trava por recurso individual e limites
(interações de IA por mês, disparos por dia) são deliberadamente adiados —
"a definir com uso real".
_Avoid_: gate, feature flag, restrição.

**Billing manual**:
Enquanto não há cobrança automática (gateway de pagamento é fase futura),
ativar o Pro/Enterprise é: o cliente cria a conta Grátis, chama o fundador
no WhatsApp, o fundador marca o `plan` do tenant no banco e o pagamento é
combinado por fora (Pix).
_Avoid_: assinatura self-service, checkout.

## Lançamento

**Lançamento suave** (soft launch):
A forma como o Francis vai ao ar pela primeira vez: a **landing page e o
cadastro (`/register`) são públicos e abertos** a qualquer um, mas o uso
real fica atrás do plano pago (ver Trava de plano). Não é um "beta fechado"
(o fundador não escolhe quem entra) nem um "lançamento comercial completo"
(não há billing automático, nem LGPD completo, nem console de admin).
_Avoid_: beta fechado, GA, lançamento oficial.
