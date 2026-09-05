# Spec — Painel `/admin` e acesso assistido ao tenant

> Desenhada em 2026-09-05, em conversa com o fundador. Vocabulário: ver
> `CONTEXT.md` (Tenant, Plano, Ativação manual, Painel de controle do
> fundador). Substitui o escopo original da issue #16 (self-signup com
> billing), descartado por decisão consciente — ver a mesma issue.

## Problema

O fundador ativa e desativa o plano de cada cliente pessoalmente, no banco
(**Ativação manual**, `CONTEXT.md`). Essa decisão se repete a cada cliente e
hoje é tomada **sem informação nenhuma**: não existe nenhuma tela onde ele
veja se um tenant está tirando bom ou mau proveito do produto.

Some-se a isso o suporte: quando um cliente relata um problema, o fundador não
tem como olhar a conta dele. Ou pede prints, ou consulta o banco à mão.

Nas palavras dele:

> "hoje eu não tenho uma dashboard de controle para cada tenant/conta, onde eu
> consiga acompanhar alguns dos dados mais importantes que façam sentido para
> mim analisar o bom/mal proveito do tenant no app"

> "uma solicitação que eu envio a um cliente/usuário da ferramenta, onde ao ele
> aceitar dará a permissão para eu poder ver e mexer em todo o tenant dele numa
> transmissão onde eu possa resolver problemas"

## Solução

Uma área `/admin`, com login próprio, que faz duas coisas:

1. **Observa** — lista os tenants com indicadores de uso, e sinaliza quais
   merecem atenção.
2. **Pede acesso** — dispara uma solicitação ao cliente; com o aceite dele, o
   fundador opera aquele tenant por tempo limitado, com tudo auditado.

É ferramenta **do dono do app**. Não é funcionalidade de produto, não aparece
para quem contrata, e não é vendida.

## Decisões tomadas

Todas escolhidas pelo fundador durante o desenho. As marcadas com ⚠️ são as em
que a recomendação foi outra.

| # | Decisão | Escolha |
|---|---|---|
| 1 | Escopo | Painel e acesso assistido **na mesma spec** — o suporte começa no painel |
| 2 | Identidade do admin | Tabela `PlatformUser` própria, sem `tenantId` |
| 3 | Onde vive | `/admin` no mesmo app Next.js |
| 4 | Como o cliente aceita | Aviso dentro do painel dele (sem e-mail, sem WhatsApp) |
| 5 | ⚠️ O que o admin pode fazer no tenant | **Tudo** que o dono pode, inclusive enviar mensagem e disparar campanha |
| 6 | O painel mostra conteúdo? | **Não** — só números. Ler conversa exige aceite |
| 7 | Sinais de atenção | Sim |
| 8 | Trocar plano pelo painel | Sim |
| 9 | Prazo do acesso | 2 horas |
| 10 | Quem autoriza | Dono **ou** administrador do tenant |

Sobre a #5: a recomendação foi permitir alterar configuração mas **não** falar
com terceiros (enviar mensagem, disparar campanha), porque essas ações atingem
os clientes do cliente — pessoas que não participaram do acordo — em nome dele
e sem desfazer. O fundador optou por acesso total, ciente disso. É essa escolha
que torna as quatro garantias da seção "Regras invioláveis" não-negociáveis:
sem elas, acesso total seria o dono do app entrando na conta alheia quando
quisesse.

## Arquitetura

### Identidade separada, não um cargo a mais

Hoje **todo** `User` pertence obrigatoriamente a um tenant (`tenantId` é
obrigatório) e os cinco cargos são escopados a um tenant. Não existe ninguém
"acima".

`PlatformUser` é tabela nova: `id`, `email` (único), `passwordHash`, `name`,
`status`, `lastLoginAt`, `createdAt`. Sem `tenantId`.

Por que tabela separada e não um sinalizador em `User`: a segurança do produto
inteiro se apoia numa regra — toda consulta filtra por `tenantId`. Um admin que
atravessa tenants é, por definição, a exceção. Se ele morar em `users`, o
código que viola a regra fica encostado no código que jamais pode violá-la.
Em tabela separada os dois caminhos ficam estruturalmente distintos.

Reaproveita, sem reescrever: o cifrador de senha (scrypt), o cifrador de
cookie, e a trava de conta + rate limit do Bloco B1.

### Dois porteiros que nunca se cruzam

| | Tenant | Plataforma |
|---|---|---|
| Cookie | `wa_dashboard_session` | `wa_admin_session` |
| Porteiro (BFF) | `requireSession` | `requirePlatformSession` |
| Rotas da API | `/api/tenants/:tenantId/...` | `/api/platform/...` |

Um cookie de tenant não abre nada em `/api/platform`, e vice-versa.

O **formato da URL** é parte da garantia: hoje toda rota do produto carrega
`:tenantId` no caminho. As rotas de plataforma são estruturalmente diferentes,
então uma não vira a outra por descuido de roteamento.

### Um único lugar que atravessa tenants

Todo o código novo vive em **`services/platform`** — bounded context próprio,
mesmo padrão de `services/analytics`/`services/contacts`.

É o ponto de segurança mais importante do desenho. Concentrando a violação da
regra num diretório só, "que código pode atravessar tenants?" tem resposta de
uma linha, verificável com `grep`. Consulta sem `tenantId` fora de
`services/platform` é bug.

### Como o admin opera o tenant durante o suporte

Ao aceitar, o BFF emite para o admin uma **sessão normal daquele tenant** — o
mesmo cookie de sempre, carregando `supportAccessId` no payload cifrado.

Consequência: o admin usa **o produto de verdade**, nas telas reais. Não existe
uma cópia do dashboard dentro do `/admin`. E como a marca viaja na sessão, toda
ação chega na auditoria já identificada como suporte, sem instrumentar tela a
tela.

## Painel de observação

### Duas telas

- **Lista** — uma linha por tenant, para varrer e achar problema
- **Detalhe** — um tenant, todos os números abertos

### Indicadores e fontes

Janela padrão: **últimos 30 dias**. Nenhuma migration — todo dado já existe.

| Indicador | Fonte |
|---|---|
| Taxa de escalonamento | `whatsapp_conversations.escalated_at` sobre o total do período |
| Última atividade | `max(whatsapp_conversations.last_message_at)` |
| Mensagens trocadas | `whatsapp_messages`, por direção |
| Custo de IA | `sum(ai_interactions.cost_usd)` — decimal exato, nunca `Number()` (D46) |
| Saúde da conexão | `whatsapp_sessions.status` + quedas em `whatsapp_session_events` |
| Uso dos recursos | contagem de campanhas, contatos, e se `ai_business_profiles.content` tem conteúdo |

Desempenho: **uma consulta por indicador agrupando todos os tenants**
(`GROUP BY tenant_id`), nunca uma consulta por tenant. ~6 consultas no total,
independente do número de clientes.

### Sinais de atenção

Seis números vezes N clientes obriga o fundador a refazer a análise toda vez.
Os sinais fazem a varredura por ele. São funções puras sobre dado já buscado.

| Sinal | Condição (valor inicial) | Leitura |
|---|---|---|
| 🔴 Sumiu | última atividade > **7 dias** | cadastrou e abandonou |
| 🟠 Nunca começou | tem sessão conectada e **< 20 mensagens** desde o cadastro | não passou da instalação |
| 🟠 IA travando | escalonamento **> 30%** no período | a IA não dá conta, ou o Cérebro está vazio |
| 🔴 Desconectado | nenhuma sessão com status `connected` agora | está sem funcionar e talvez nem saiba |
| 🟠 Custo alto | custo de IA no período **> 20%** do preço do plano | come a margem daquele plano |
| 🟢 Saudável | nenhum dos acima | |

Precedência quando mais de um se aplica: vale o **mais grave** (🔴 antes de
🟠), e entre os vermelhos, `Desconectado` antes de `Sumiu` — quem está
desconectado provavelmente sumiu *por causa* disso.

Os valores acima são ponto de partida explícito, não estimativa escondida:
nascem como constantes de Domain e se calibram com uso real, mesmo caminho já
percorrido pelo rate limit de IA (Bloco F1.10). Os números continuam todos
visíveis — o sinal não substitui o dado.

### Trocar o plano

Botão na lista e no detalhe, alternando `Tenant.plan` entre `free`, `pro` e
`enterprise`. Fecha o ciclo: ver que o cliente sumiu e desativar, na mesma tela.

É escrita, mas sobre o **registro do tenant** — decisão comercial do fundador,
não dado do cliente. Por isso **não** exige aceite, diferente de tudo na seção
seguinte. Registrado em `AuditLog`.

## Acesso assistido ao tenant

### Ciclo

1. **Pedido** — no `/admin`, o fundador escolhe o tenant e escreve o **motivo**
   ("verificar por que a IA parou de responder"). O motivo não é burocracia: é
   o que o cliente lê antes de decidir e o que fica gravado. Pedido sem motivo
   é pedido que ninguém consegue avaliar depois.

2. **O cliente vê** — aviso no topo do painel dele, em qualquer tela, com quem
   pediu, o motivo, o que aquilo permite e o prazo. Botões **Autorizar** e
   **Recusar**. Só **dono ou administrador** podem responder. Cliente deslogado:
   o pedido fica pendente até ele entrar.

3. **Autorizado** — o BFF emite a sessão marcada, válida por **2 horas**.

4. **Enquanto durar** — aviso **fixo e não fechável** no painel do cliente:
   "Suporte está acessando sua conta agora", com botão **Encerrar**.

5. **Fim** — por encerramento do cliente, por expiração, ou por saída do admin.

### Tabela nova

`TenantAccessRequest`: `id`, `tenantId`, `platformUserId`, `reason`, `status`
(`pending` / `accepted` / `denied` / `expired` / `revoked` / `ended`),
`requestedAt`, `respondedAt`, `respondedByUserId`, `expiresAt`.

Um registro por pedido, mantido para sempre. Recusas também ficam: se um
cliente recusou três vezes, isso é informação.

### Auditoria

As ações continuam sendo gravadas em `AuditLog` como já são; o
`supportAccessId` viaja em `metadata` — campo que existe exatamente para
detalhe livre e **não pede migration** numa tabela append-only crítica. Dois
eventos novos, `support.access_granted` e `support.access_ended`, delimitam a
janela, então "o que foi feito naquele acesso" é uma consulta direta.

Alternativa considerada e descartada por ora: coluna dedicada em `AuditLog` —
mais fácil de consultar em volume, mas migration numa tabela sensível sem
necessidade no volume atual.

### Regras invioláveis

1. Nenhum acesso sem pedido **aceito e dentro do prazo** — verificado no
   servidor a cada requisição, nunca só pela validade do cookie
2. O cliente revoga a qualquer instante, sem passar pelo fundador
3. Expirou, morreu — renovar exige novo pedido e novo aceite
4. O aviso durante o acesso **não é fechável**

São essas quatro que sustentam a decisão #5 (acesso total).

## Fora de escopo

- **Self-signup e billing automático** — descartados por decisão consciente
  (`CONTEXT.md`, seção "Fase de testes controlados"). Pagamento por Pix
  combinado no WhatsApp; ativação manual.
- **Gestão de `PlatformUser` pela interface** — o primeiro (e por ora único)
  admin nasce por script, mesmo caminho de `deleteTenant`/`backfillContacts`.
- **Notificar o cliente fora do app** (e-mail/WhatsApp) sobre o pedido — o
  projeto não tem provedor de e-mail; o pedido espera ele logar.
- **Métricas históricas / séries temporais no painel** — a janela de 30 dias
  responde a pergunta atual. Gráfico de evolução fica para quando houver
  volume que justifique.
- **Disparos programados em grupos de WhatsApp** — pedido do fundador na mesma
  conversa, registrado em `PRODUCT_BACKLOG.md` §3. Sistema independente, spec
  própria.

## Riscos e limites conhecidos

- **Acesso total (decisão #5)** concentra no fundador a responsabilidade por
  qualquer mensagem enviada em nome do cliente. As regras invioláveis produzem
  o rastro; não eliminam o risco.
- **O painel é a primeira superfície que atravessa tenants.** Um bug ali vaza
  dado entre clientes. Mitigação estrutural: todo esse código num único
  bounded context, com rotas de formato distinto.
- **`/admin` fica publicamente alcançável** no mesmo domínio do produto.
  Mitigação: mesma trava de conta e rate limit do Bloco B1 desde o primeiro
  dia; senha forte é responsabilidade operacional.
- **Limiares dos sinais são chute inicial** — calibrar com uso real, como já
  foi feito com o rate limit de IA (Bloco F1.10).
