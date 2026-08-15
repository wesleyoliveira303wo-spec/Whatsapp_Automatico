# Fase L — Análise pré-implementação dos Passos 1 e 2

**Data:** 2026-08-14
**Status:** 📋 Análise para aprovação. **Nenhuma linha de código foi escrita ou alterada.**
**Escopo:** Passo 1 (agrupamento de mensagens em rajada) e Passo 2 (decisão de canal), conforme
`FASE_L_MOTOR_DE_LEADS.md` §20.

---

# PARTE I — PASSO 1: Agrupamento de mensagens em rajada

## 1. O que existe hoje no diretório de trabalho

O trabalho não commitado contém **duas mudanças independentes**, misturadas na mesma árvore:

| #      | Mudança                                                                                                         | Arquivos                                                    | Relação com a Fase L     |
| ------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------ |
| **1A** | **Agrupamento em rajada** — `jobId` por conversa + `delay` de 8s + `removeOnComplete`                           | `BullMqAiReplyScheduler.ts`, `compositionRoot.ts`, 2 testes | ✅ pré-requisito direto  |
| **1B** | **Não repetir o aviso de encaminhamento** — suprime o texto de desculpa quando `escalatedAt` já está preenchido | `AiReplyJobProcessor.ts`, 1 teste                           | ❌ correção independente |

**Primeira recomendação, antes de qualquer análise técnica: são dois commits, não um.** 1B é uma
correção de bug de UX auto-contida, correta, testada, e sem relação com a fila. Ela pode ser
commitada **hoje**, sem depender de nada nesta análise. 1A precisa de mudanças antes de entrar.

### 1B — avaliação rápida (aprovado como está)

A lógica está certa: `escalatedAt != null` significa exatamente "a IA já pediu ajuda e nenhum humano
agiu desde então", e é limpo por `escalateConversation`/`resumeConversation`. O alerta interno
continua disparando a cada falha (preserva o requisito da ADR #79), e só a repetição **voltada ao
cliente** foi silenciada. Os dois testes novos cobrem os dois lados. Sem ressalvas.

Um efeito colateral que vale registrar no commit, porque não é óbvio: após uma escalada por marcador
da IA (`decisao_da_ia`), uma falha de geração subsequente também ficará silenciosa para o cliente.
Isso é desejável — a IA já se despediu dizendo que ia encaminhar —, mas é comportamento novo e
merece uma linha de comentário.

---

## 2. O problema real que 1A ataca

Verificado na docstring escrita e coerente com o histórico do projeto: uma pessoa escrevendo como se
escreve no WhatsApp ("Dps foi mn" / "Eu fui bloqueado" / "Mas eles pediram") disparava **uma chamada
de IA por fragmento**. Dois danos:

1. **Custo/cota** — o free tier do Gemini permite ~5 req/min; 6 fragmentos em 40s estouram sozinhos.
2. **Comportamento não-humano** — a IA respondia fragmento por fragmento. Nenhum atendente faz isso;
   ele lê tudo e responde uma vez.

O problema é real e a direção da solução (debounce) é a correta. **A crítica a seguir é de
implementação, não de conceito.**

---

## 3. Como a implementação atual funciona

```
antes:  jobId = tenant:conversa:MENSAGEM   sem delay   →  N mensagens = N chamadas de IA
agora:  jobId = tenant:conversa            delay 8s    →  N mensagens = 1 chamada de IA
```

O agrupamento vem de um efeito colateral do BullMQ: **`add()` com um `jobId` que já existe é
descartado silenciosamente**. Enquanto o job está parado no `delayed`, as mensagens seguintes da
mesma conversa produzem o mesmo `jobId` e somem. Quando o job finalmente roda, o processador relê o
histórico do banco e enxerga a rajada inteira.

`removeOnComplete: true` foi corretamente identificado como obrigatório — sem ele, o `jobId` ficaria
ocupado para sempre e a conversa nunca mais receberia resposta. **Esse raciocínio está certo, mas foi
aplicado pela metade.**

---

## 4. Três defeitos — dois deles críticos

Verifiquei o comportamento no **código Lua real do pacote instalado** (`bullmq@5.80.1`,
`dist/cjs/scripts/addDelayedJob-6.js`, linhas 553-555):

```lua
jobIdKey = args[1] .. jobId
if rcall("EXISTS", jobIdKey) == 1 then
    return handleDuplicatedJob(jobIdKey, jobId, parentKey, parent, ...)
```

A checagem é `EXISTS` sobre a **chave de hash do job** — não sobre um estado específico. Isso
significa que o `add()` é descartado enquanto o job existir em Redis **em qualquer estado**:
`delayed`, `waiting`, **`active`**, `completed` ou **`failed`**. É daí que saem os dois defeitos
críticos.

### 🔴 Defeito 1 — Perda silenciosa de mensagem durante o processamento

Durante o `delay`, descartar o `add()` é o comportamento desejado (é o agrupamento). Durante o
`active`, **é perda de mensagem do cliente**.

```
t=0s    cliente: "Olá"                    → cria job (delay 8s)
t=8s    job vira ACTIVE, chama o Gemini
t=9s    cliente: "Vocês atendem Curitiba?" → add() descartado (jobIdKey existe)  ⚠️
t=13s   job completa e é removido
        → a pergunta de t=9s NUNCA gera resposta.
```

Sem erro, sem log, sem sinalização na Dashboard. O cliente fica falando sozinho e o operador não
tem como saber.

**A janela é maior do que parece**, porque o processamento não é só a chamada da IA:

| Etapa dentro de `process()`                                                | Tempo típico |
| -------------------------------------------------------------------------- | ------------ |
| `findById` + perfil + histórico (3 consultas)                              | ~50ms        |
| `generateReply` (Gemini, com até 3 tentativas e backoff 2s/4s/8s)          | 2s – 15s     |
| Envio parágrafo a parágrafo (`paragraphDelayMs` = **900ms por parágrafo**) | 0,9s – 4s    |
| `updateStage`                                                              | ~20ms        |

Uma resposta de 4 parágrafos com um retry do Gemini fica **~12 segundos em `active`**. Somada aos 8s
de `delay`, a conversa tem uma janela de ~20s em que qualquer mensagem nova é destruída — e uma
rajada de digitação é exatamente o que produz mensagens nessa janela.

**Comparação honesta com o estado anterior:** antes, cada mensagem tinha `jobId` próprio; nenhuma
mensagem era perdida. A mudança troca "IA responde demais" por "IA às vezes não responde e ninguém
fica sabendo". **O segundo é um defeito pior que o primeiro** — silêncio inexplicado é a falha que
este produto inteiro foi construído para evitar (aviso educado antes de escalar, reativação após
silêncio, `flagNeedsHumanAttention` em qualquer falha).

### 🔴 Defeito 2 — Um job que falha mata a IA daquela conversa permanentemente

```ts
defaultJobOptions: {
  removeOnComplete: true,
  removeOnFail: 500,     // ⚠️ retém a chave do job
}
```

O comentário justifica a retenção: _"falhas ficam retidas — são justamente o que se quer inspecionar
depois"_. Esse raciocínio é correto para um `jobId` descartável, e **errado para um `jobId` que é uma
trava viva de conversa**.

Um job retido em `failed` mantém `jobIdKey` existindo. Consequência: `tenant:conversa` fica ocupado,
e **toda mensagem futura daquela conversa é descartada no `add()`, para sempre.** A IA daquela
conversa está morta, silenciosamente, até que 500 outras falhas expulsem a linha ou alguém limpe a
fila à mão.

**Isso é alcançável com facilidade.** `process()` tem pelo menos cinco `await` sem proteção:
`conversationRepository.findById`, `aiBusinessProfileRepository.findByTenantAndSession`,
`messageRepository.listRecentByConversation`, `conversationAiService.generateReply` (o try/catch
interno cobre o provider, não uma falha de escrita do `AiInteraction`) e
`outboundMessageDispatcher.dispatch` (Redis). **Uma oscilação de Postgres ou Redis de um segundo
basta para matar a IA de uma conversa permanentemente.**

Antes da mudança, o mesmo cenário tinha raio de dano de uma mensagem. Agora é permanente e por
conversa. Este é o defeito mais grave dos três.

### 🟡 Defeito 3 — O rate limiter passou a medir a coisa errada

`MessageIngestionService` consome o rate limiter **antes** de agendar:

```ts
const withinRateLimit = this.aiRateLimiter.consume(tenantId, sessionName, conversationId);
if (withinRateLimit) { await this.aiReplyScheduler.schedule(...) }
else { await this.conversationRepository.flagNeedsHumanAttention(...) }
```

Limites do F1.10: **6 tentativas/60s por conversa**, 30/60s por sessão. Eles foram calibrados quando
`1 mensagem = 1 chamada de IA`. Com o agrupamento, **essa equivalência deixou de existir**: uma
rajada de 7 fragmentos consome 7 fichas e gera **uma** chamada.

Resultado prático: um cliente que escreve em 7 fragmentos — exatamente o comportamento que a mudança
existe para acomodar — **estoura o limite e cai em "Aguardando atendente"**, mesmo o sistema tendo
feito uma única chamada de IA. A proteção passa a punir o caso de uso que ela deveria beneficiar.

O rate limiter foi criado para conter **custo de IA**. Depois do agrupamento, o lugar onde o custo de
IA é gerado deixou de ser o ponto onde ele é medido.

### Defeitos menores, que ainda assim precisam de decisão

**(a) `messageId` degrada o F1.4.** O payload passa a carregar a **primeira** mensagem da rajada.
Como esse campo alimenta `AiInteraction.messageId`, e este é a base do `listUnansweredQuestions`
(perguntas que a IA não soube responder — matéria-prima da captura automática de lacunas, ADR #71),
a pergunta registrada passa a ser `"Oi"` em vez de `"Vocês parcelam em quantas vezes?"`. **A feature
não quebra; ela passa a registrar o dado errado** — o pior tipo de degradação, porque é silenciosa e
só aparece meses depois, quando os dados forem usados.

**(b) A janela conta a partir da primeira mensagem, não da última.** A docstring documenta a escolha
e a justificativa (teto de latência conhecido; reiniciar o relógio deixaria quem escreve sem parar
nunca receber resposta). **Concordo com a decisão** — só registro que ela torna o agrupamento
parcial: uma rajada de 20s vira 2 ou 3 chamadas, não 1.

**(c) A janela de 8s é constante de código.** Aceitável hoje. Vira problema quando houver campanha:
a Fase L §6.1 mostra que o ritmo precisa ser função da capacidade de atendimento. Recomendo já nascer
lendo variável de ambiente, como `AI_HISTORY_LIMIT` já faz.

---

## 5. Alternativas de arquitetura

### Alternativa A — Manter o debounce por `jobId` e tapar os buracos

Mantém o desenho atual e adiciona:

1. **`removeOnFail: true` nesta fila.** A perda de diagnóstico é aparente, não real: **toda falha já
   é gravada em `ai_interactions` com `status = PROVIDER_ERROR` e `errorMessage`**, mais o log do
   worker e `flagNeedsHumanAttention` na Dashboard. O job retido no BullMQ não acrescenta informação
   — só mantém uma trava viva.
2. **Re-verificação após a conclusão**, para fechar o Defeito 1.

O ponto delicado do item 2, que só aparece ao desenhar: **a re-verificação não pode acontecer dentro
de `process()`**. Naquele momento o job ainda está `active`, então um `schedule()` de recuperação
seria descartado pelo mesmo `EXISTS` — o remédio cairia na própria armadilha. Ela precisa rodar
**depois** de o job ser removido, ou seja, no `worker.on('completed')` de `worker.ts`, que é onde a
chave já está livre.

```
process() → retorna { respondeuAte: <occurredAt da última inbound considerada> }
   ↓
worker.on('completed') → chegou inbound depois disso? → schedule() de novo (jobId livre)
```

- ✅ Menos jobs criados
- ✅ Agrupamento "perfeito" na janela de delay
- ❌ Corretude depende de mecânica de fila e da ordem de eventos do BullMQ
- ❌ Sobra uma janela residual de milissegundos entre a consulta e a remoção do job
- ❌ `process()` ganha valor de retorno e o `worker.ts` ganha lógica de negócio

### Alternativa B — Debounce por ESTADO, não por `jobId` ⭐ recomendada

Inverte a garantia: em vez de impedir que o job nasça, deixa nascer e o torna **inofensivo**.

1. `jobId` **volta** a `tenant:conversa:mensagem` — volta a ser só proteção contra entrega duplicada
   do mesmo evento, que era seu propósito original;
2. O `delay` de 8s **permanece** (é ele que dá tempo da rajada se formar);
3. `KeyedMutex` **permanece** (já serializa a mesma conversa — peça essencial deste desenho);
4. No processador, após adquirir o mutex, uma **policy pura de Domain** decide se este job ainda tem
   trabalho a fazer:

> **`replyAlreadyCoversLatestInbound(messages)`** — existe alguma mensagem `outbound` com
> `occurredAt >= occurredAt` da última mensagem `inbound`? Se sim, a rajada já foi respondida por um
> job anterior → retorna e encerra.

Rajada de 5 fragmentos: `j1` dispara primeiro, lê o histórico completo (já com m2..m5, que chegaram
durante os 8s), responde uma vez. `j2..j5` disparam depois, encontram uma outbound mais nova que a
última inbound, e encerram — **duas consultas e nenhum custo de IA cada**.

|                      | Defeito 1 (perda)                                                                                                                                                            | Defeito 2 (trava)                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Como é resolvido** | Cada mensagem tem job próprio; nenhuma é descartada. Uma mensagem chegando durante o `active` gera job próprio, que roda depois e vê que ainda não foi respondida → responde | `jobId` volta a ser descartável; um job falho retido não bloqueia nada. `removeOnFail: 500` pode até ser mantido |

- ✅ **Nenhuma mensagem de cliente é perdida, em nenhuma janela**
- ✅ **Nenhum estado de fila pode matar uma conversa**
- ✅ A decisão vira uma **função pura de Domain, testável sem Redis** — exatamente o padrão do projeto
  (`shouldAutoRespond`, `shouldAiUpdateStage`, `shouldReactivateBot`)
- ✅ É literalmente o padrão "re-checar no processamento, não confiar no enfileiramento" que o projeto
  já usa três vezes
- ✅ `messageId` volta a ser o da mensagem correta → **Defeito (a) desaparece sozinho**
- ❌ Mais jobs criados (5 numa rajada de 5, contra 1)
- ❌ Uma rajada que atravesse a janela pode gerar 2 respostas em vez de 1

Sobre o último ponto — o mesmo cenário na Alternativa A **perde a mensagem** em vez de responder duas
vezes. Entre "responder duas vezes" e "não responder e ninguém saber", a escolha não é difícil.

Sobre o custo dos jobs extras: são 2 consultas indexadas e saída. A fila `ai-reply` processa hoje
volume baixo, com `concurrency: 5`. Irrelevante.

### Alternativa C — Debounce fora da fila (chave Redis + timer próprio)

Guardar "rajada em formação" numa chave Redis com TTL e só enfileirar quando ela expira.
**Rejeitada:** reimplementa à mão o que o `delay` do BullMQ já faz, adiciona um relógio próprio que
não sobrevive a restart, e cria uma segunda fonte de verdade sobre o que está pendente. Mais código,
mais estado, menos garantia.

### Alternativa D — Não agrupar; resolver a cota por outro caminho

Tier pago do Gemini resolve a cota, e `KeyedMutex` já serializa a mesma conversa.
**Rejeitada como solução única:** trata só metade do problema. O dano de "responder fragmento por
fragmento" não é custo — é **qualidade de atendimento e verossimilhança**, e essa parte não some com
dinheiro. Vale registrar, porém, que essa alternativa é uma **rede de segurança independente**: se o
agrupamento for revertido um dia, a cota volta a ser o gargalo.

---

## 6. Impacto no WhatsApp / Baileys

**Impacto técnico direto: nenhum.** A mudança é inteiramente interna à fila; nem o socket nem o
protocolo participam.

**Impacto indireto, e é positivo — mais do que parece.** Responder a cada fragmento separadamente é
um dos sinais comportamentais mais característicos de bot: nenhum humano responde quatro vezes a
quatro linhas de um mesmo raciocínio. Considerando que a detecção da Meta é automatizada e
comportamental (§7 de `FASE_L_MOTOR_DE_LEADS.md`), **agrupar torna o padrão de tráfego mais parecido
com o de uma pessoa**. É um ganho pequeno, mas alinhado com a direção certa — e relevante justamente
porque a Fase L vai aumentar a exposição do número.

**Latência:** +8s na primeira resposta. Para um chat comercial, está bem dentro do que um atendente
humano leva. Somado ao envio parágrafo a parágrafo (900ms cada, já existente), a experiência fica
**mais** natural, não menos.

**Ponto de atenção para a Fase L:** os 8s valem para conversa orgânica. Numa campanha, dezenas de
leads respondem quase ao mesmo tempo — 8s de espera em 20 conversas paralelas ainda cabem, mas é
mais um motivo para a janela ser configurável e não constante.

---

## 7. Impacto na IA

| Dimensão                               | Efeito                                                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Consumo de cota**                    | Redução direta e substancial — é o objetivo. Uma rajada de 6 vira 1 chamada                                                                                                                                          |
| **Qualidade da resposta**              | **Melhora.** A IA passa a ver o raciocínio completo antes de responder. O prompt `v2` é explicitamente consultivo ("entenda antes de ofertar") — responder a um fragmento isolado é o pior cenário possível para ele |
| **Classificação de estágio**           | **Melhora.** O marcador é emitido uma vez, sobre o quadro completo, em vez de 6 classificações sobre fragmentos                                                                                                      |
| **Escalonamento**                      | Neutro                                                                                                                                                                                                               |
| **F1.4 / perguntas não respondidas**   | **Piora na Alternativa A** (registra o primeiro fragmento). **Neutro na Alternativa B**                                                                                                                              |
| **Rate limiter**                       | **Quebra em ambas** enquanto viver em `MessageIngestionService` — ver §8.3                                                                                                                                           |
| **Contexto de campanha (Fase L §9.6)** | Neutro. Nenhuma interação                                                                                                                                                                                            |

---

## 8. Proposta de arquitetura para o Passo 1

### 8.1 Sequência de commits

| #   | Commit                                                                             | Depende de |
| --- | ---------------------------------------------------------------------------------- | ---------- |
| 1   | `fix: nao repetir o aviso de encaminhamento na mesma escalada` (1B, **já pronto**) | —          |
| 2   | `refactor: agrupa rajadas de mensagens por estado, nao por jobId` (Alt. B)         | 1          |
| 3   | `fix: rate limit de IA passa a medir chamadas, nao mensagens`                      | 2          |
| 4   | `chore: janela de agrupamento configuravel por ambiente`                           | 2          |

### 8.2 Commit 2 — o desenho concreto

**Domain** (`services/conversations/domain/policies/`) — arquivo novo, função pura, sem dependência:

```
shouldGenerateReply(messages: Message[]): boolean
  → false quando existe outbound com occurredAt >= occurredAt da última inbound
  → true caso contrário (inclusive lista vazia — nunca bloqueia por omissão)
```

Nome deliberadamente no mesmo formato das policies existentes (`shouldAutoRespond`,
`shouldAiUpdateStage`, `shouldReactivateBot`), e colocada no mesmo diretório. Empatamento de
timestamp resolve para "já respondida" (`>=`) — mais conservador: na dúvida, não gerar custo nem
resposta duplicada.

**Application** (`AiReplyJobProcessor.process()`) — uma checagem a mais, **depois** da leitura do
histórico que já acontece hoje e **antes** de `generateReply`. Custo: zero consulta nova.

```
findById → perfil → shouldAutoRespond → listRecent → [NOVO] shouldGenerateReply → generateReply
```

**Infrastructure** (`BullMqAiReplyScheduler`) — mantém `delay`, reverte o `jobId` para incluir
`messageId`.

**Composition root** — `removeOnComplete: true` **permanece** (boa higiene, independente do motivo
original); `removeOnFail: 500` **permanece** e volta a ser seguro.

Superfície total: 1 arquivo novo (~15 linhas), 3 arquivos tocados, nenhuma migration, nenhuma mudança
de contrato de API/BFF, nenhuma mudança de comportamento visível ao operador.

### 8.3 Commit 3 — o rate limiter

Duas opções reais:

**(i) Mover o `consume()` para o `AiReplyJobProcessor`**, logo antes de `generateReply` — passa a
contar chamadas de IA de verdade, que é o que sempre quis medir. Efeito colateral: o estouro passa a
acontecer no worker, então `flagNeedsHumanAttention` migra junto. É a opção **conceitualmente
correta**.

**(ii) Manter onde está e recalibrar** (ex.: 20/60s por conversa), aceitando que mede mensagens.
Uma linha de mudança, mas continua medindo a métrica errada — e, com campanhas, medir errado no
nível de sessão é justamente o risco da Fase L §6.1.

**Recomendo (i)**, com uma ressalva honesta: `InMemorySlidingWindowAiRateLimiter` é estado em
memória de processo. Hoje `MessageIngestionService` roda em `apps/api` e o processador roda em
`worker` — **mover a checagem muda de processo**. Como há uma instância de cada, funciona igual. Mas
isso reforça a pendência já registrada no F1.10: se um dia houver mais de um worker, o limiter
precisa ir para o Redis. Vale reescrever esse comentário no código ao mover.

### 8.4 Testes

**Novos** — `shouldGenerateReply.test.ts` (puro, ~8 casos: outbound depois da inbound; outbound antes;
timestamps iguais; só inbound; lista vazia; só outbound).

**Reescrever** — `BullMqAiReplyScheduler.test.ts`: os três casos de agrupamento por `jobId` deixam de
existir; entram casos de "sempre agenda com delay" e "jobId distingue mensagens".

**Ampliar** — `AiReplyJobProcessor.test.ts`: job de rajada já respondida não chama o provider;
mensagem chegada durante o processamento **é respondida** (é a prova de que o Defeito 1 não existe
na Alternativa B).

**Integração real** — estender `aiReplyWorkerConcurrency.integration.test.ts`, que já sobe Redis de
verdade: enfileirar 5 jobs da mesma conversa com delay e provar que só um chega a gerar resposta.
É o teste que valida a mecânica de fila contra o BullMQ real, não contra um mock.

### 8.5 Riscos residuais, declarados

| Risco                                           | Severidade  | Tratamento                                         |
| ----------------------------------------------- | ----------- | -------------------------------------------------- |
| Rajada mais longa que a janela gera 2 respostas | Baixa       | Aceito e documentado. Preferível a perder mensagem |
| Jobs no-op consomem slots do worker             | Muito baixa | 2 consultas indexadas; `concurrency: 5`            |
| Corrida entre 2 jobs da mesma conversa          | **Nenhuma** | `KeyedMutex` já serializa (F1.10)                  |
| Limiter em memória ao mudar de processo         | Baixa hoje  | Documentar; vira Redis quando escalar              |

---

# PARTE II — PASSO 2: Decisão de canal

## 9. A pergunta exata

Não é "Baileys ou API oficial?". É:

> **Sobre qual canal o Francis vai enviar mensagens que o destinatário não pediu — e quem assume o
> risco quando esse canal reagir?**

Reformulada assim, fica claro que a decisão tem **duas metades**: uma técnica (qual adaptador) e uma
de responsabilidade (de quem é o número, e o que o cliente foi avisado). A segunda não é
delegável a arquitetura.

## 10. As quatro opções

### Opção A — Permanecer 100% em Baileys

|                     |                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Custo de engenharia | **Zero**                                                                                 |
| Custo por mensagem  | **Zero**                                                                                 |
| Prazo               | Imediato                                                                                 |
| Conformidade        | ❌ Viola os ToS da Meta (**já viola hoje**)                                              |
| Risco               | 🔴 Banimento permanente e sem apelação, **derrubando o produto inteiro** daquele cliente |
| Teto realista       | 30–50 contatos/dia por número, com aquecimento                                           |

O ponto que costuma ser mal entendido: **isto não é "não decidir"**. É escolher conscientemente
operar num canal que pode desaparecer sem aviso, e projetar tetos e freios com essa premissa.

### Opção B — Migrar tudo para a Cloud API

|                     |                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------ |
| Custo de engenharia | **Alto** — ver §11, o port não serve                                                 |
| Custo por mensagem  | ~US$ 0,0625 marketing (~R$ 0,31–0,38); conversa iniciada pelo cliente, grátis em 24h |
| Prazo               | Semanas (verificação de negócio, aprovação de templates)                             |
| Conformidade        | ✅ Único caminho permitido                                                           |
| Risco               | 🟢 Baixo, seguindo as políticas                                                      |

**Custos escondidos que precisam entrar na conta:**

- **O número sai do app do WhatsApp.** Um número na Cloud API é dedicado à API. O dono do negócio
  **perde o WhatsApp no celular** daquele número. Para uma PME cujo dono atende pelo próprio
  aparelho, isso não é detalhe — é possivelmente o maior obstáculo de adoção do produto inteiro.
- **Toda mensagem fora da janela de 24h exige template aprovado previamente** pela Meta. O Francis
  responde com texto gerado por IA — isso funciona **dentro** da janela de 24h (aberta pela resposta
  do lead), mas a mensagem inicial da campanha é obrigatoriamente um template fixo, sem IA.
- **Verificação de negócio + política de privacidade publicada** são obrigatórias desde jan/2026.
- **A recepção inverte:** deixa de ser socket com eventos e passa a ser **webhook HTTP entrante** —
  o que exige endereço público com HTTPS. Ou seja, **a Cloud API é a única opção das quatro que
  torna a VPS obrigatória**, contrariando §17 da Fase L.

### Opção C — Híbrido por sessão ⭐

Cada sessão do Francis declara seu canal. Sessão "Atendimento" segue em Baileys (o número do celular
do dono, com QR, como hoje); sessão "Campanhas" usa Cloud API, com número dedicado.

**O schema já tem o encaixe** — e isso não é coincidência, foi decisão registrada:

```prisma
enum WhatsAppProviderType { BAILEYS @@map("whatsapp_provider_type") }

model WhatsAppSession {
  provider WhatsAppProviderType @default(BAILEYS)   // ← campo já existe
}
```

O comentário do enum diz textualmente que novos valores entram "apenas quando uma segunda
implementação real de `WhatsAppProvider` existir". **É exatamente este caso.**

|                     |                                                                              |
| ------------------- | ---------------------------------------------------------------------------- |
| Custo de engenharia | Médio-alto (mas incremental, e só quando houver necessidade)                 |
| Conformidade        | ✅ para campanhas; inalterada para atendimento                               |
| Risco               | 🟢 **Isolado.** Um banimento no número de campanha não derruba o atendimento |
| Preserva            | O dono continua com o WhatsApp no celular do número principal                |

O ganho decisivo: **isola o raio de explosão**, que é o problema central identificado na Fase L §7.3.
Hoje, campanha e atendimento compartilham destino; separando os números, deixam de compartilhar.

### Opção D — Não decidir agora; construir a costura

Nada muda no canal. O que muda é que o **envio de campanha nasce atrás de um port próprio e estreito**
desde a primeira linha, para que a troca de adaptador seja localizada.

|                     |                                                                    |
| ------------------- | ------------------------------------------------------------------ |
| Custo de engenharia | **Praticamente zero** (é disciplina de desenho, não código a mais) |
| Conformidade        | Inalterada                                                         |
| Risco               | Adia a decisão sem aumentar o custo de tomá-la                     |

## 11. Achado arquitetural: `WhatsAppProvider` é a costura errada para a Cloud API

A intuição natural — "a Cloud API é só mais um `WhatsAppProvider`" — **não sobrevive ao contrato
real**. Confrontando os 8 métodos do port com o que a Cloud API oferece:

| Método do port               | Cloud API                                         | Veredito                   |
| ---------------------------- | ------------------------------------------------- | -------------------------- |
| `connect()` / `disconnect()` | Não existe conexão a manter                       | ❌ sem sentido             |
| `getQRCode()`                | Não existe QR                                     | ❌ sem sentido             |
| `getStatus()`                | No máximo "credencial válida"                     | ⚠️ significado diferente   |
| `onEvent(listener)`          | **Meta faz POST no seu webhook**                  | ❌ **direção invertida**   |
| `getPhoneNumber()`           | Configuração, não descoberta                      | ⚠️ trivial                 |
| `sendMessage(to, content)`   | Existe — mas exige template fora da janela de 24h | ⚠️ **semântica diferente** |
| `sendMediaMessage()`         | Existe, via upload prévio → media id              | ⚠️ fluxo diferente         |
| `downloadMedia()`            | Existe, via media id + token                      | ⚠️ fluxo diferente         |
| `getProfilePictureUrl()`     | **Não existe**                                    | ❌ ausente                 |

**Dois métodos mapeiam de fato; quatro não fazem sentido nenhum.** E o mais grave não é a contagem:
`onEvent` **inverte a direção do controle**. Baileys é _pull_ (nós abrimos socket e escutamos); Cloud
API é _push_ (a Meta chama nossa URL). Isso não é diferença de implementação — é diferença de
topologia, e é o que arrasta a exigência de HTTPS público.

Forçar a Cloud API dentro de `WhatsAppProvider` produziria a pior classe de abstração: uma interface
em que metade dos métodos lança "não suportado". O projeto já rejeitou isso explicitamente antes — é
o achado F9 registrado no `schema.prisma` ("evita generalizar o port antes de uma segunda necessidade
real").

### A costura certa: um port estreito, só para campanha

O projeto já resolveu esse problema duas vezes, e o precedente é claro. Quando `services/conversations`
precisou alcançar o WhatsApp, **não** importou `WhatsAppProvider` — foram criados `MediaDownloader` e
`MediaSender`, ports minúsculos com um método cada. Mesma disciplina aqui:

```
CampaignMessageSender  (Domain de services/campaigns)
  send(sessionName, toPhoneE164, content) → { providerMessageId }
```

Duas implementações possíveis, ambas triviais de encaixar:

- `WhatsAppCampaignSender` → delega ao `WhatsAppConnectionRegistry` existente (Baileys);
- `CloudApiCampaignSender` → `POST /messages` na Graph API, sem tocar em socket algum.

**Consequência prática:** trocar de canal para campanhas vira substituir **uma classe no composition
root**. Nada em `services/campaigns` sabe qual é. É isto que a Opção D compra por custo próximo de
zero — e é o que torna a Opção C incremental em vez de um projeto de migração.

## 12. Recomendação para o Passo 2

> **Opção D agora, com a Opção C como destino declarado. Opção B não é o próximo passo, e a Opção A
> pura não deve ser assumida sem estar escrita.**

Na prática, três decisões a registrar numa ADR:

**Decisão 1 — o MVP de campanhas envia por Baileys, conscientemente.** Nada mais é viável no prazo,
e com os tetos da Fase L (30/dia, base própria primeiro, disjuntor) o risco é gerenciável. O que não
pode acontecer é isso ser _implícito_.

**Decisão 2 — o envio nasce atrás de `CampaignMessageSender`, nunca chamando o socket direto.**
Custo zero hoje, e é o que mantém a Opção C aberta.

**Decisão 3 — quando a Cloud API entrar, entra como uma sessão de canal diferente, não como
substituição.** `WhatsAppProviderType` ganha `CLOUD_API`, `WhatsAppSession.provider` passa a ser
lido, e `WhatsAppProvider` **não** é forçado a acomodá-la.

### O gatilho, definido antes de precisar dele

Vale fixar agora, com a cabeça fria, o que fará a Opção C sair do papel:

- primeiro cliente pagante cujo número de campanha seja crítico para o negócio dele; **ou**
- primeiro incidente real de bloqueio/limitação em campanha; **ou**
- necessidade de passar de ~50 contatos/dia por número.

Qualquer um desses **basta**. Definir o gatilho antes evita a decisão ser tomada às pressas depois de
um número ser banido.

### O texto da ADR

> Reconhecemos que operar sobre Baileys viola os Termos de Serviço da Meta e que qualquer número
> conectado pode ser banido de forma permanente e sem apelação, derrubando junto o atendimento, o
> histórico e o funil daquele cliente. Ainda assim, escolhemos construir o MVP de campanhas sobre
> Baileys, por inviabilidade de prazo e custo do canal oficial nesta fase, e mitigamos com: tetos
> conservadores por sessão, disjuntor automático, base própria antes de lista importada,
> consentimento e opt-out obrigatórios, e um port de envio substituível. Assumimos que o produto
> avisará o cliente do risco antes da primeira campanha de cada sessão.

**A última cláusula é a que tem consequência jurídica e comercial real.** Se o Francis vier a ser
vendido a terceiros, o cliente precisa ter sido avisado do risco antes de usar — e o produto precisa
provar que avisou. Isso conecta diretamente com o aviso não-dispensável já proposto em
`FASE_L_MOTOR_DE_LEADS.md` §12.

## 13. Dependências e impactos do Passo 2

| Área                        | Impacto agora             | Impacto se a Opção C for acionada                                           |
| --------------------------- | ------------------------- | --------------------------------------------------------------------------- |
| `schema.prisma`             | **Nenhum**                | `+ CLOUD_API` no enum (aditivo)                                             |
| `WhatsAppProvider`          | **Nenhum**                | **Nenhum** — não é estendido, por decisão                                   |
| `services/campaigns`        | Nasce com o port estreito | Troca de classe no composition root                                         |
| `SessionManager` / Registry | **Nenhum**                | Sessão Cloud API não entra no Registry (não há socket)                      |
| Recepção de mensagem        | **Nenhum**                | Rota de webhook nova → `MessageReceivedHandler` (o mesmo port já existente) |
| Infraestrutura              | **Nenhum**                | **VPS + HTTPS público passam a ser obrigatórios**                           |
| IA / Pipeline / Analytics   | **Nenhum**                | **Nenhum** — tudo a jusante é indiferente ao canal                          |

A última linha é a mais importante do documento inteiro: **nenhuma decisão de canal atinge a IA, o
funil ou o Analytics.** Toda a proposta de valor do Francis está a jusante do envio, e por isso é
imune a essa escolha. É exatamente esse desacoplamento que torna a Opção D barata.

---

## 14. O que peço para aprovar

| #   | Decisão                                                       | Recomendação                   |
| --- | ------------------------------------------------------------- | ------------------------------ |
| 1   | Separar 1B (aviso repetido) e commitar sozinho                | ✅ Sim                         |
| 2   | Alternativa **A** ou **B** para o agrupamento                 | ✅ **B** (debounce por estado) |
| 3   | Rate limiter: mover para o processador (i) ou recalibrar (ii) | ✅ **(i)** mover               |
| 4   | Janela de agrupamento via variável de ambiente                | ✅ Sim, mantendo 8s de padrão  |
| 5   | Canal: registrar a ADR com as 3 decisões da §12               | ✅ Sim                         |
| 6   | Gatilho da Opção C definido desde já                          | ✅ Sim                         |

**Nada será implementado até aprovação.** Aprovados os itens 1–4, o Passo 1 sai em quatro commits
pequenos, sem migration e sem mudança visível ao operador. O item 5 é documento, não código. O
item 6 é decisão de negócio.

---

_Análise pré-implementação. Segue a disciplina de `CLAUDE.md` §12: analisar, identificar impactos,
propor alternativas e implementar somente após aprovação._
