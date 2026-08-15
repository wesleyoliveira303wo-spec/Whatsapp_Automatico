# FASE L — Motor de Leads: Análise Estratégica

**Data:** 2026-08-14
**Status:** 📋 Análise. **Nenhuma linha de código foi escrita.**
**Pedido:** recuperar a visão original do Francis (aquisição de leads) e decidir se é hora de construí-la.

---

## 0. Como este documento foi construído

Auditoria direta do repositório — não da documentação. Foram lidos: `schema.prisma` (26 migrations),
a árvore completa de `apps/api/src/services` (7 bounded contexts), `MessageIngestionService`,
`ConversationsService`, `OutboundCommandConsumer`, `BullMqOutboundMessageDispatcher`,
`BullMqAiReplyScheduler`, `WhatsAppProvider`, `shouldAutoRespond`, `PromptVersion`, `worker.ts`,
`docker-compose.prod.yml`, o catálogo de permissões e o estado do Git (incluindo trabalho não
commitado). A documentação (`CLAUDE.md` §18, `FASE_1_ANALISE_ESTRATEGICA.md`, `PRODUCT_BACKLOG.md`,
`ROADMAP.md`) foi usada para intenção e histórico, e **conferida contra o código** — onde divergem,
este documento registra o código.

As políticas do WhatsApp/Meta foram pesquisadas na internet em 2026-08-14 (fontes ao final).

---

## 1. Estado atual do Francis — o que ele realmente é hoje

**O Francis é um CRM de atendimento reativo por WhatsApp, com IA, tecnicamente maduro e operando
em produção local.** Essa frase é literal, e cada palavra dela foi verificada.

| Dimensão             | Estado real                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Maturidade de código | 7 bounded contexts em Clean Architecture, ~199 arquivos de teste, **1730 testes / 201 suítes verdes**                                     |
| Banco                | 26 migrations aplicadas, multi-tenant com FK real, índices compostos dimensionados por consulta                                           |
| Processos            | 6 containers (`postgres`, `redis`, `migrate`, `api`, `worker`, `dashboard`), `restart: unless-stopped`                                    |
| Filas                | 2 filas BullMQ reais em produção: `ai-reply` e `whatsapp-outbound`                                                                        |
| Observabilidade      | `/health` (liveness) e `/health/ready` (Postgres + Redis + profundidade da fila)                                                          |
| Segurança            | JWT + refresh com rotação e detecção de reuso, RBAC de 5 papéis / **26 permissões**, auditoria append-only, segredos cifrados AES-256-GCM |
| Fase do roadmap      | **Fase 1 concluída (2026-08-08).** Fase 2 (Beta Fechado) **ainda não iniciada**                                                           |

### O que ele já faz muito bem

1. **Recebe e persiste tudo** — texto, imagem, áudio, vídeo, documento, figurinha; mensagens do
   operador enviadas de outro aparelho (`fromMe`) também entram, com supressão de eco por cache de
   IDs. A Dashboard é espelho fiel do WhatsApp.
2. **Responde com IA de forma controlada** — Gemini/Claude atrás de um port, prompt versionado em
   código (`v1`/`v2`), Base de Conhecimento por sessão, horário de atendimento, Botão POWER por
   sessão, rate limit por conversa (6/60s) e por sessão (30/60s).
3. **Nunca deixa o cliente no vácuo** — qualquer falha de IA (cota, provider fora do ar, resposta
   inválida) envia aviso educado e sinaliza atenção humana. Escalonamento com motivo tipado
   (`não sei` vs. `pediu atendente`).
4. **Entrega o bastão para o humano** — assumir conversa, responder texto e mídia, respostas
   rápidas, pop-up de handoff com resumo gerado por IA.
5. **Classifica sozinho** — a IA marca o estágio do funil a cada resposta, via marcador de texto,
   e nunca regride o estágio (`STAGE_ORDER`).
6. **Isola tenants de verdade** — `tenantId` em toda tabela, `updateMany`/`deleteMany` escopados,
   404 (não 403) para recurso de outro tenant.

### O que ele não faz — a lacuna que define este documento

**O Francis nunca inicia uma conversa.** Cem por cento do produto pressupõe que a mensagem veio de
fora. Não existe nenhum caminho, em nenhuma camada, para o sistema falar primeiro com alguém que
ainda não falou com ele. Não há entidade de lead, não há lista, não há campanha, não há disparo.

Isso não é um esquecimento — é uma escolha registrada. O "CRM Core (Leads/Campanhas)" era o escopo
original da Milestone 2 e foi explicitamente adiado (ADR #52), com a justificativa correta de que
"faz mais sentido de produto ter o autoresponder de IA funcionando antes de construir campanhas em
massa". **Essa condição foi cumprida.** O autoresponder funciona. É por isso que esta conversa está
acontecendo agora.

### Achados da auditoria que a documentação não registra

Três coisas que só apareceram lendo o código:

**(a) Existe trabalho não commitado, e é relevante para este módulo.**
`BullMqAiReplyScheduler` está sendo alterado agora para agrupar rajadas de mensagens: o `jobId`
mudou de `tenant:conversa:mensagem` para `tenant:conversa`, com `delay` de 8s, de forma que várias
mensagens seguidas do mesmo cliente gerem **uma** chamada de IA em vez de cinco. Isso é diretamente
relevante: uma campanha gera exatamente esse padrão de tráfego, multiplicado por dezenas de pessoas
ao mesmo tempo. Terminar esse trabalho é pré-requisito, não coincidência.

**(b) A entidade `Contact` que o pedido pergunta se deve ser reaproveitada não existe de fato.**
Ela está no `schema.prisma`, mas pertence ao domínio legado congelado da Milestone 003 (ADR #11).
Verificado por `grep`: **zero referências a `prisma.contact` em código ativo.** O mesmo vale para
`Conversation`, `Message`, `Tag`, `Attachment`, `InternalNote` legados. São tabelas mortas no banco.

Na prática, **o Francis não tem conceito de pessoa.** A identidade de um contato é o campo
`contactJid` dentro de `WhatsAppConversation`, e a chave é `(tenantId, sessionName, contactJid)`.
Consequências reais, não teóricas:

- a mesma pessoa falando com duas sessões da mesma empresa é duas entidades sem nenhuma ligação;
- o incidente de LID já provou isso doer — um contato conhecido virou duas conversas, e a correção
  exigiu **mesclar linhas manualmente no Postgres**;
- não existe lugar para guardar consentimento, origem, ou histórico de contato de uma pessoa.

**Este é o débito arquitetural central deste documento**, e ele encarece a cada dia.

**(c) O prompt `v2` está estruturalmente errado para conversas iniciadas por campanha.**
O `v2` instrui: _"você precisa entender... POR QUE ela está entrando em contato agora"_. Numa
campanha, a pessoa **não** entrou em contato — nós entramos. A IA abriria perguntando o motivo do
contato a alguém que acabou de receber uma mensagem nossa. Não é um ajuste de tom; é uma inversão
de premissa. Tratado na seção 9.6.

---

## 2. A visão original, recuperada

O fluxo que o pedido descreve não é uma funcionalidade nova. É a **outra metade da máquina**:

```
┌──────────────── METADE QUE NÃO EXISTE ────────────────┐  ┌───────── METADE QUE JÁ EXISTE ─────────┐

  Leads → Lista → Campanha → Contato inicial ──────────────→ Lead responde → Francis assume → IA
                                                              entende → qualifica → conduz →
                                                              humano → conversão
```

Tudo à direita da seta está construído, testado e validado em uso real. O que falta é **a origem da
oportunidade**, não o tratamento dela.

A formulação mais precisa do que o Francis é hoje versus o que ele seria:

> **Hoje:** uma ferramenta que atende bem as oportunidades que aparecem.
> **Com o módulo:** uma ferramenta que **cria** as oportunidades que atende.

A diferença comercial entre as duas é a diferença entre um custo de operação e um centro de receita.
Um dono de PME compra a primeira quando já tem demanda demais; compra a segunda quando quer ter
demanda. O segundo mercado é maior e paga mais.

---

## 3. A oportunidade — e por que ela é real

Três argumentos, em ordem de força:

**1. O reaproveitamento é altíssimo.** Isto não é construir um produto novo ao lado. A fila outbound
existe, o worker existe, o rate limiting existe, o multi-tenant existe, a IA existe, o funil existe,
o Analytics existe. O módulo de campanhas é, em boa medida, **fiação nova sobre peças prontas** —
com duas exceções reais (identidade de contato e motor de ritmo de envio) tratadas adiante.

**2. Resolve um problema operacional do próprio fundador, hoje.** O Francis está em modo de operação
local, com Fase 2 (Beta Fechado) por começar. Para testar a IA hoje é preciso pedir para alguém
mandar mensagem. **Não há como gerar volume de conversa para validar o produto.** Um motor de
contato controlado é, antes de ser um produto, um instrumento de teste do produto.

**3. Fecha o círculo do CRM.** A própria `FASE_1_ANALISE_ESTRATEGICA.md` §7 já tinha nomeado isso
como lacuna conceitual: _"hoje o Francis só reage a mensagens recebidas, nunca inicia contato"_.

**Contra-argumento honesto, que não vou esconder:** o Francis nunca foi testado com um cliente real
que não seja o fundador. Construir um motor de aquisição antes de saber se o motor de atendimento
sobrevive a um cliente de verdade é construir a segunda metade de uma ponte cuja primeira metade
ainda não foi pisada. Isso pesa na nota da seção 19.

---

## 4. Inventário: o que já temos (e não deve ser reconstruído)

| Peça                      | Existe? | Onde                                                     | Reaproveitável para o módulo?                            |
| ------------------------- | ------- | -------------------------------------------------------- | -------------------------------------------------------- |
| **Contact**               | ❌      | modelo legado morto                                      | **Não.** Precisa nascer (§10)                            |
| **Lead**                  | ❌      | —                                                        | Não existe em nenhuma forma                              |
| **Conversation**          | ✅      | `WhatsAppConversation`                                   | **Sim, integralmente.** É o destino do lead que responde |
| **Session**               | ✅      | `WhatsAppSession` + Registry + reconexão resiliente      | **Sim.** Campanha é sempre por sessão                    |
| **Tenant**                | ✅      | FK real, cascade                                         | **Sim.** Isolamento já garantido                         |
| **Tags**                  | ✅      | `WhatsAppTag` N:N por sessão                             | **Sim.** Servem como critério de segmentação             |
| **Atribuição**            | ✅      | `assignedToUserId` + RBAC de posse                       | Sim, sem mudança                                         |
| **Histórico**             | ✅      | `WhatsAppMessage` append-only + mídia                    | Sim, sem mudança                                         |
| **IA**                    | ✅      | port + Gemini/Claude + prompt versionado + KB por sessão | **Sim**, com um bloco de contexto novo (§9.6)            |
| **Resumo por IA**         | ✅      | sob demanda                                              | Sim, sem mudança                                         |
| **Pipeline/funil**        | ✅      | `stage` 5 estágios + Kanban + policy anti-regressão      | **Sim**, com ressalva importante (§9.7)                  |
| **Escalonamento**         | ✅      | motivo tipado, aviso ao cliente, alerta na Dashboard     | Sim, sem mudança                                         |
| **Rate limit de IA**      | ✅      | janela deslizante por conversa/sessão                    | Sim — mas **precisa ser redimensionado** (§6.1)          |
| **Filas**                 | ✅      | `ai-reply` (worker) + `whatsapp-outbound` (api)          | **Parcialmente** — não serve para campanha (§9.2)        |
| **Idempotência**          | ✅      | `jobId` = id de negócio; at-least-once assumido          | Padrão reaproveitável (§9.4)                             |
| **Mídia**                 | ✅      | recebimento, envio, proxy, IA multimodal                 | Sim (campanha com imagem é extensão barata)              |
| **Status de sessão**      | ✅      | tempo real, bolinha, reconexão automática                | Sim — **é pré-condição de envio**                        |
| **Dashboard**             | ✅      | Workspace × Sessão, 10 telas por sessão                  | Sim, com 2 telas novas (§12)                             |
| **Analytics**             | ✅      | por sessão, funil, escalonamento, estabilidade           | Sim, com métricas novas (§13)                            |
| **Auditoria**             | ✅      | append-only + painel                                     | **Sim — obrigatório para consentimento** (§8)            |
| **Opt-out / blacklist**   | ❌      | —                                                        | Não existe. **Bloqueante** (§8)                          |
| **Status de entrega**     | ⚠️      | tecnicamente disponível no Baileys, **não capturado**    | Ver §6.4                                                 |
| **Importação de arquivo** | ❌      | —                                                        | Não existe nenhum upload de CSV/XLSX                     |

**Leitura do inventário:** de 22 peças, 14 servem sem mudança nenhuma. As lacunas reais são
**quatro**: identidade de contato, consentimento/opt-out, motor de ritmo de envio, e importação.

---

## 5. O que falta — a lista honesta

Em ordem de dificuldade real, não de aparência:

1. **Identidade de contato** (`WhatsAppContact`) — média. Toca schema, ingestão e conversas.
   É o item de maior consequência arquitetural e o único que muda algo já existente.
2. **Consentimento e opt-out** — média. Schema + policy de Domain + gancho na ingestão + UI.
   Baixa dificuldade técnica, alta obrigatoriedade.
3. **Motor de envio com ritmo** — média-alta. Fila nova, política de espaçamento, pausa/cancelamento,
   disjuntor de segurança. É onde mora o risco operacional.
4. **Importação e deduplicação** — média. Parsing de CSV, normalização E.164 brasileira
   (o problema do 9º dígito), unicidade, relatório de importação.
5. **Campanha (entidade + ciclo de vida)** — baixa. CRUD com máquina de estados. É o item mais
   visível e o mais fácil.
6. **Métricas de campanha** — baixa. O padrão de Analytics por sessão já está estabelecido.
7. **Contexto de campanha no prompt** — baixa. O `PromptBuilder` já aceita blocos anexos.

---

## 6. Riscos técnicos

### 6.1 O risco mais subestimado: uma campanha gera respostas correlacionadas

Este é o achado técnico mais importante deste documento.

O Francis foi dimensionado para tráfego **orgânico e descorrelacionado** — pessoas chegando ao acaso.
Uma campanha produz o oposto: 100 mensagens enviadas geram, com 20% de resposta, **20 conversas
começando na mesma janela de minutos**. Contra isso, hoje:

- rate limit de IA: **30 tentativas/60s por sessão** — 20 conversas com 2 mensagens cada já encosta;
- Gemini free tier: **~5 requisições/minuto** — 20 conversas simultâneas estouram na hora;
- consequência do estouro: `flagNeedsHumanAttention` → todas viram "Aguardando atendente".

Ou seja: **uma campanha bem-sucedida, hoje, derruba a própria IA que deveria atendê-la** — e o
sintoma seria idêntico ao incidente de cota que o fundador já viveu. O disparo precisa ser
dimensionado pela **capacidade de atendimento**, não pela vontade de enviar. Regra de projeto:
_o ritmo de envio é uma função da taxa de resposta esperada e do teto de IA, nunca um número
escolhido à mão._

Mitigações, todas necessárias: terminar o agrupamento em rajada (já em curso), tornar os limites
configuráveis por sessão, considerar tier pago do Gemini antes de qualquer campanha real, e — o mais
importante — **espaçar o envio** (§9.3).

### 6.2 Ausência de identidade de contato contamina o módulo inteiro

Sem `Contact`, "este lead já foi contatado?" não tem resposta possível. Deduplicação, supressão de
recontato, opt-out e histórico de campanha **todos dependem de uma identidade estável de pessoa**.
Construir campanhas sobre `contactJid` repetiria, em escala maior, o problema de fragmentação que o
LID já causou uma vez.

### 6.3 Envio ao vivo depende do socket, e o socket é frágil por natureza

O envio exige sessão conectada **no processo `apps/api`** (ADR #54: único dono dos sockets Baileys).
Uma campanha de 4 horas atravessa reconexões, quedas de rede e reinícios de container. O motor
precisa ser resiliente por desenho: estado por destinatário no banco (não em memória), retomada
automática, e recusa de envio quando a sessão não está conectada — nunca "melhor esforço".

### 6.4 Não sabemos se a mensagem chegou

`WhatsAppMessage` não grava status de entrega. O `BaileysProvider` até tinha um listener de
`messages.update` (era ele que revelou o erro 463), mas foi **removido no Bloco F1.4** por ser
instrumentação temporária. Para atendimento reativo, tudo bem. Para campanha, **é o sinal de saúde
mais importante que existe**: uma sequência de mensagens que não são entregues é o primeiro indício
de bloqueio. Recomendação: reintroduzir o listener, agora com propósito permanente e claro.

### 6.5 At-least-once significa risco de mensagem duplicada

Já documentado no `OutboundCommandConsumer`. Em atendimento, uma duplicata é um constrangimento.
**Numa campanha, uma duplicata é uma denúncia de spam.** O motor de campanha precisa de idempotência
mais forte que a atual: estado do destinatário verificado no banco imediatamente antes do envio
(§9.4).

---

## 7. Riscos do WhatsApp — a seção que não pode ser diluída

Pesquisa feita em 2026-08-14. Separando rigorosamente, como pedido, **possível** de **permitido** de
**arriscado**.

### 7.1 Tecnicamente possível

Sim, sem dúvida. O Baileys envia para qualquer número. A infraestrutura do Francis comporta o volume.
Nada em software impede.

### 7.2 Permitido pela plataforma

**Não.** E é importante ser exato sobre o que isso significa, em duas camadas:

**Camada 1 — a biblioteca.** Baileys é um cliente reconstruído por engenharia reversa do protocolo
do WhatsApp Web. Usá-lo **viola os Termos de Serviço da Meta, independentemente do conteúdo
enviado.** A política oficial é explícita quanto a apps não oficiais. Isso **já é verdade hoje**,
com o Francis apenas respondendo — não é um risco que o módulo de campanhas introduz.

**Camada 2 — o comportamento.** O que o módulo introduz é a mudança de **perfil de comportamento**,
e é aqui que mora o risco real. A Política de Mensagens do WhatsApp Business exige, para mensagens
iniciadas pela empresa: consentimento prévio (opt-in) do destinatário, uso de modelos aprovados na
plataforma oficial, e atendimento imediato de qualquer pedido de descadastro. Enviar mensagem em
massa não solicitada é citado nominalmente como uso que leva a restrição ou remoção de acesso.

Consequências previstas na própria política: restrição de mensagens, remoção de acesso, banimento
permanente e proibição de a organização usar qualquer produto WhatsApp no futuro.

### 7.3 Risco operacional — o que de fato acontece na prática

Os números da pesquisa, e o que eles significam para este projeto:

| Fato                                                                                    | Consequência para o Francis                                |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Detecção é **automatizada, na camada de rede**, não depende de denúncia                 | "Enviar devagar e educadamente" reduz risco, não elimina   |
| Banimento por API não oficial é **permanente e sem apelação**                           | Um número queimado não volta                               |
| Gatilho mais comum: **baixa taxa de resposta + alta taxa de bloqueio** — não o conteúdo | Lista fria de má qualidade é pior que mensagem mal escrita |
| **Bloqueio acima de ~2%** derruba a reputação e corta limites                           | Precisa ser medido, não estimado                           |
| Número novo: manter **10–30 contatos/dia nos 3 primeiros dias**, 30–50 na 1ª semana     | Define o teto padrão do produto                            |
| Consenso da indústria: **"WhatsApp não é canal de cold outreach"** em 2026              | É a frase que deve governar o desenho do produto           |

**E agora o ponto que muda tudo, e que precisa ser dito sem rodeio:**

> Se o número for banido, **não se perde a campanha — perde-se o Francis inteiro** para aquele
> cliente. Some o inbox, o histórico, o funil, o atendimento, a IA. Todo o valor que o produto
> entregou até ali evapora junto, e o cliente associará a perda ao Francis, corretamente.

O fundador já viveu a versão suave disso: o **erro 463 (`NackCallerReachoutTimelocked`)**, que é
literalmente a trava anti-spam do WhatsApp para contatos "frios". Aquilo aconteceu com o número
apenas **respondendo** a quem havia escrito primeiro. Um motor de disparo aponta essa mesma trava
para si de propósito.

### 7.4 O caminho oficial existe — e vale conhecer o preço agora

A WhatsApp Business Platform (Cloud API) é o único caminho **permitido** para mensagem iniciada pela
empresa em volume. O que ela exige e custa hoje:

- verificação de negócio na Meta + URL de política de privacidade (obrigatório desde janeiro/2026);
- modelos de mensagem **aprovados previamente** por categoria (marketing/utilidade/autenticação);
- opt-in comprovado para qualquer mensagem de marketing;
- limites por camada: 250/dia sem verificação → 1.000 → 10.000 → 100.000 → ilimitado, com avanço
  condicionado à qualidade (verde/amarelo/vermelho) e a usar ≥50% do limite atual;
- **custo real no Brasil: ~US$ 0,0625 por mensagem de marketing (~R$ 0,31–0,38)**; conversas
  iniciadas pelo cliente seguem gratuitas na janela de 24h;
- limitação relevante: o número **não pode** estar registrado no app do WhatsApp comum.

**Recomendação arquitetural, não de curto prazo:** não migrar agora — custo e burocracia não se
justificam antes de haver receita. Mas o módulo deve nascer com o **envio atrás de um port
substituível**, exatamente como `WhatsAppProvider` já é. O `WhatsAppProviderType` no schema já tem só
`BAILEYS` e foi desenhado para receber um segundo valor. Se o produto crescer, trocar o adaptador de
envio não pode significar reescrever o módulo. **A proposta de valor do Francis — a IA que conversa
— funciona idêntica nos dois canais.** É só o envelope de entrega que muda.

---

## 8. Compliance, opt-in e LGPD — requisitos, não recomendações

O produto opera no Brasil, com dados pessoais de terceiros. Além da política da Meta, incide a LGPD.
Resumo do que a pesquisa aponta:

- **Consentimento** é a base mais segura para marketing. Para prospecção **B2B**, o **legítimo
  interesse** (art. 7º, IX) é defensável, desde que haja finalidade documentada, dado mínimo,
  identificação clara do remetente e **descadastro fácil**.
- Revogação deve ser atendida **imediatamente**.
- A ANPD saiu do modo educativo: multas de até R$ 50 milhões ou 2% do faturamento.
- Titular tem direito a saber a **origem** do dado.

### Mecanismos que o módulo precisa ter — todos obrigatórios no MVP

| Mecanismo                                                                               | Por quê                                     | Custo   |
| --------------------------------------------------------------------------------------- | ------------------------------------------- | ------- |
| **Origem do lead** (`source`) obrigatória na importação                                 | LGPD (origem do dado) + qualidade da lista  | Baixo   |
| **Registro de consentimento** append-only                                               | Provar consentimento é ônus de quem trata   | Baixo   |
| **Opt-out automático por palavra-chave** ("PARAR", "SAIR", "NÃO QUERO", "DESCADASTRAR") | Política Meta + LGPD                        | Baixo   |
| **Blacklist por tenant**, respeitada por toda campanha                                  | Consequência do opt-out                     | Baixo   |
| **Rodapé de descadastro** na mensagem de campanha                                       | Reduz denúncia em >50% (pesquisa)           | Trivial |
| **Supressão de recontato** (não contatar o mesmo lead em N dias)                        | Frequência excessiva vira bloqueio          | Baixo   |
| **Nunca contatar quem já está em conversa ativa**                                       | Evita "spam" em cima de negociação em curso | Baixo   |
| **Auditoria de quem disparou o quê**                                                    | Já existe `AuditLog` — só usar              | Trivial |

**Regra de produto que recomendo tornar inegociável:** o opt-out desliga **campanhas**, nunca o
atendimento. A pessoa que pede para parar de receber ofertas continua podendo conversar e ser
atendida normalmente. Confundir as duas coisas é o erro clássico e transforma um pedido educado numa
denúncia.

**O que este documento se recusa a propor:** qualquer mecanismo cujo propósito seja contornar
limites, disfarçar automação ou escapar da detecção da Meta — rotação de números para diluir
bloqueio, variação artificial de texto com o fim de driblar filtro, simulação de digitação humana
para parecer humano. Rotação de números e variação de conteúdo têm usos legítimos (segmentação,
teste A/B), mas **como estratégia anti-detecção são exatamente o que caracteriza operação de spam**
— e, além do risco jurídico, é o tipo de decisão que define que produto o Francis é.

---

## 9. Arquitetura proposta

### 9.1 Princípio orientador

> **Reusar tudo que já existe; construir apenas a origem da oportunidade.**
> O motor de campanha termina exatamente onde a mensagem sai. Do "lead respondeu" em diante,
> **zero código novo** — é o Francis de hoje, sem alteração.

### 9.2 Bounded context novo: `services/campaigns`

Segue o padrão já estabelecido por `services/tags` e `services/quickReplies` (contexto autocontido,
Domain/Application/Infrastructure/Presentation, montado no composition root).

**Decisão-chave: uma fila nova, `campaign-send`, separada de `whatsapp-outbound`.** Justificativa:

|             | `whatsapp-outbound` (existente)           | `campaign-send` (novo)           |
| ----------- | ----------------------------------------- | -------------------------------- |
| Perfil      | O mais rápido possível                    | Deliberadamente lento e espaçado |
| Quem espera | Um cliente numa conversa aberta           | Ninguém                          |
| Falha       | Retry (é uma resposta que precisa chegar) | Marca destinatário e segue       |
| Volume      | Unitário                                  | Centenas por campanha            |

Misturar as duas colocaria a resposta a um cliente real **atrás de 500 jobs de campanha**. Isso, por
si só, decide a questão.

O **consumidor** de `campaign-send` roda em `apps/api` — único processo dono dos sockets (ADR #54).
Preserva a regra arquitetural mais importante do projeto, sem exceção.

### 9.3 Motor de ritmo — o coração do módulo

Ao iniciar a campanha, cada destinatário é enfileirado **com `delay` próprio, calculado na origem**:

```
delay(n) = n × intervaloBase + jitter(0 … variação)
```

Com `intervaloBase` de 60–90s e jitter real, uma campanha de 100 leads se espalha por ~2h. Isso não
é lentidão — **é o produto**. Três propriedades caem de graça desse desenho:

- **Ritmo humano por construção**, sem cadência rígida detectável;
- **Pausar / cancelar sem tocar na fila**: o consumidor **relê o status da campanha antes de cada
  envio** e simplesmente não envia se não estiver `RUNNING`. É exatamente o mesmo padrão de
  "re-checar no processamento" já usado por `shouldAutoRespond` no worker de IA — precedente do
  próprio projeto, não invenção;
- **Sobrevive a reinício**: o Redis persiste (`appendonly yes`) e os containers têm
  `restart: unless-stopped`. Fechar o notebook adia a campanha; não a perde.

**Tetos obrigatórios, com padrões conservadores:** máximo por dia por sessão (padrão sugerido: **30**,
alinhado à pesquisa de aquecimento), máximo por campanha, e janela de horário permitido (não disparar
às 3h da manhã — irrita e denuncia).

**Disjuntor de segurança (obrigatório, não opcional):** a campanha **pausa sozinha** se, numa janela
móvel, a taxa de falha de envio ultrapassar um limiar, ou se as primeiras N mensagens não obtiverem
nenhuma resposta. É a única proteção real contra descobrir o bloqueio tarde demais. É barato de
implementar e é a diferença entre perder 20 mensagens e perder o número.

### 9.4 Idempotência

Três camadas, todas reaproveitando padrão existente do projeto:

1. `@@unique([campaignId, contactId])` — o mesmo lead nunca entra duas vezes na mesma campanha;
2. `jobId = recipientId` — o BullMQ recusa job duplicado (mesmo padrão de `aiInteractionId` como
   `jobId`);
3. **Verificação de estado imediatamente antes do envio** — só envia se o destinatário ainda estiver
   `PENDING`; grava `SENT` logo após o socket confirmar. Fecha a janela de at-least-once identificada
   em §6.5 sem inventar mecanismo novo.

### 9.5 Conexão com o que já existe

```
Campaign ──► CampaignRecipient ──► [fila campaign-send + delay]
                                          │
                                   apps/api (socket)
                                          │
                            cria WhatsAppConversation (stage: CONTACTED)
                            + WhatsAppMessage outbound
                                          │
                        ═══ daqui em diante: NADA muda ═══
                                          │
                    lead responde → MessageIngestionService (já existe)
                    → shouldAutoRespond (já existe) → fila ai-reply (já existe)
                    → IA responde, classifica estágio, escala se preciso (já existe)
                    → Pipeline / Analytics / handoff humano (já existe)
```

Detalhe que faz isso funcionar sem gambiarra: `upsertByTenantSessionAndContact` **não sobrescreve**
campos de conversa já existente. A campanha cria a conversa com `stage: CONTACTED`; quando o lead
responde, a ingestão encontra a conversa e segue o fluxo normal. **Nenhuma alteração necessária em
`MessageIngestionService`.**

### 9.6 IA: o `v2` precisa de um bloco de contexto, não de uma reescrita

Conforme §1(c), o `v2` pressupõe conversa iniciada pelo cliente. A correção **não** é criar um `v3`
nem editar o `v2` (que está validado). O `PromptBuilder` já recebe blocos anexos opcionais
(`businessContext` da Base de Conhecimento, `offHoursContext` do horário de atendimento) — basta um
terceiro, `campaignContext`, injetado **apenas** quando a conversa nasceu de campanha:

> _"Esta conversa começou com uma mensagem que NÓS enviamos: «...». A pessoa não procurou a empresa —
> nós a procuramos. Não pergunte por que ela está entrando em contato. Reconheça o contato inicial,
> apresente-se com clareza, confirme se o assunto faz sentido para ela e, se ela não tiver interesse,
> encerre com cordialidade e sem insistir."_

Zero mudança de arquitetura, zero migration na IA, padrão idêntico ao já existente duas vezes.
Exige apenas saber que a conversa veio de campanha — o que o vínculo `CampaignRecipient →
conversationId` já dá.

**Resposta direta à pergunta 12 do pedido:** sim, a IA atual dá conta de entender contexto,
qualificar, conduzir e escalar — isso está construído e validado. O que falta é **um bloco de
contexto e uma correção de premissa**, não um motor novo.

### 9.7 O conflito de `stage` — declarado, não escondido

O pedido pede explicitamente que este conflito não seja escondido. Ele é real e tem **duas** faces:

**Face 1 — `stage` vive na conversa, não na pessoa.** Um lead com duas conversas (duas sessões, ou
duas identidades por LID) tem dois estágios independentes e nenhuma visão unificada. Com campanhas,
isso piora: o mesmo lead pode estar em várias campanhas.

**Face 2 — o funil de 5 estágios é fixo em código.** A própria `FASE_1_ANALISE_ESTRATEGICA.md` §6 já
sinalizou que o segundo cliente que pedir "Proposta Enviada" força a escolha entre migration por
cliente (insustentável) ou generalização tardia.

**Minha recomendação — deliberadamente conservadora:**

- **Não migrar `stage` para o contato agora.** A policy anti-regressão (`STAGE_ORDER`), o Kanban, o
  Analytics e o marcador do prompt dependem dele onde está. Mexer nisso junto com um módulo novo é
  acumular risco de duas fontes ao mesmo tempo — o erro de processo que a ADR #88 já registrou como
  lição ("não acumular hipóteses").
- **Introduzir `contactId` como FK nullable em `WhatsAppConversation`**, com backfill. Isso cria a
  ponte sem quebrar nada e permite, depois, uma visão "todas as conversas desta pessoa" sem migrar
  `stage`.
- **Não criar um segundo funil.** O pedido esboça `NOVO → CONTATADO → RESPONDEU → QUALIFICANDO →
INTERESSADO → PROPOSTA → NEGOCIAÇÃO → CONVERTIDO`. Recomendo **rejeitar** isso: são 8 estágios onde
  já há 5 que funcionam, e o mapeamento é quase direto (`RESPONDEU`/`QUALIFICANDO` ≈ `CONTACTED`;
  `INTERESSADO`/`PROPOSTA` ≈ `NEGOTIATING`). Dois funis paralelos seria a pior das opções: duas
  fontes de verdade sobre a mesma pergunta. O que o funil atual não expressa — "foi contatado mas
  nunca respondeu" — **não é um estágio; é um estado do destinatário da campanha** (§10), e é lá que
  deve morar.

---

## 10. Modelo de dados proposto

Segue rigorosamente as convenções já estabelecidas no `schema.prisma`: prefixo `WhatsApp` onde há
colisão com o domínio legado congelado, enums em vez de string livre, `@@map` snake_case, FK real
para `Tenant` com cascade, índices dimensionados pela consulta real.

### 10.1 `WhatsAppContact` — a identidade que falta

```prisma
model WhatsAppContact {
  id           String   @id @default(uuid())
  tenantId     String   @map("tenant_id")
  phoneE164    String   @map("phone_e164")   // identidade canônica, normalizada
  name         String?
  source       String                        // OBRIGATÓRIO — LGPD (origem do dado)
  optInAt      DateTime? @map("opt_in_at")
  optOutAt     DateTime? @map("opt_out_at")  // != null ⇒ nenhuma campanha o alcança
  lastContactedAt DateTime? @map("last_contacted_at")  // supressão de recontato
  customFields Json?     @map("custom_fields")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, phoneE164])   // deduplicação por construção
  @@index([tenantId, optOutAt])
  @@map("whatsapp_contacts")
}
```

Notas de projeto:

- **`phoneE164` é a chave, não o JID.** JID é endereço de transporte e já provou ser instável (LID).
  Telefone normalizado é a identidade durável.
- **Normalização brasileira é código de Domain, com testes.** O 9º dígito em celulares, DDI/DDD
  opcionais, formatação livre. Errar isso quebra a deduplicação silenciosamente — é o tipo de bug
  que só aparece com lista real.
- **`source` obrigatório.** Não é burocracia: é a diferença entre uma lista defensável e uma lista
  indefensável, e o campo que o Analytics vai usar para mostrar qual origem converte.
- **`customFields` como `Json`** — mesma escolha já feita em `AuditLog.metadata`. Evita uma coluna
  por campo de planilha do cliente.

### 10.2 Consentimento — log append-only

```prisma
model ContactConsentEvent {
  id        String   @id @default(uuid())
  tenantId  String   @map("tenant_id")
  contactId String   @map("contact_id")
  type      ConsentEventType         // OPT_IN | OPT_OUT
  reason    String?                  // "importação", "respondeu PARAR", "manual"
  actorUserId String? @map("actor_user_id")
  occurredAt DateTime @default(now()) @map("occurred_at")

  @@index([tenantId, contactId, occurredAt])
  @@map("contact_consent_events")
}
```

Append-only, sem FK para `WhatsAppContact` — **mesmo padrão e mesma justificativa** de `AuditLog` e
`WhatsAppSessionEvent`: a prova de consentimento precisa sobreviver à exclusão do contato. É
literalmente o registro que se apresenta se a ANPD perguntar.

### 10.3 `Campaign`

```prisma
enum CampaignStatus { DRAFT SCHEDULED RUNNING PAUSED COMPLETED CANCELLED @@map("campaign_status") }

model Campaign {
  id           String   @id @default(uuid())
  tenantId     String   @map("tenant_id")
  sessionName  String   @map("session_name")   // campanha é sempre por sessão
  name         String
  messageTemplate String @db.Text @map("message_template")  // com {{nome}}
  status       CampaignStatus @default(DRAFT)
  scheduledFor DateTime? @map("scheduled_for")
  // ritmo e segurança
  intervalSeconds Int   @default(75) @map("interval_seconds")
  dailyLimit      Int   @default(30) @map("daily_limit")
  sendWindowStart String? @map("send_window_start")   // "09:00"
  sendWindowEnd   String? @map("send_window_end")     // "18:00"
  pausedReason    String? @map("paused_reason")       // preenchido pelo disjuntor
  createdByUserId String? @map("created_by_user_id")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@index([tenantId, sessionName, status])
  @@map("campaigns")
}
```

**Sobre a máquina de estados proposta no pedido:** os 6 estados estão corretos e são suficientes.
Para o MVP, `SCHEDULED` pode nascer desabilitado na UI (o `delay` do BullMQ resolve agendamento com
zero código extra depois) — mas o valor no enum deve existir desde já, para não exigir migration
para adicioná-lo.

### 10.4 `CampaignRecipient` — onde mora o estado real

```prisma
enum CampaignRecipientStatus {
  PENDING SENT FAILED SKIPPED REPLIED
  @@map("campaign_recipient_status")
}

model CampaignRecipient {
  id         String @id @default(uuid())
  tenantId   String @map("tenant_id")
  campaignId String @map("campaign_id")
  contactId  String @map("contact_id")
  status     CampaignRecipientStatus @default(PENDING)
  skipReason String? @map("skip_reason")      // "opt-out", "conversa ativa", "contatado há 3 dias"
  errorMessage String? @db.Text @map("error_message")
  sentAt     DateTime? @map("sent_at")
  repliedAt  DateTime? @map("replied_at")
  conversationId String? @map("conversation_id")  // ponte para o mundo existente

  @@unique([campaignId, contactId])   // idempotência, camada 1
  @@index([tenantId, campaignId, status])
  @@map("campaign_recipients")
}
```

`SKIPPED` com motivo é deliberado: quando o cliente perguntar "por que só 60 dos meus 100 leads
receberam?", a resposta precisa estar no banco, não numa suposição. E `REPLIED` é o que torna a
métrica de taxa de resposta possível sem nenhuma agregação cara.

### 10.5 A única alteração em tabela existente

```prisma
// em WhatsAppConversation
contactId String? @map("contact_id")   // aditiva, nullable, backfill por phoneE164
```

**Uma coluna.** É toda a superfície de contato do módulo com o que já existe. Deliberadamente
nullable e sem cascade — conversas anteriores ao módulo continuam válidas sem contato associado.

### 10.6 Permissões novas

Seguindo o catálogo de 26 permissões existente:

| Permissão         | A partir de       | Espelha                        |
| ----------------- | ----------------- | ------------------------------ |
| `contact:read`    | OPERATOR          | `conversation:read`            |
| `contact:manage`  | MANAGER           | importar/editar/opt-out manual |
| `campaign:read`   | OPERATOR          | `analytics:read`               |
| `campaign:manage` | **ADMINISTRATOR** | criar/iniciar/pausar           |

**`campaign:manage` restrito a ADMINISTRATOR de propósito**, mais alto que `message:send`: uma
mensagem errada atinge uma pessoa; **uma campanha errada atinge mil e pode custar o número.** O nível
de permissão deve refletir o raio do estrago, não a frequência de uso.

---

## 11. Fluxo completo, etapa por etapa

| #   | Etapa                                                                                                                                    | Onde vive                  | Existe?                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------- |
| 1   | **Lead Source** — CSV/XLSX, colagem de números, cadastro manual                                                                          | UI + `campaigns`           | ❌                            |
| 2   | **Importação** — upload, mapeamento de colunas, `source` obrigatório                                                                     | `ContactImportService`     | ❌                            |
| 3   | **Validação** — normalização E.164, descarte de inválidos, relatório                                                                     | Domain puro, testável      | ❌                            |
| 4   | **Deduplicação** — `@@unique(tenantId, phoneE164)`; existente é atualizado, não duplicado                                                | Repositório                | ❌                            |
| 5   | **Segmentação** — filtro por `source`, tag, estágio, data                                                                                | Consulta                   | ❌ (MVP: filtro simples)      |
| 6   | **Campanha** — nome, mensagem com `{{nome}}`, sessão, ritmo, tetos                                                                       | CRUD                       | ❌                            |
| 7   | **Materialização + supressão** — cria `CampaignRecipient`; marca `SKIPPED` por opt-out / conversa ativa / recontato recente / já cliente | `CampaignService`          | ❌                            |
| 8   | **Fila** — um job por destinatário, `delay` escalonado + jitter                                                                          | `campaign-send`            | ❌                            |
| 9   | **Envio** — relê status da campanha, exige sessão conectada, envia, grava `SENT`                                                         | consumidor em `apps/api`   | ❌ (socket ✅)                |
| 10  | **Conversa criada** — `WhatsAppConversation` com `stage: CONTACTED` + mensagem outbound                                                  | reusa repositórios         | ⚠️ fiação                     |
| 11  | **Entrega** — ACK do WhatsApp                                                                                                            | listener a reintroduzir    | ⚠️ §6.4                       |
| 12  | **Resposta** — ingestão encontra a conversa e segue                                                                                      | `MessageIngestionService`  | ✅ **zero mudança**           |
| 13  | **Marca `REPLIED`** — primeira inbound na conversa de campanha                                                                           | gancho pequeno na ingestão | ❌ (trivial)                  |
| 14  | **IA assume** — `shouldAutoRespond` → `ai-reply` → resposta                                                                              | tudo pronto                | ✅ + bloco de contexto (§9.6) |
| 15  | **Qualificação** — IA classifica estágio a cada resposta                                                                                 | `stageSignal`              | ✅ **zero mudança**           |
| 16  | **Escalonamento** — "não sei" / "pediu atendente" → alerta + pop-up                                                                      | pronto                     | ✅ **zero mudança**           |
| 17  | **Conversão** — humano fecha; `CLOSED_WON`                                                                                               | pronto                     | ✅ **zero mudança**           |
| 18  | **Opt-out** — palavra-chave na inbound → `optOutAt` + blacklist                                                                          | policy nova + gancho       | ❌ (baixo)                    |

**Contagem: 18 etapas. 6 já existem completas (as 6 mais difíceis — todo o miolo de IA e
atendimento), 2 são fiação, 10 são novas — e 7 dessas 10 são CRUD/parsing de baixa dificuldade.**
Este é o argumento técnico mais forte a favor do módulo.

---

## 12. Proposta de Dashboard

### Onde encaixar

A navegação já é **Workspace × Sessão**, e a campanha é sempre por sessão. Logo, os itens novos
entram no rail da sessão. Sobre as duas opções do pedido, recomendo a **segunda, com ajuste**:

```
Sessão «Comercial»
├─ Conversas          ✅ existe
├─ Pipeline           ✅ existe
├─ CRM                ← grupo NOVO
│   ├─ Leads          ← tela nova
│   └─ Campanhas      ← tela nova
├─ Cérebro da IA      ✅
├─ Respostas Rápidas  ✅
├─ Analytics          ✅ (+ aba Campanhas)
├─ Equipe · Auditoria · Configurações  ✅
```

Motivo do agrupamento: o rail já tem 10 itens. Sem agrupar, "Leads" e "Campanhas" viram ruído no
meio de configurações. Com agrupamento, ficam junto do Pipeline — que é onde o usuário já pensa em
funil. Não recomendo mover o Pipeline para dentro do grupo: ele é uso diário e mover uma tela
validada por arrumação é regressão de usabilidade.

### As duas telas

**Leads** — tabela com busca, colunas _Nome / Telefone / Origem / Tags / Última conversa / Status de
consentimento_; botão **Importar** (upload → mapeamento de colunas → **origem obrigatória** →
pré-visualização com contagem de válidos/inválidos/duplicados → confirmar); linha de contato
opt-out visualmente distinta e nunca selecionável para campanha.

**Campanhas** — lista com estado e progresso (`enviados / total`, taxa de resposta); criação em 3
passos (**mensagem** com pré-visualização real do balão e `{{nome}}` substituído → **público** com
contagem ao vivo e quantos serão pulados e por quê → **ritmo** com estimativa honesta: _"100 leads a
cada 75s ≈ 2h05, terminando às 16h20"_); e uma tela de acompanhamento com controle
**Pausar / Retomar / Cancelar** em destaque permanente.

**Três exigências de UX que considero não-negociáveis:**

1. **A tela de confirmação mostra o número real que será enviado, não o importado.** "Você vai enviar
   para **63** de 100 leads (24 opt-out, 9 em conversa ativa, 4 contatados há menos de 7 dias)."
   Surpresa aqui destrói confiança na hora.
2. **Pausar precisa ser o botão mais fácil de achar da tela inteira.** É o freio de mão. Se o cliente
   percebe que algo deu errado, cada segundo procurando o botão é mensagem enviada.
3. **Um aviso permanente e não-dispensável sobre risco de bloqueio** na primeira campanha de cada
   sessão. A `FASE_1_ANALISE_ESTRATEGICA.md` §7 já tinha pedido isso ("confirmação de que o número é
   elegível/seguro"). Aqui deixa de ser cortesia e vira proteção do cliente **e** do fornecedor.

---

## 13. Métricas

O pedido está certo ao dizer que medir "mensagens enviadas" é medir a coisa errada. O funil real:

```
Importados      →  100   (base)
Elegíveis       →   63   taxa de aproveitamento da lista   ← qualidade da ORIGEM
Enviados        →   63
Entregues       →   61   taxa de entrega                    ← saúde do NÚMERO ⚠️
Responderam     →   14   TAXA DE RESPOSTA (22%)             ← qualidade da MENSAGEM
Qualificados    →    9   chegaram a CONTACTED+ pela IA      ← qualidade da IA
Negociando      →    5
Escalados       →    4
CONVERTIDOS     →    2   TAXA DE CONVERSÃO (3,2% / 14,3% dos respondentes)
```

**A métrica que decide se o produto vale a pena:** conversões ÷ leads importados. É o número que
responde "vale a pena pagar pelo Francis?".

**A métrica que decide se a conta continua viva:** taxa de entrega e taxa de resposta. Queda em
qualquer uma é o primeiro sinal de bloqueio — e precisa estar visível **na tela da campanha**, não
enterrada no Analytics. É o mesmo dado que alimenta o disjuntor da §9.3.

**Métricas de meio de funil que só o Francis pode dar** (e que nenhum disparador comum tem, porque
eles não conversam): custo de IA por conversão, tempo médio até a primeira resposta do lead, e
**quais perguntas a IA não soube responder nas conversas de campanha** — este último reusa
diretamente o `escalationReason: unknown_answer` do F1.4 e é, na minha leitura, o insight mais
vendável do módulo inteiro: _"sua campanha gerou 14 conversas e a IA travou 4 vezes na mesma
pergunta sobre prazo de entrega."_

---

## 14. MVP — o que entra, o que não entra

### A pergunta que o MVP precisa responder

> "Consigo pegar uma lista legítima de leads, criar uma campanha, iniciar os contatos de maneira
> controlada e, quando alguém responder, o Francis assume e tenta transformar aquele lead em cliente?"

### ✅ Entra (e nada além disso)

1. `WhatsAppContact` + normalização E.164 brasileira + deduplicação
2. Importação **CSV apenas**, com mapeamento de colunas e `source` obrigatório
3. Opt-out: palavra-chave automática + blacklist + botão manual + log de consentimento
4. `Campaign` + `CampaignRecipient` com máquina de estados
5. Supressão na materialização (opt-out / conversa ativa / recontato recente)
6. Fila `campaign-send` com espaçamento + jitter + teto diário + janela de horário
7. Pausar / retomar / cancelar por releitura de status
8. **Disjuntor automático de segurança**
9. Criação da conversa com `stage: CONTACTED` e vínculo `recipient ↔ conversation`
10. `campaignContext` no `PromptBuilder`
11. Marcação de `REPLIED`
12. Duas telas + funil da campanha
13. `contactId` em `WhatsAppConversation` (aditivo, com backfill)

### ⏳ Fica para depois (não é rejeição — é sequência)

XLSX; segmentação avançada; agendamento (`SCHEDULED`); campanha com mídia; testes A/B de mensagem;
sequências de follow-up automáticas; múltiplas sessões por campanha; importação por integração
externa; catálogo estruturado de serviços; migração de `stage` para o contato.

### 🚫 Não deve ser construído — nem agora nem depois

- **Qualquer mecanismo anti-detecção** — rotação de números para diluir bloqueio, variação de texto
  com fim de driblar filtro, simulação de digitação para parecer humano (§8).
- **Envio sem teto configurável.** "Enviar para todos agora" não deve existir como opção na UI.
- **Importação sem origem declarada.** Sem `source`, não há lista defensável.
- **Campanha ignorando opt-out**, sob qualquer justificativa ou permissão.
- **Um segundo funil paralelo ao `stage`** (§9.7).

---

## 15. Roadmap por fases

| Fase   | Escopo                                                                            | Entrega verificável                              | Envia mensagem? | Complexidade            |
| ------ | --------------------------------------------------------------------------------- | ------------------------------------------------ | --------------- | ----------------------- |
| **L0** | Decisão de canal + terminar o agrupamento em rajada + redimensionar limites de IA | Decisão registrada em ADR; WIP commitado         | ❌              | **Baixa**               |
| **L1** | `WhatsAppContact`, normalização, dedup, `contactId` em conversas + backfill       | Importar 100 leads e ver dedup funcionando       | ❌              | **Média**               |
| **L2** | Consentimento, opt-out por palavra-chave, blacklist, log                          | Responder "PARAR" some da base de campanha       | ❌              | **Baixa**               |
| **L3** | `Campaign` + `CampaignRecipient` + supressão + UI, **sem enviar**                 | Criar campanha e ver "63 de 100, eis os motivos" | ❌              | **Média**               |
| **L4** | Fila `campaign-send`, ritmo, pausa/cancelamento, disjuntor                        | **Reengajar 10 conversas já existentes**         | ⚠️ base própria | **Média-alta**          |
| **L5** | Primeira campanha real com lista importada pequena                                | 30 leads, 1 sessão, teto conservador             | ✅              | **Baixa** (só operação) |
| **L6** | `campaignContext` na IA + `REPLIED` + funil da campanha                           | Lead responde e a IA abre certo                  | ❌ novo envio   | **Baixa**               |
| **L7** | Métricas, custo por conversão, perguntas não respondidas                          | Analytics de campanha                            | ❌              | **Baixa**               |
| **L8** | Segmentação, agendamento, mídia, follow-up                                        | —                                                | ✅              | **Média**               |

### A decisão de sequenciamento mais importante deste documento

**L4 dispara primeiro contra a base própria — reengajamento — não contra lista importada.**

Motivo: essas pessoas **já escreveram para a empresa**. Existe conversa, existe histórico, existe
consentimento implícito pelo próprio contato inicial. O risco de bloqueio é **próximo de zero**,
porque é exatamente o que um atendente humano faria: retomar uma conversa parada.

Isso dá **o mesmo motor, exercitado em condição segura**: ritmo, pausa, disjuntor, criação de
conversa, IA assumindo, métricas — tudo validado antes de existir qualquer risco real. É a viagem de
teste antes da viagem inaugural. E, não por acaso, "mandar mensagem para todos os leads parados em
Negociando há mais de 5 dias" foi exatamente o exemplo que a `FASE_1_ANALISE_ESTRATEGICA.md` §7 usou.

Só depois disso, com o motor provado, L5 aponta para uma lista importada — pequena, legítima,
com teto baixo.

---

## 16. Complexidade e dependências

| Fase | Depende de | Risco dominante                                                         |
| ---- | ---------- | ----------------------------------------------------------------------- |
| L0   | —          | Nenhum. É decisão + dívida já em curso                                  |
| L1   | L0         | Backfill de `contactId`; normalização de telefone brasileiro            |
| L2   | L1         | Falso positivo de opt-out (alguém escreve "parar" no meio de uma frase) |
| L3   | L1, L2     | Baixo — é CRUD                                                          |
| L4   | L3         | **Alto** — é onde o WhatsApp pode reagir                                |
| L5   | L4         | **Alto** — primeiro contato frio real                                   |
| L6   | L4         | Baixo                                                                   |
| L7   | L5         | Baixo                                                                   |
| L8   | L7         | Médio                                                                   |

**Dependência externa crítica, fora do código:** o teto do Gemini. Free tier (~5 req/min) **não
sustenta** uma campanha com resposta concentrada (§6.1). Isso precisa ser resolvido antes de L5 —
por tier pago, por limites por sessão mais estritos, ou por ritmo de envio ainda mais lento. É uma
decisão de custo, não de engenharia, e precisa ser tomada conscientemente.

---

## 17. Custo e infraestrutura

**Resposta curta: tudo isso se desenvolve e se testa localmente. Não contrate VPS por causa deste
módulo.**

| Item                                    | Local hoje                                     | Muda na VPS? |
| --------------------------------------- | ---------------------------------------------- | ------------ |
| Postgres, Redis, filas, worker          | ✅ já rodando em modo produção                 | Não          |
| Importação, dedup, campanha, UI         | ✅ 100% local                                  | Não          |
| Envio com espaçamento de 75s            | ✅ — **a lentidão é o desenho, não limitação** | Não          |
| Campanha de 100 leads (~2h)             | ✅ sobrevive a reinício via Redis persistente  | Não          |
| Campanha atravessando a madrugada       | ⚠️ máquina precisa estar ligada                | **Sim**      |
| Recebimento de resposta a qualquer hora | ⚠️ mesma limitação **que já existe hoje**      | **Sim**      |

A única mudança real é **disponibilidade**, e ela **já é uma limitação atual do Francis** — não é
introduzida por este módulo. Uma campanha de 30–50 leads/dia dentro do horário comercial cabe
inteiramente numa jornada com o computador ligado.

Custo marginal do módulo: **R$ 0 de infraestrutura.** Os únicos custos reais são IA (proporcional às
respostas — e é bom que seja: só se paga por conversa que aconteceu) e, se um dia migrar para a API
oficial, ~R$ 0,31–0,38 por mensagem de marketing.

---

## 18. Critérios de aceite

### L1–L3 (sem envio)

| #   | Teste                                                     | Aprovado quando                                                                    |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Importar CSV de 100 leads com 10 duplicados e 5 inválidos | 85 criados, 10 mesclados, 5 rejeitados **com motivo**                              |
| 2   | `+55 11 98888-7777`, `5511988887777`, `11988887777`       | **Um** contato, não três                                                           |
| 3   | Importar a mesma planilha de novo                         | Zero duplicados; `source` preservado                                               |
| 4   | Contato de outro tenant por id direto na API              | **404**, nunca 403, nunca dado                                                     |
| 5   | Marcar opt-out e criar campanha incluindo o contato       | `SKIPPED` com motivo "opt-out"                                                     |
| 6   | Lead responde "PARAR"                                     | `optOutAt` gravado, evento de consentimento criado, **conversa segue funcionando** |
| 7   | Campanha de 100 com 24 opt-out, 9 em conversa ativa       | Tela mostra **63**, com a quebra dos motivos                                       |

### L4–L6 (com envio)

| #   | Teste                                     | Aprovado quando                                                               |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| 8   | Campanha de 10 com intervalo de 75s       | Espaçamento respeitado, com jitter; ~12min de duração                         |
| 9   | **Pausar no meio**                        | Nenhum envio adicional; retomar continua de onde parou                        |
| 10  | Desconectar o WhatsApp durante a campanha | `FAILED` com motivo claro; **nenhum envio "às cegas"**                        |
| 11  | Reiniciar containers no meio              | Campanha retoma sozinha; **nenhuma mensagem duplicada**                       |
| 12  | Forçar 5 falhas seguidas de envio         | **Disjuntor pausa a campanha sozinho** e registra o motivo                    |
| 13  | Lead responde                             | Conversa já existe; `REPLIED` marcado; IA assume                              |
| 14  | Conversa de campanha                      | IA **não** pergunta "por que você entrou em contato?"                         |
| 15  | Lead pergunta preço                       | IA responde do KB e classifica `NEGOTIATING`                                  |
| 16  | Lead pede atendente                       | Escala com `requested_human`; pop-up com resumo aparece                       |
| 17  | Fluxo completo de 30 leads                | Funil fecha: enviados = respondidos + sem resposta; conversões contabilizadas |

**Critério de sucesso do MVP como um todo:** 30 leads legítimos contatados, ≥3 conversas reais
conduzidas pela IA sem intervenção até a qualificação, **zero mensagens duplicadas, zero bloqueios,
número saudável ao final** — e o funil da campanha batendo com o que aconteceu de fato.

---

## 19. Decisão

### A resposta objetiva

**Não é uma pergunta só, e responder como se fosse produziria uma recomendação errada.** Há dois
produtos dentro do pedido:

| O que                                                                                                      | Nota     | Veredito                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(A)** Motor de disparo em massa para listas frias compradas/raspadas                                     | **2/10** | ❌ **Não construa. Nem agora, nem depois, deste jeito.** Em cima de Baileys, é um gerador de banimento com interface bonita — e o banimento leva junto o Francis inteiro do cliente |
| **(B)** Motor de contato estruturado sobre base legítima, com consentimento, ritmo, freio e a IA assumindo | **7/10** | ✅ **Comece o MVP** — nesta ordem, com estas restrições                                                                                                                             |

### Nota final: **7/10 — começar MVP**, para o escopo (B)

**Por que não é menos que 7:**

- A metade difícil está pronta e validada em uso real. 6 das 18 etapas do fluxo — justamente as
  6 mais caras — são **zero código novo**.
- A Fase 1 fechou com 1730 testes verdes, infraestrutura de produção rodando e observabilidade real.
  A base aguenta.
- Existe uma **necessidade operacional imediata**: sem gerar conversas, não há como validar o produto
  para a Fase 2.
- L1 (identidade de contato) **não é custo do módulo — é dívida já vencida** do projeto. O incidente
  de LID já cobrou uma vez, em forma de `UPDATE` manual no Postgres. Ela só encarece.
- É testável ponta a ponta localmente, com risco controlável por volume.

**Por que não é mais que 7:**

- O canal é ilegítimo por construção, e o modo de falha é catastrófico e irreversível.
- A Fase 2 (Beta Fechado) **não começou**. O motor de atendimento nunca foi usado por um cliente que
  não seja o fundador. Construir aquisição antes disso inverte a ordem natural de validação.
- Uma campanha bem-sucedida, hoje, **estoura a própria IA** (§6.1). Isso é um bloqueador concreto.
- O prompt `v2` está errado para conversa iniciada por campanha (§1c). Barato de corrigir, mas é
  sintoma de que o produto nunca pensou nesse fluxo.

### Formulação exata da recomendação

> **"Prepare X antes de construir Y."**
>
> **X = L0 + L1 + L2** (dívida do agrupamento em rajada, identidade de contato, consentimento):
> comece **agora**. Nenhuma dessas fases envia uma única mensagem, portanto **risco de WhatsApp
> igual a zero**, e todas resolvem problema que o Francis já tem hoje, independentemente de campanhas.
>
> **Y = L4/L5** (envio real): construa em seguida, mas **aponte primeiro para a base própria**
> (reengajamento), e só depois para lista importada — pequena, legítima, com teto baixo.

### Duas discordâncias explícitas com o pedido

Foi pedido para não concordar automaticamente. Duas divergências:

**1. Sobre "o disparo gera a oportunidade; o Francis trabalha a oportunidade".** A frase está certa
como visão e errada como ordem de prioridade. Sobre Baileys, o disparo não é apenas a etapa mais
arriscada — é a **única** que pode destruir todo o resto. Recomendo inverter a ênfase: o produto não
é "um disparador que tem IA"; é **"um atendente de IA que também sabe iniciar contato, com muito
cuidado"**. Essa diferença não é retórica — ela decide o teto padrão de envio, quem pode criar
campanha, e o que a tela de confirmação mostra.

**2. Sobre o funil de 8 estágios proposto na seção 14 do pedido.** Recomendo rejeitar. Já existe um
funil de 5 estágios funcionando, com policy anti-regressão, board Kanban, Analytics e marcador de
prompt dependendo dele. O que falta ("contatado, nunca respondeu") **não é um estágio do funil de
vendas — é um estado do destinatário da campanha**, e pertence a `CampaignRecipient`. Dois funis
paralelos seriam duas fontes de verdade sobre a mesma pergunta: o defeito clássico que este projeto
já evitou conscientemente três vezes.

---

## 20. Próximo passo recomendado

**Um único passo, pequeno, esta semana — e não é escrever o módulo:**

### Passo 1 — Fechar o que já está aberto (1 sessão de trabalho)

Terminar e commitar o agrupamento de mensagens em rajada que está no diretório de trabalho agora.
É pré-requisito técnico direto de qualquer campanha (§6.1) e está pela metade. **Deixar trabalho
não commitado enquanto se abre uma frente nova é como este projeto acumula risco silencioso** — a
lição da ADR #88 aplicada a processo, não a bug.

### Passo 2 — Decidir o canal, e registrar em ADR (1 conversa, zero código)

A decisão que ninguém pode tomar por você:

> **"Eu aceito, conscientemente, que operar sobre Baileys viola os ToS da Meta e que qualquer número
> conectado pode ser banido de forma permanente e sem apelação — e vou construir o módulo de
> campanhas com essa premissa explícita, com tetos conservadores e freio automático, mirando base
> legítima e consentida."**

Se a resposta for sim → siga para o Passo 3.
Se a resposta for não → o módulo continua fazendo sentido, mas L4 muda de adaptador, e a conversa
passa a ser sobre verificação de negócio na Meta e ~R$ 0,35 por mensagem.
**Enquanto essa decisão não estiver registrada, L4 não deve começar.** L1/L2 podem começar
imediatamente nos dois cenários — servem igual.

### Passo 3 — Executar L1 (identidade de contato)

A fase de maior valor estrutural e menor risco do roadmap inteiro. Entrega, sozinha e mesmo que o
módulo de campanhas nunca saia do papel:

- uma identidade real de pessoa, que o Francis nunca teve;
- o fim estrutural da fragmentação por LID (que já custou um `UPDATE` manual em produção);
- a base para o opt-out, para o histórico por pessoa, e para a visão unificada de conversas.

### O que **não** fazer no próximo passo

- ❌ Escrever a entidade `Campaign` antes de existir `Contact` — construir campanha sobre `contactJid`
  é assinar o retrabalho.
- ❌ Enviar uma única mensagem de campanha antes de L2 (opt-out) existir.
- ❌ Comprar VPS por causa disto (§17).
- ❌ Migrar `stage` para o contato agora (§9.7).
- ❌ Construir o catálogo estruturado de serviços (§13 do pedido): a campanha é, por definição, sobre
  **uma** oferta — o bloco de contexto de campanha (§9.6) dá à IA exatamente o foco que o texto livre
  não dá. Campanhas **reduzem** a urgência do catálogo estruturado, não aumentam.

---

## Fontes consultadas (2026-08-14)

- [WhatsApp Business Messaging Policy (oficial)](https://whatsappbusiness.com/pt-br/policy/)
- [Messaging Limits — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [WhatsApp Messaging Limits 2026 — Chatarmin](https://chatarmin.com/en/blog/whats-app-messaging-limits)
- [WhatsApp Business API Opt-In Rules 2026 — Wetarseel](https://wetarseel.ai/whatsapp-business-api-opt-in-rules/)
- [WhatsApp Business Message Limits 2026 — Uptail](https://www.uptail.ai/blog/how-many-messages-can-you-send-on-whatsapp-business-limits-explained-for-2026)
- [WhatsApp Cloud API vs Unofficial Libraries](https://whatsapp.checkleaked.cc/blog/whatsapp-cloud-api-vs-unofficial)
- [Why Cheap WhatsApp Bots Get Your Number Banned — SporeSec](https://sporesec.com/en/blog/whatsapp-unofficial-api-ban-risk)
- [WhatsApp Automation Ban Risk 2026 — Kraya](https://blog.kraya-ai.com/whatsapp-automation-ban-risk)
- [How to Avoid a WhatsApp Ban in 2026 — Whapi](https://whapi.cloud/blog/how-to-avoid-whatsapp-ban-2026)
- [WhatsApp Warm-Up 2026 — Wadesk](https://warmer.wadesk.io/blog/whatsapp-account-warm-up)
- [WhatsApp Campaign Best Practices 2026 — Blueticks](https://blueticks.co/blog/whatsapp-campaign-best-practices)
- [WhatsApp Business API Pricing Brazil 2026 — Message Central](https://www.messagecentral.com/blog/whatsapp-business-api-pricing-brazil)
- [LGPD na prospecção B2B — LeadCNPJ](https://leadcnpj.com.br/blog/lgpd-na-prospeccao-b2b/)
- [LGPD e WhatsApp Business 2026 — SocialHub](https://www.socialhub.pro/blog/lgpd-whatsapp-business-guia-conformidade-2026/)

---

_Documento de análise. Nada aqui está aprovado para implementação — segue a mesma disciplina de
`FASE_1_ANALISE_ESTRATEGICA.md`: qualquer divergência deve ser discutida e registrada aqui antes de
virar código._
