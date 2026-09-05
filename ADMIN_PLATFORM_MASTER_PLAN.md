# Francis — Platform Control Center (`/admin`)

> **Plano mestre consolidado.** Versão 2, de 2026-09-05.
>
> Consolida e amplia a spec de desenho
> `docs/superpowers/specs/2026-09-05-painel-admin-design.md`, que continua
> valendo como registro histórico das decisões e de quem as tomou. **Nenhuma
> decisão daquele documento foi revogada aqui** — este plano só amplia.
>
> Vocabulário: `CONTEXT.md`. Histórico do projeto: `CLAUDE.md` §18,
> `DECISIONS.md`.

---

## 1. Visão

O `/admin` é o painel privado do dono da plataforma Francis. Não é
funcionalidade de produto: não aparece para quem contrata, não é vendido, e
não tem versão para cliente.

Ele existe para o fundador conseguir, em minutos e sem consultar o banco à mão:

**OBSERVAR → ENTENDER → DIAGNOSTICAR → SUPERVISIONAR → AGIR**

sobre a plataforma inteira — sempre com trilha de auditoria e limites de
segurança.

### As perguntas que ele deve responder

Este é o critério de sucesso do produto, não uma lista de funcionalidades.
A coluna "fase" diz quando cada resposta passa a existir.

| Pergunta | Fase |
|---|---|
| Quantos clientes eu tenho? | 3 |
| Quem está saudável? | 2 |
| Quem está com problema? | 2 |
| Quem está abandonando? | 2 |
| Quanto cada tenant está consumindo? | 2 |
| Quanto a IA está me custando no total? | 3 |
| Qual WhatsApp caiu? | 3 |
| Qual campanha está rodando? | 3 |
| Qual cliente precisa de suporte? | 3 |
| Quem está usando muito o sistema? | 2 |
| Quem está gerando prejuízo? | ⚠️ bloqueado — ver §10 |
| Quem está usando quais recursos? | 2 |
| **E o que eu preciso fazer agora?** | 3 |

---

## 2. Princípios

1. **A plataforma não é um tenant grande.** `/admin` e o dashboard do cliente
   são dois mundos: identidades, cookies, porteiros e rotas separados. Nunca
   se resolve um problema do `/admin` afrouxando algo do tenant.
2. **Ver números nunca exige consentimento; ver conteúdo sempre exige.**
   Agregado é do fundador; conversa é de terceiros.
3. **Toda ação da plataforma é auditada, sem exceção.** Se não está no
   `PlatformAuditLog`, não deveria ter acontecido.
4. **Não inventar métrica.** Indicador sem fonte real no banco não entra —
   nem "por enquanto", nem "estimado".
5. **O painel não pode virar o componente mais caro do sistema.** Consulta
   agregando todos os tenants de uma vez, nunca uma por tenant.
6. **Fricção proporcional ao estrago.** Ler é livre; escrever é confirmado;
   destruir é confirmado por escrito.

---

## 3. Arquitetura

*(Seções 3.1–3.4 vêm da spec de desenho, aprovadas e inalteradas.)*

### 3.1 Identidade separada

`PlatformUser`: `id`, `email` (único), `passwordHash`, `name`, `status`,
`lastLoginAt`, `createdAt`. **Sem `tenantId`.**

Hoje todo `User` pertence obrigatoriamente a um tenant e os cinco cargos são
escopados a um tenant — não existe ninguém "acima". A segurança do produto se
apoia em "toda consulta filtra por `tenantId`"; um admin que atravessa tenants
é a exceção a essa regra, e exceção não pode morar na mesma tabela que a
regra.

Reaproveita sem reescrever: cifrador de senha (scrypt), cifrador de cookie, e
a trava de conta + rate limit do Bloco B1.

### 3.2 Dois porteiros que nunca se cruzam

| | Tenant | Plataforma |
|---|---|---|
| Cookie | `wa_dashboard_session` | `wa_admin_session` |
| Porteiro (BFF) | `requireSession` | `requirePlatformSession` |
| Rotas da API | `/api/tenants/:tenantId/...` | `/api/platform/...` |

O formato da URL é parte da garantia: toda rota do produto carrega `:tenantId`
no caminho; as de plataforma são estruturalmente diferentes.

### 3.3 Um único lugar que atravessa tenants

Todo código novo em **`services/platform`**. Assim "que código pode atravessar
tenants?" tem resposta verificável com `grep`. Consulta sem `tenantId` fora
desse diretório é bug.

### 3.4 Como o admin opera o tenant no suporte

Ao aceitar, o BFF emite para o admin uma **sessão normal daquele tenant**,
carregando `supportAccessId` no payload cifrado. O admin usa o produto real,
nas telas reais — não há clone do dashboard dentro do `/admin`.

### 3.5 Estrutura de navegação (NOVO)

Cinco itens. Custo **não** vira seção enquanto for só custo: é coluna em
Tenants e bloco no Início. Vira seção quando margem existir (§10).

```
/admin
├── Início      KPIs da plataforma + Fila de ação
├── Tenants     lista · detalhe · plano · suspender · pedir acesso
├── Suporte     pendentes · ativos · expirados · histórico
├── Saúde       Postgres · Redis · 3 filas · falhas de IA · WhatsApps caídos
└── Auditoria   PlatformAuditLog
```

---

## 4. Segurança

O `/admin` é a superfície mais sensível do sistema: uma falha ali vaza dado
entre clientes.

| Controle | Como |
|---|---|
| Força bruta | Trava de conta do Bloco B1 (5 falhas / 15 min → 423), desde o primeiro dia |
| Rate limit | `RateLimitStore` do B1, escopo `platform-login:ip` e `platform-login:identity` |
| Sessão | Curta (8h) e renovável; expiração verificada **no servidor** a cada requisição |
| Logout / revogação | Encerra a sessão de plataforma e qualquer sessão de suporte ativa dela |
| Cookie | `wa_admin_session`, `HttpOnly`, `SameSite=Lax`, `Secure` em produção |
| CSRF | Mesmo token sincronizado do B1, cookie legível próprio |
| Autorização | Sempre no servidor; a UI esconder um botão nunca é o controle |
| IDOR | Toda rota `/api/platform/...` recebe o alvo por id e valida existência; não há "tenant do path" para confundir |
| Cross-tenant | Confinado a `services/platform`; verificável por `grep` |
| Auditoria | `PlatformAuditLog` em toda ação (§11) |

**Aceito e registrado:** `/admin` fica publicamente alcançável no mesmo
domínio do produto. Mitigação é a trava do B1 + senha forte (responsabilidade
operacional do fundador). Restringir por IP não é viável — o fundador acessa
de onde estiver.

---

## 5. Início — visão global da plataforma (NOVO)

### 5.1 Fila de ação — o bloco mais importante

Responde *"e o que eu preciso fazer agora?"*. É uma lista curta, ordenada por
urgência, com link direto para resolver:

| Item | Origem |
|---|---|
| Pedidos de suporte aguardando resposta | `TenantAccessRequest` pendentes |
| WhatsApps que CAÍRAM | sessão registrada, nenhuma `connected` (ver §6.3.1 — diferente de "nunca conectou") |
| Clientes que nunca começaram | nenhuma sessão registrada |
| Tenants em atenção | sinais 🔴 (§6.3) |
| Campanhas pausadas por disjuntor | `campaigns.status = PAUSED` com `pausedReason` |

As duas primeiras linhas são itens **distintos de propósito**: "caiu" pede
investigação, "nunca começou" pede acompanhamento comercial. Juntá-las numa
só faria o fundador tratar seis clientes que precisam de ajuda para começar
como se fossem seis incidentes técnicos.

Vazia é sucesso: significa que nada precisa de você.

### 5.2 Indicadores globais

**Nenhuma métrica inventada.** Cada uma com fonte, custo e se já existe.

| Métrica | Fonte | Existe hoje? | Custo | Atualização |
|---|---|---|---|---|
| Tenants (total / por plano) | `tenants` (21 linhas) | ✅ | trivial | ao carregar |
| Tenants ativos / inativos / em atenção | derivado dos sinais (§6.3) | ✅ | 1 consulta agregada | ao carregar |
| Usuários | `users`, `users_tenant_id_idx` | ✅ | trivial | ao carregar |
| WhatsApps conectados / desconectados | `whatsapp_sessions.status` | ✅ ⚠️ | trivial | ao carregar |
| Mensagens (30 dias, por direção) | `whatsapp_messages`, índice `(tenant_id, occurred_at)` | ✅ | 1 agregação indexada | ao carregar |
| Interações de IA e taxa de falha | `ai_interactions.status` | ✅ | 1 agregação indexada | ao carregar |
| Custo de IA (USD, 30 dias) | `sum(ai_interactions.cost_usd)` | ✅ | 1 agregação indexada | ao carregar |
| Campanhas em andamento | `campaigns.status`, índice `(tenant_id, session_name, status)` | ✅ | trivial | ao carregar |
| Profundidade das filas | Redis via BullMQ | ✅ parcial ⚠️ | 3 chamadas Redis | 30s |
| Postgres / Redis saudáveis | `/health/ready` | ✅ | trivial | 30s |

⚠️ **Duas ressalvas medidas, não supostas:**

- **`whatsapp_sessions.status` pode estar velho.** O banco só é atualizado
  enquanto existe instância viva da sessão em memória; reinícios deixam o
  valor congelado (registrado no `CLAUDE.md`, ADR #80). O painel deve usar a
  mesma correção que `listSessions` já usa: sobrepor com o estado ao vivo do
  registry via `peek()` quando houver instância, e marcar como "última
  informação conhecida" quando não houver.
- **`/health/ready` hoje só olha a fila `ai-reply`.** Existem três
  (`ai-reply`, `whatsapp-outbound`, `campaign-send`). Ampliar é trivial e
  entra na Fase 3.

**Não existe no banco:** um registro de erros da aplicação — erros vão para o
log em stdout. O único sinal de erro persistido é
`ai_interactions.status = PROVIDER_ERROR`, e ele é forte: **na base atual são
169 de 462 interações (37%)**. É esse que o painel usa. Criar tabela de erros
é fora de escopo (§13).

### 5.3 Forma de apresentação

Decidida pela skill `dataviz` (heurística de forma), não por gosto:

| Dado | Forma | Por quê |
|---|---|---|
| Total de clientes | **número herói** (≥48px) | é a manchete do painel |
| Contagens da plataforma | **linha de stat tiles** | poucos números de manchete — nunca gráfico de uma barra |
| Fila de ação | **lista** com ícone + rótulo + link | é trabalho, não medição |
| Lista de tenants | **tabela** | mais de 7 classes que carregam significado |
| Profundidade de fila | **medidor** contra o teto | razão única contra um limite |
| Custo de IA no tempo | **linha** — só na Fase 6 | tendência exige história acumulada |

**Regra inegociável:** os sinais 🔴🟠🟢 são cores de estado e **nunca aparecem
sozinhos** — sempre com ícone e rótulo ("Desconectado", "Sumiu"). Cor sozinha
não é informação para quem não a distingue.

---

## 6. Centro de Tenants

### 6.1 Lista

Uma linha por tenant, para varrer e achar problema. Colunas: nome · plano ·
status · sinais · última atividade · mensagens (30d) · custo IA (30d) ·
WhatsApps conectados/total · usuários.

### 6.2 Detalhe

Todos os indicadores abertos, mais: campanhas do tenant, contatos, se o
Cérebro da IA tem conteúdo, histórico de quedas de sessão, últimos acessos de
suporte.

### 6.3 Sinais de atenção

Funções puras sobre dado já buscado. Valores iniciais **explícitos** — ponto de
partida declarado, calibrável com uso real, mesmo caminho do rate limit de IA
(Bloco F1.10).

| Sinal | Condição inicial | Leitura |
|---|---|---|
| 🔴 Desconectado | tem sessão REGISTRADA e nenhuma com status `connected` | **tinha** conexão e caiu — está sem funcionar e talvez nem saiba |
| 🔴 Sumiu | tem atividade registrada e a última foi há > 7 dias | usou e abandonou |
| 🟠 Nunca começou | **nenhuma sessão registrada**, ou sessão conectada com < 20 mensagens | não passou da instalação |
| 🟠 IA travando | escalonamento > 30% no período | a IA não dá conta, ou o Cérebro está vazio |
| 🟠 IA falhando | `PROVIDER_ERROR` > 20% das interações | cota estourada ou provider instável |
| 🟠 Custo alto | custo de IA no período > 20% do preço do plano | come a margem daquele plano |
| 🟢 Saudável | nenhum dos acima | |

**Precedência:** vale o mais grave (🔴 antes de 🟠); entre vermelhos,
`Desconectado` antes de `Sumiu` — quem está desconectado provavelmente sumiu
*por causa* disso.

### 6.3.1 Correção de 2026-09-05 — "nunca conectou" ≠ "caiu"

A primeira redação definia `Desconectado` como "nenhuma sessão com status
`connected`" e `Nunca começou` como "tem sessão conectada e poucas mensagens".
Ao preencher o mockup com os dados reais do banco, as duas se mostraram
erradas nos dois extremos:

- Os **seis tenants que nunca conectaram um WhatsApp** cairiam em
  `Desconectado` 🔴 — e "desconectado" sugere que algo quebrou, quando na
  verdade nunca chegou a existir conexão. A ação certa para esse cliente é
  *ajudar a começar*, não *investigar a queda*.
- E `Nunca começou`, exigindo sessão conectada, **nunca alcançaria** esses
  seis — o sinal que existe justamente para descrevê-los.

A distinção correta é sobre HISTÓRIA, não sobre estado atual: existe sessão
registrada? Então houve conexão um dia, e a ausência dela agora é uma queda.
Não existe? Então o cliente nunca saiu da largada.

`Sumiu` ganhou a mesma guarda: um tenant sem nenhuma atividade registrada não
"sumiu" — ele nunca apareceu, e já é coberto por `Nunca começou`.

**Lição de processo, registrada de propósito:** o erro não apareceu na
revisão do texto — apareceu no primeiro contato com dado real. É o mesmo
padrão que este projeto já pagou caro três vezes (ADR #88, o caso do balão
único, o caso das fotos de perfil): regra escrita parece certa até encontrar
os dados. Vale para o resto deste plano — **todo limiar do §6.3 deve ser
conferido contra a base real antes de virar código**, não depois.

### 6.4 Fontes por indicador

| Indicador | Fonte | Existe? |
|---|---|---|
| Taxa de escalonamento | `whatsapp_conversations.escalated_at` / total do período | ✅ |
| Última atividade | `max(last_message_at)` | ✅ |
| Mensagens por direção | `whatsapp_messages` | ✅ |
| Custo de IA | `sum(ai_interactions.cost_usd)` — decimal exato, nunca `Number()` (D46) | ✅ |
| Falhas de IA | `ai_interactions.status` | ✅ |
| Saúde da conexão | `whatsapp_sessions.status` + quedas em `whatsapp_session_events` | ✅ |
| Campanhas | `campaigns.status` | ✅ |
| Contatos | `whatsapp_contacts` | ✅ |
| Cérebro preenchido | `ai_business_profiles.content` não vazio | ✅ |
| Usuários | `users` | ✅ |

---

## 7. Busca global (NOVO)

Um campo, resultados agrupados por tipo. Pesquisa por: nome de tenant, id de
tenant, e-mail de usuário, telefone de contato, nome de sessão, nome de
campanha, e id de qualquer uma dessas entidades.

**Regra de privacidade:** a busca devolve **a entidade e o caminho até ela**,
nunca conteúdo de conversa. Achar um telefone mostra "existe no tenant X" —
ler a conversa continua exigindo aceite (§9).

Implementação: consultas com `ILIKE` sobre colunas já indexadas, teto de
resultados por tipo. Sem motor de busca novo.

---

## 8. Controle do tenant

| Ação | Efeito | Fricção | Auditada |
|---|---|---|---|
| Alterar plano | `Tenant.plan` | confirmação simples | ✅ |
| Suspender | `Tenant.status = suspended` | confirmação forte | ✅ |
| Reativar | `Tenant.status = active` | confirmação simples | ✅ |
| Solicitar acesso assistido | cria `TenantAccessRequest` | exige motivo escrito | ✅ |
| Excluir tenant | script existente `deleteTenant` | **fora do painel** (§12) | ✅ |

### ⚠️ Decisão pendente — suspensão

**`Tenant` não tem coluna `status` hoje. Só `plan`.**

Rebaixar para `free` **não é** suspender: no Plano Grátis o cliente continua
entrando e vendo as mensagens chegarem (é uma demonstração permanente, ver
`CONTEXT.md`). Suspensão precisa ser estado próprio, que bloqueia o login do
tenant inteiro.

**Recomendação:** coluna nova `Tenant.status` (`active` / `suspended`),
migration aditiva com default `active`. `plan` responde "o que ele pode
fazer"; `status` responde "ele pode entrar". São perguntas diferentes e não
devem dividir um campo.

**✅ CONFIRMADO pelo fundador em 2026-09-05:** suspensão é coluna própria
`Tenant.status`. A migration entra na **Fase 4**, junto com o primeiro código
que a lê — coluna sem leitor é o "código sem uso" que as auditorias deste
projeto já sinalizaram.

---

## 9. Suporte assistido

*(Ciclo, tabela e regras vêm da spec de desenho, aprovados e inalterados.)*

### 9.1 Ciclo

1. **Pedido** — o fundador escolhe o tenant e escreve o **motivo**. O motivo é
   o que o cliente lê antes de decidir e o que fica gravado.
2. **O cliente vê** — aviso no topo do painel dele, com quem pediu, motivo,
   o que permite e o prazo. **Autorizar** / **Recusar**. Só **dono ou
   administrador** respondem. Deslogado: o pedido espera.
3. **Autorizado** — sessão marcada, válida por **2 horas**.
4. **Durante** — aviso **fixo e não fechável** no painel do cliente, com botão
   **Encerrar**.
5. **Fim** — por encerramento, expiração, ou saída do admin.

### 9.2 Tabela

`TenantAccessRequest`: `id`, `tenantId`, `platformUserId`, `reason`, `status`
(`pending`/`accepted`/`denied`/`expired`/`revoked`/`ended`), `requestedAt`,
`respondedAt`, `respondedByUserId`, `expiresAt`. Mantido para sempre — recusas
também são informação.

### 9.3 Regras invioláveis

1. Nenhum acesso sem pedido **aceito e dentro do prazo** — verificado no
   servidor a cada requisição, nunca só pela validade do cookie
2. O cliente revoga a qualquer instante, sem passar pelo fundador
3. Expirou, morreu — renovar exige novo pedido e novo aceite
4. O aviso durante o acesso **não é fechável**

### 9.4 Revisão de brechas (NOVO)

Reavaliei a decisão #5 (admin faz tudo no tenant) procurando furos além das
quatro regras. Encontrei três, com as respectivas defesas:

| Brecha | Defesa |
|---|---|
| **Sessão sobrevive à revogação** — o cookie continua válido depois do cliente encerrar | A regra 1 já cobre: a validade é checada no servidor a cada requisição, contra `TenantAccessRequest.status`. O cookie sozinho nunca autoriza |
| **Ação enfileirada extrapola o prazo** — admin dispara campanha às 15h59, ela envia por horas | A campanha continua (é do tenant), mas fica marcada com o `supportAccessId` que a criou. O rastro sobrevive ao fim do acesso |
| **O cliente não percebe o aviso** — não estava com a aba aberta | O `PlatformAuditLog` e o histórico de acessos ficam visíveis **para ele**, na tela de Auditoria dele. Ele descobre depois, mesmo sem ter visto na hora |

### 9.5 Visão administrativa (NOVO)

Seção **Suporte**: pedidos pendentes (com quanto tempo esperando), acessos
ativos agora (com tempo restante), expirados e recusados, e histórico completo
— quem pediu, motivo, quem respondeu, duração real.

---

## 10. Uso e custo

### 10.1 O que é confiável hoje

| Métrica | Confiável? |
|---|---|
| Interações de IA (contagem, por status) | ✅ |
| Tokens de entrada e saída | ✅ |
| Custo em **USD** | ✅ — `Decimal(12,8)`, exato |
| Mensagens trocadas | ✅ |
| Sessões e quedas | ✅ |
| Campanhas e destinatários | ✅ |

### 10.2 ⚠️ Margem NÃO é calculável — e não será fingida

Faltam três coisas:

1. **Preço não está no sistema.** R$ 99 e R$ 349 vivem no `CONTEXT.md` como
   texto. O banco só tem o enum `plan`.
2. **Moeda diferente.** Custo em USD, preço em BRL, sem taxa de câmbio.
3. **Custo incompleto.** Só a IA é medida. Infraestrutura (Oracle, Postgres,
   Redis) não é rateada por tenant, e nem faz sentido ratear no volume atual.

**Decisão:** o painel mostra **custo de IA em USD** e chama de custo. O sinal
"custo alto" compara com o preço do plano usando uma tabela de preços em
**constante de Domain** — declarada em código, não adivinhada, e claramente
identificada como aproximação.

Margem vira seção própria quando (1) preços forem dado do sistema e (2) houver
taxa de câmbio. Até lá, dizer "margem" seria inventar.

---

## 11. Auditoria — duas trilhas distintas

| | Auditoria do **tenant** | Auditoria da **plataforma** |
|---|---|---|
| Tabela | `AuditLog` (existe) | `PlatformAuditLog` (nova) |
| Ator | `User` daquele tenant | `PlatformUser` |
| Registra | o que acontece **dentro** de um tenant | o que o fundador faz **sobre** os tenants |
| Quem lê | dono/administrador/gerente do tenant | só o `/admin` |
| Exemplos | login, envio de mensagem, mudança de plano da IA | alterou plano, suspendeu, pediu acesso, iniciou/encerrou suporte |

**Por que duas e não uma:** o ator é de tipo diferente (`PlatformUser` não é
`User`), o público é diferente, e o ciclo de vida é diferente — a trilha da
plataforma precisa sobreviver à exclusão do tenant que ela auditou. Enfiar as
duas numa tabela obrigaria `actorUserId` a apontar para dois tipos.

**Ponte entre elas:** ações feitas *dentro* do tenant durante suporte
continuam no `AuditLog` do tenant (é lá que o cliente as vê), carregando
`supportAccessId` em `metadata` — campo que existe para detalhe livre e não
pede migration numa tabela append-only crítica. Os eventos
`support.access_granted` / `support.access_ended` delimitam a janela.

---

## 12. Ações críticas

Fricção proporcional ao estrago:

| Nível | Ações | Confirmação |
|---|---|---|
| **Simples** | alterar plano, reativar | diálogo "confirmar" |
| **Forte** | suspender tenant, revogar acesso de suporte, encerrar sessões | diálogo que **nomeia a consequência** e exige clique deliberado |
| **Por escrito** | excluir tenant | digitar o **nome do tenant** para liberar o botão |
| **Fora do painel** | exclusão definitiva de dados (LGPD) | script `deleteTenant` existente |

Exclusão de tenant **não entra no painel na Fase 4**. É irreversível, apaga
conversas de terceiros, e já tem caminho auditado por script. Se um dia
entrar, é com confirmação por escrito.

Toda ação crítica: auditada antes de executar, com resultado registrado.

---

## 13. UX

### 13.1 A cara da ferramenta

O `/admin` usa o **mesmo Design System do produto** — tokens, primitivos e
tipografia já existentes. Não é um app à parte visualmente.

| Token | Valor | Uso no `/admin` |
|---|---|---|
| `--primary` | `#0E6E52` | ações primárias, número herói |
| `--success` | `#16A34A` | sinal 🟢 saudável |
| `--warning` | `#C4790C` | sinal 🟠 atenção |
| `--destructive` | `#D0342C` | sinal 🔴 crítico, ações destrutivas |
| `--card` / `--panel` / `--background` | superfícies | stat tiles e tabelas |

**Uma diferença deliberada:** o `/admin` ganha um marcador visual permanente
(faixa ou selo) que o distingue do dashboard de cliente. Quem opera os dois
precisa saber, sem pensar, em qual está.

### 13.2 Regras de visualização

Da skill `dataviz`:

- Stat tiles e número herói para manchete; **nunca** gráfico de uma barra só
- Tabela quando houver mais de ~7 classes com significado
- Status sempre com **ícone + rótulo**, nunca cor sozinha
- Nenhum gráfico de eixo duplo, jamais
- Modo escuro é escolhido, não invertido automaticamente
- Cor entra por último, depois da forma

### 13.3 Acessibilidade

Contraste AA (`PRODUCT_PRINCIPLES.md` §7), navegação por teclado em toda
tabela e ação, foco visível, e o contrato de estados (carregando / vazio /
erro / conteúdo) que o produto já usa.

### 13.4 Skills a aplicar na implementação

| Skill | Quando | Por quê |
|---|---|---|
| `dataviz` | já aplicada no desenho | forma dos indicadores |
| `/design` | antes de codar a UI | canvas visual para o fundador aprovar |
| `web-design-guidelines` | ao fim de cada fase com UI | audita **código** — não se aplica antes de existir |
| `security-review` | ao fim das Fases 1, 4 e 5 | audita **código** — as fases que criam fronteira e escrita |

---

## 14. Escalabilidade

**Medido em 2026-09-05, não estimado:** 21 tenants · 1.518 mensagens · 462
interações de IA · 105 conversas.

Todas as tabelas relevantes já têm índice por `(tenant_id, …)`.

| Escala | Situação | Ação |
|---|---|---|
| 10–50 tenants | agregação ao vivo é instantânea | nenhuma |
| 100 tenants | idem | nenhuma |
| 1.000 tenants | as agregações continuam indexadas; o painel faz ~8 consultas fixas | paginar a lista de tenants |

**O gargalo real não é o número de tenants — é o volume de mensagens.** Um
único cliente movimentado gera mais linhas em `whatsapp_messages` que 500
clientes parados. A janela de 30 dias com índice `(tenant_id, occurred_at)`
mantém a varredura limitada.

**Gatilho para tabela de rollup:** quando a agregação de 30 dias passar de ~2
milhões de linhas ou a Home levar mais de 1 segundo. **Medir antes de
construir** — snapshot diário sem necessidade é complexidade e uma fonte de
verdade a mais para manter em sincronia.

Regras permanentes: uma consulta por indicador com `GROUP BY tenant_id`
(nunca uma por tenant); lista paginada; nada de `SELECT *` em tabela de
mensagens.

---

## 15. Fases

Ordem: **segurança → observabilidade → controle → suporte → UX**.

### Fase 1 — Fundação de segurança ✅ CONCLUÍDA (2026-09-05)

**Estado:** entregue e validada ponta a ponta na máquina do fundador —
login pelo navegador em `/admin`, casca vazia, logout, e as três entradas
(`platform.login`, `platform.login_failed`, `platform.logout`) conferidas no
Postgres real. Ver `CLAUDE.md` §18 para o registro completo das decisões.

**Objetivo:** existir a fronteira, antes de qualquer dado atravessá-la.
**Entrega:** `PlatformUser`, login `/admin`, cookie e `requirePlatformSession`,
`/api/platform`, bounded context `services/platform`, `PlatformAuditLog`,
script de criação do primeiro admin.
**Depende de:** nada.
**Risco:** 🔴 alto — é a fronteira; um erro aqui compromete todo o resto.
**Testes:** cookie de tenant não abre rota de plataforma e vice-versa; trava de
conta funciona; toda ação já nasce auditada; `grep` prova que nenhuma consulta
sem `tenantId` existe fora de `services/platform`.
**Concluída quando:** dá para logar no `/admin`, ver uma casca vazia, e o
login está registrado no `PlatformAuditLog`.

### Fase 2 — Observabilidade: tenants

**Objetivo:** a dor original — decidir sobre um cliente com informação.
**Entrega:** lista, detalhe, indicadores (§6.4), sinais (§6.3).
**Depende de:** Fase 1.
**Risco:** 🟢 baixo — só leitura, sem migration.
**Testes:** cada indicador contra dado real conhecido; precedência dos sinais;
uma consulta por indicador (não N).
**Concluída quando:** responde 6 das 13 perguntas do §1.

### Fase 3 — Observabilidade: plataforma

**Objetivo:** *"o que eu preciso fazer agora?"*.
**Entrega:** Início com KPIs globais e Fila de ação; Saúde (3 filas, Postgres,
Redis, falhas de IA, WhatsApps caídos); campanhas em andamento.
**Depende de:** Fase 2.
**Risco:** 🟢 baixo — só leitura. Requer ampliar `/health/ready` para as três
filas.
**Testes:** Fila de ação vazia quando nada precisa de atenção; status de sessão
sobreposto pelo registry ao vivo (ADR #80).
**Concluída quando:** responde 10 das 13 perguntas.

### Fase 4 — Controle

**Objetivo:** agir sobre o tenant.
**Entrega:** alterar plano, suspender/reativar (migration `Tenant.status`),
ações críticas com confirmação proporcional.
**Depende de:** Fase 2 + **decisão do §8 confirmada**.
**Risco:** 🟠 médio — primeira escrita cross-tenant.
**Testes:** suspenso não consegue logar; toda ação auditada antes de executar;
confirmação forte não é contornável por chamada direta à API.
**Concluída quando:** o fundador ativa e desativa cliente sem tocar no banco.

### Fase 5 — Suporte assistido

**Objetivo:** resolver problema dentro da conta, com consentimento.
**Entrega:** `TenantAccessRequest`, aviso de pedido, aceite, sessão marcada,
aviso fixo, revogação, expiração, seção Suporte (§9.5).
**Depende de:** Fases 1 e 4.
**Risco:** 🔴 alto — consentimento, privacidade de terceiros, acesso total.
**Testes:** as quatro regras invioláveis, cada uma com teste próprio; as três
brechas do §9.4; ação durante suporte carrega `supportAccessId` no
`AuditLog` do tenant.
**Concluída quando:** um acesso completo acontece — pedido, aceite, operação,
revogação — e o histórico conta a história inteira.

### Fase 6 — Busca e refino

**Objetivo:** achar qualquer coisa sem navegar.
**Entrega:** busca global (§7), polimento visual, acessibilidade, modo escuro.
**Depende de:** Fases 2, 3 e 5.
**Risco:** 🟢 baixo.
**Testes:** busca nunca devolve conteúdo de conversa; teto de resultados.
**Concluída quando:** o fundador acha um tenant por telefone de contato em um
campo só.

---

## 16. Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| Vazamento entre tenants por bug no painel | 🔴 crítica | Código cross-tenant num único bounded context; rotas de formato distinto; `security-review` nas Fases 1, 4, 5 |
| Acesso total no suporte (decisão #5) | 🔴 alta | Quatro regras invioláveis + as três defesas do §9.4. Produzem rastro; não eliminam o risco |
| `/admin` publicamente alcançável | 🟠 média | Trava de conta do B1 desde o dia 1; senha forte é operacional |
| Status de sessão velho no banco | 🟠 média | Sobrepor com o registry ao vivo (ADR #80); marcar como "última informação conhecida" quando não houver instância |
| Painel virar o componente mais caro | 🟠 média | Agregação com `GROUP BY tenant_id`; paginação; gatilho de rollup declarado (§14) |
| Limiares dos sinais errados | 🟢 baixa | Constantes de Domain, calibráveis; valores iniciais declarados |
| Confundir plataforma com tenant ao operar | 🟢 baixa | Marcador visual permanente no `/admin` (§13.1) |

---

## 17. Critérios de aceitação

O `/admin` está pronto quando o fundador consegue, sem abrir o banco:

1. Ver quantos clientes tem, quantos saudáveis e quantos em atenção
2. Identificar em uma tela quem abandonou, quem quebrou e quem custa caro
3. Saber se a plataforma está de pé — banco, Redis, três filas, IA
4. Ver qual WhatsApp caiu e de quem
5. Ver qual campanha está rodando agora
6. Alterar plano e suspender um cliente, com tudo auditado
7. Pedir acesso a um tenant, ser aceito, resolver e sair — com histórico completo
8. Achar qualquer tenant, usuário, telefone ou campanha num campo de busca
9. Abrir a Fila de ação e saber o que fazer em seguida
10. Provar, pela auditoria, tudo que fez sobre qualquer cliente

E duas garantias que valem tanto quanto:

11. Nenhuma conversa de cliente foi lida sem consentimento registrado
12. Nenhuma consulta sem `tenantId` existe fora de `services/platform`

---

## Anexo — o que ficou fora, e por quê

| Item | Motivo |
|---|---|
| **Margem por tenant** | Preço não está no banco, custo em USD, sem câmbio. Inventar seria mentir (§10.2) |
| **Feature flags por tenant** | Nenhum consumidor real hoje. Tabela aditiva — custa o mesmo depois. Preparar agora é o "código sem uso" que as auditorias deste projeto já sinalizaram |
| **Tabelas de rollup** | Medido: agregação ao vivo é trivial no volume atual e projetado. Gatilho declarado no §14 |
| **Monitoramento (Prometheus/Grafana)** | `/health/ready` + consultas cobrem a necessidade |
| **Tabela de erros da aplicação** | Erros vão para stdout; `PROVIDER_ERROR` já dá o sinal que importa |
| **Gestão de admins pela interface** | Script, como `deleteTenant`/`backfillContacts` |
| **Exclusão de tenant pelo painel** | Irreversível e já tem caminho auditado por script (§12) |
| **Self-signup e billing automático** | Descartados por decisão consciente (`CONTEXT.md`, issue #16) |
| **Disparos em grupos de WhatsApp** | Sistema independente — `PRODUCT_BACKLOG.md` §3 |
