# MILESTONE 003 – IA Autoresponder

> Documento de planejamento arquitetural. Nenhum código foi implementado a partir deste documento — ver §7 "Próximos Passos" para o fluxo de aprovação. Segue o mesmo rigor de auditoria/decisão já aplicado em `DECISIONS.md`/`PROJECT_STATUS.md` ao longo do projeto (ADRs #1–#54).
>
> **Revisão 3 (2026-07-09)**: incorpora a ADR #54 (Accepted), que resolve um bloqueador estrutural encontrado em revisão arquitetural dedicada antes do Bloco 1: na Revisão 2, o worker de IA (processo separado, §2.5-B) enviaria a resposta gerada "via `WhatsAppProvider.sendMessage()`, resolvido via `WhatsAppConnectionRegistry.getOrCreate()`" — o que, executado no processo do worker, abriria um **segundo socket Baileys** para a mesma sessão já conectada no processo `apps/api` (o `WhatsAppConnectionRegistry` é um `Map` em memória, válido só dentro do processo que o instancia). A partir desta revisão, **em nenhum ponto deste documento o worker envia mensagens diretamente através do `WhatsAppProvider` ou do `WhatsAppConnectionRegistry`** — todo envio outbound passa pela fila `whatsapp-outbound` (novo port `OutboundMessageDispatcher`, novo componente `OutboundCommandConsumer`), ver §2.8. Nenhuma ADR existente (#1–#53) foi revogada; #54 é aditiva e complementar à ADR #16 (coordenação distribuída entre pods, ainda Deferred).
>
> **Revisão 2 (2026-07-09)**: incorpora requisitos explícitos do usuário para preparar o sistema para SaaS multi-tenant de larga escala, evitando refatorações futuras — BullMQ obrigatório, abstração de provider de IA (`AiProvider`/`AiProviderFactory`), separação de responsabilidades na geração de resposta (`PromptBuilder`/`ConversationAiService`/`ReplyValidator`), auditoria/billing (`AiInteraction`), versionamento de prompts (`PromptVersion`). A Revisão 1 (primeira versão deste documento) tratava BullMQ como uma alternativa em aberto (§2.1 antigo) — **essa decisão agora está tomada**, não é mais uma alternativa. Nenhuma ADR existente (#1–#53) foi revogada ou alterada; esta revisão só ACRESCENTA estrutura aos blocos já propostos.

---

## 0. Escopo e não-escopo

**Escopo desta Milestone**: um contato manda uma mensagem de texto pelo WhatsApp para um tenant → o sistema persiste a conversa/mensagem → se ninguém (humano) assumiu a conversa, um job assíncrono (BullMQ) gera uma resposta via um provider de IA plugável (Claude por padrão) → a resposta é validada, registrada (auditoria/billing) e enviada automaticamente → um operador pode, a qualquer momento, assumir a conversa e a IA para de responder automaticamente àquela conversa.

**Fora de escopo nesta Milestone (backlog explícito, YAGNI)**:
- Mensagens de grupo/broadcast, mídia (imagem/áudio/documento) — só texto 1:1 no MVP.
- Banco de conhecimento (FAQ/documentos) para RAG — mencionado na visão original do produto (`CLAUDE.md` §1), mas exige uma peça de infraestrutura própria (embeddings, busca vetorial) que não tem nenhum consumidor sem o autoresponder básico funcionando primeiro.
- UI completa de inbox/atendimento no Dashboard (lista de conversas, chat view) — Bloco 6 abaixo propõe só o mínimo (endpoint de escalonamento); a UI completa fica como possível "Fase 2" desta milestone, no mesmo espírito de como a Milestone 2 separou Backend/BFF/UI em fases.
- Billing de verdade (cobrança, faturas, limites por plano) — esta milestone REGISTRA o custo (`AiInteraction`), não o COBRA. Faturamento é responsabilidade de uma milestone futura (M5, SaaS) que consome esses registros.
- Seleção de provider de IA por tenant (multi-provider por CLIENTE, não só por arquitetura) — a fábrica (`AiProviderFactory`) já fica pronta para isso (§2.2), mas o campo de preferência no `Tenant` e a UI para trocá-lo não são construídos agora (YAGNI — zero demanda real hoje; adicionar depois é aditivo, não uma refatoração).
- CRM Core (Leads/Campanhas) — permanece redefinido para depois desta milestone (ver `DECISIONS.md` ADR #52).

---

## 1. Auditoria do Estado Atual

(Inalterado em relação à Revisão 1 — a auditoria de código continua válida; reproduzida aqui por completude.)

### 1.1 O que já existe e pode ser reaproveitado sem alteração

- **Multi-tenancy real**: `TenantRepository`, `requireApiKey`/`resolveTenantFromApiKey` (Production Hardening, Blocos 1/6).
- **Ciclo de vida de conexão robusto**: `SessionManager`/`WhatsAppConnectionRegistry`/`BaileysProvider` — reconexão com backoff+circuit breaker (ADR #47), geração/evicção segura (ADR #42).
- **Canal de eventos assíncronos já projetado para crescer**: `WhatsAppProviderEvent` antecipa `message_received` desde a ADR #14.
- **Padrão de dispatch-via-porta-injetada, já usado 2x**: `SessionManager` chama `eventRepository.append()` (ADR #49) sem conhecer `services/conversations/` — o mesmo padrão será reaproveitado nesta milestone uma TERCEIRA vez (ver §2.3).
- **`CLAUDE_API_KEY`** já antecipado no `ci.yml` desde a Milestone 0.
- **Redis já provisionado e saudável**: `docker-compose.yml` já tem o serviço `redis` com healthcheck, e `api` já declara `depends_on: redis` + `REDIS_URL` — só falta o código que o usa. `bullmq`/`ioredis` NÃO estão em `apps/api/package.json` ainda (confirmado por leitura direta).

### 1.2 O que NÃO existe e é pré-requisito estrutural

1. **Nenhuma captura de mensagem inbound** — `WhatsAppProviderEvent` só tem `'status_changed'`; `BaileysProvider` nunca assina `sock.ev.on('messages.upsert', ...)`.
2. **Nenhuma capacidade de enviar mensagem** — o port `WhatsAppProvider` não tem `sendMessage()`.
3. **Nenhum modelo de Conversa/Mensagem multi-tenant** — só existe no domínio legado `src/` (congelado, ADR #11), não reaproveitável literalmente.
4. **Nenhuma fila/worker BullMQ em uso** — infraestrutura provisionada (ver 1.1), zero código consumidor.
5. **(Novo nesta revisão) Nenhuma abstração de provider de IA, nenhum registro de custo/telemetria de chamadas de IA** — confirmado: `apps/api/package.json` não tem nenhum SDK de IA; não existe nenhuma entidade equivalente a `AiInteraction` em nenhum lugar do projeto (nem no domínio legado).

---

## 2. Alternativas de Arquitetura e Decisões

### 2.1 Orquestração da autoresposta — DECIDIDO: BullMQ obrigatório

Não é mais uma alternativa em aberto (a Revisão 1 apresentava síncrono-vs-BullMQ como decisão pendente — o usuário decidiu por BullMQ). Toda geração de resposta de IA passa por uma fila (`ai-reply`); nenhum caminho de código gera uma resposta de IA de forma síncrona dentro do handler de evento do Baileys.

**Consequência estrutural**: `MessageIngestionService` (Bloco 2) e `ConversationAiService` (Bloco 3) NUNCA se chamam diretamente. Entre os dois fica sempre um port `AiReplyScheduler` (produtor da fila) de um lado e um worker (consumidor da fila, que por sua vez chama `ConversationAiService`) do outro — nunca uma chamada de função direta. Isso também significa que `ConversationAiService` é 100% testável sem BullMQ real (chamado direto nos testes), e o worker é testável separadamente com um Fake de fila — dois níveis de teste independentes, nenhum exige Redis real rodando.

### 2.2 Abstração de provider de IA — `AiProvider` + `AiProviderFactory`

Mesma estrutura Ports & Adapters já usada 2x no projeto (`WhatsAppProvider`/`BaileysProviderFactory`, Item 5 Bloco 2/ADR #34): um port pequeno, uma implementação real, um Fake de teste, uma factory que resolve por NOME em vez de instanciar diretamente.

```ts
// domain/providers/AiProvider.ts
interface AiProvider {
  generateReply(request: AiGenerationRequest): Promise<AiGenerationResult>;
}

interface AiGenerationRequest {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface AiGenerationResult {
  content: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
}

// domain/providers/AiProviderName.ts — enum, não string livre (mesmo racional do achado F6/ADR #15:
// "provider como enum" já corrigiu esta classe exata de bug uma vez neste projeto)
type AiProviderName = 'claude' | 'openai' | 'gemini';

// domain/providers/AiProviderFactory.ts
interface AiProviderFactory {
  create(providerName: AiProviderName): AiProvider;
}
```

**Diferença deliberada frente a `WhatsAppProviderFactory.create(tenantId, sessionName)`**: lá, a "identidade" que varia é a SESSÃO (cada tenant+sessionName é uma conexão distinta, com estado). Aqui, a identidade que varia é o PROVIDER escolhido (Claude vs. OpenAI vs. Gemini) — não há estado de conexão por chamada. Por isso `AiProviderFactory.create()` recebe só `providerName`, não `tenantId`. Isso já deixa o caminho aberto para, no futuro, resolver `providerName` a partir de uma preferência por tenant (§0, item fora de escopo) sem mudar a assinatura da factory — só QUEM chama `create()` passaria um valor diferente.

- `ClaudeAiProvider implements AiProvider` (Infrastructure) — usa `@anthropic-ai/sdk` (nova dependência).
- `FakeAiProvider implements AiProvider` (test double, em `apps/api/tests/services/ai/infrastructure/`, mesmo local que `FakeWhatsAppProviderFactory.ts` hoje) — devolve respostas determinísticas configuráveis, nunca gasta tokens reais.
- A factory real (`AiProviderFactoryImpl`, Infrastructure) resolve por `switch`/`Map<AiProviderName, () => AiProvider>` — adicionar `OpenAiProvider`/`GeminiProvider` no futuro é SÓ uma nova classe + uma linha nesse mapa, zero mudança em Domain/Application (Open/Closed de verdade, não hipotético).

### 2.3 Separação de responsabilidades na geração de resposta

Em vez de um único serviço fazendo "buscar histórico + montar prompt + chamar IA + validar + enviar" (o que a Revisão 1 propunha como um `ConversationAiService` monolítico), quatro componentes distintos, cada um com uma única razão para mudar:

| Componente | Camada | Responsabilidade única | O que NÃO faz |
|---|---|---|---|
| `PromptBuilder` | Application (`services/ai/application/`) | Transformar histórico de `Message[]` + `PromptVersion` num `AiGenerationRequest` pronto para o provider. | Não chama nenhuma API externa; não sabe qual provider vai receber o resultado. |
| `AiProviderFactory` + `AiProvider` | Domain (port) / Infrastructure (impl) | Só a chamada de geração em si (ver §2.2). | Não sabe nada sobre conversas, histórico, ou o que fazer com o resultado. |
| `ReplyValidator` | Domain (`services/ai/domain/`) | Decidir se um texto gerado é aceitável para enviar a um usuário real. | Não gera texto, não persiste nada, não sabe de onde o texto veio. |
| `ConversationAiService` | Application (`services/ai/application/`) | ORQUESTRAR os três acima + `AiInteractionRepository` — busca histórico, chama `PromptBuilder`, chama `AiProviderFactory.create(...).generateReply(...)`, chama `ReplyValidator`, grava `AiInteraction`, devolve o resultado (validado ou rejeitado) para quem chamou (o worker). | Não constrói o prompt (delega), não decide se o texto é válido (delega), não fala com o provider de IA diretamente por conta própria (usa a factory). |

Este é o mesmo racional já usado para justificar a existência de `WhatsAppSessionService` como uma classe coesa (Production Hardening, Bloco 5): "múltiplas operações relacionadas compartilhando a mesma orquestração" é o critério que justifica uma classe orquestradora — mas cada PEDAÇO da orquestração (montar prompt, chamar provider, validar) é pequeno e testável isoladamente, sem precisar montar o `ConversationAiService` inteiro para testar, por exemplo, só o `ReplyValidator`.

`ReplyValidator` devolve um resultado, não lança exceção — rejeição de uma resposta gerada é um resultado de negócio ESPERADO (ex.: resposta vazia, resposta longa demais, resposta contendo um padrão bloqueado), não uma condição excepcional:
```ts
type ReplyValidationResult =
  | { valid: true; sanitized: string }
  | { valid: false; reason: string };
```

### 2.4 Auditoria/billing — entidade `AiInteraction`

Novo bounded context `services/ai/`, entidade append-only (mesmo padrão de `WhatsAppSessionEvent`, ADR #49 — log de auditoria, nunca sobrescrito). Gravada em **toda tentativa**, sucesso ou falha — para billing/auditoria de verdade, uma chamada que falhou depois de consumir tokens (ex.: erro de rede após a Anthropic já ter processado) ainda deve ser rastreável.

```ts
interface AiInteraction {
  id: string;
  tenantId: string;
  conversationId: string;      // string simples, NÃO uma FK Prisma — ver justificativa abaixo
  messageId?: string;          // id da Message outbound gerada, se houve uma
  provider: AiProviderName;    // enum, mesmo racional do F6/ADR #15
  model: string;                // string livre — nomes de modelo mudam com frequência (mesmo racional já usado para não enumerar WhatsAppDisconnectReason)
  promptVersion: string;        // ver §2.6 (PromptVersion)
  tokensInput: number;
  tokensOutput: number;
  costUsd: Decimal;             // ver §2.7 — NUNCA float
  latencyMs: number;
  status: 'success' | 'validation_rejected' | 'provider_error' | 'timeout';
  errorMessage?: string;
  createdAt: Date;
}
```

**Por que `conversationId`/`messageId` são strings simples, não relações Prisma (`@relation`)**: mesmo racional já estabelecido DUAS vezes neste projeto — `TenantCredential` sem FK para `WhatsAppSession` (ADR #21) e `WhatsAppSessionEvent` chaveado por `tenantId`+`sessionName`, não `sessionId` (ADR #49) — um log de auditoria/billing deve sobreviver à exclusão da coisa que audita. Se uma `Conversation` for um dia apagada (retenção de dados, LGPD), o registro de quanto custou processá-la não deveria desaparecer junto. FK única real: `tenantId` → `Tenant`, com `onDelete: Cascade` (mesmo padrão de todo o resto do schema).

Repositório: `AiInteractionRepository` (port, só `record()` + `listByTenant()`/`sumCostByTenant()` para consultas futuras de billing) + `PrismaAiInteractionRepository` (Infrastructure).

### 2.5 Onde o worker do BullMQ roda — DECISÃO A CONFIRMAR

| Alternativa | Descrição | Prós | Contras |
|---|---|---|---|
| **A — Mesmo processo do `apps/api`** | O worker BullMQ é inicializado dentro de `index.ts`, no mesmo processo Node que serve HTTP. | Zero infraestrutura nova de deploy; um só `Dockerfile`/serviço. | Acopla a capacidade de responder a mensagens de IA à capacidade de servir requisições HTTP — não escala independentemente; um pico de geração de IA (lenta, CPU/I/O-bound esperando a Anthropic) compete por recursos do mesmo processo que atende `GET /health`, WhatsApp, etc. Contradiz diretamente o objetivo declarado desta revisão ("evitar refatorações futuras" para escala). |
| **B — Processo separado (`apps/api/src/worker.ts`), RECOMENDADA** | Novo entrypoint, mesmo `Dockerfile`/imagem (build único), CMD diferente; novo serviço `worker` em `docker-compose.yml`, reaproveitando a mesma imagem já buildada da API (`depends_on: postgres, redis`). Composition root compartilhado (`compositionRoot.ts` já existente, mais um `createConversationsComposition()`/`createAiComposition()` novos) — nenhuma duplicação de wiring. | Escala independente (mais réplicas do worker sem replicar a API, ou vice-versa) — exatamente o tipo de decisão que evita retrabalho quando o tráfego crescer. Uma falha/crash do worker não derruba a API HTTP. | Mais uma peça para operar/monitorar (mas o `docker-compose.yml` já tem o padrão de múltiplos serviços — `postgres`/`redis`/`api`/`dashboard` — um quinto serviço não é uma mudança estrutural, é o MESMO padrão aplicado mais uma vez). |

**Recomendação**: **B**. É literalmente o cenário que a pergunta do usuário descreve ("evoluirá para um SaaS multi-tenant de larga escala... evitando refatorações futuras") — a alternativa A funcionaria para o MVP, mas exigiria exatamente o tipo de refatoração (separar processo depois) que esta rodada de planejamento existe para evitar.

**DECIDIDO (ADR #54)**: confirmado **B** — worker em processo separado. A decisão que faltava (como o worker, sem acesso aos sockets, entrega a resposta gerada ao WhatsApp) foi resolvida por revisão arquitetural dedicada — ver §2.8.

**Refinamento (decisão D1, levantamento arquitetural pré-Bloco 4, ADR #55)**: o worker vive em `apps/api/src/worker.ts` — MESMO pacote/workspace de `apps/api`, não um workspace npm `apps/worker` separado, como este documento sugeria de forma ambígua nesta seção (a ambiguidade textual em si foi um achado da revisão pré-Bloco 4: outras seções deste documento — §2.8/§3-Bloco4 — já tratavam `apps/worker` como se fosse um pacote distinto). Reaproveita diretamente `services/ai/`/`services/conversations/` já existentes, sem exigir um novo workspace `packages/` compartilhado. Continua subindo como PROCESSO Node separado do `index.ts` — a separação de processo (o ponto que importa para escala independente) não mudou, só a localização física no monorepo.

### 2.8 Envio outbound e posse de socket — ADR #54 (DECIDIDO)

Precisa de uma resposta explícita porque o `WhatsAppConnectionRegistry` (`apps/api/src/services/whatsapp/application/WhatsAppConnectionRegistry.ts`) é um `Map` **em memória, por processo** — os sockets Baileys vivos existem exclusivamente dentro do processo `apps/api`. Se o worker (§2.5-B, processo separado) chamasse `WhatsAppConnectionRegistry.getOrCreate()`/`WhatsAppProvider.sendMessage()` diretamente, estaria criando uma instância **nova** de `SessionManager`/`BaileysProvider` no seu próprio processo — cujo `connect()` abriria um **segundo socket Baileys para o mesmo número**, já conectado no processo da API. Mesma classe de risco já registrada, para múltiplos pods, na ADR #16 (Deferred) — só que aqui seria garantida, não hipotética, e já em instância única.

**Decisão (ADR #54, Accepted)** — Alternativa A entre as três avaliadas (worker publica comandos outbound / coordenação distribuída de posse via lease-lock / worker no mesmo processo da API):

1. `apps/worker` **nunca** importa, instancia ou depende de `WhatsAppConnectionRegistry`, `WhatsAppProvider` ou qualquer implementação concreta de socket. Sua única saída para o canal WhatsApp é o novo port `OutboundMessageDispatcher` (`services/whatsapp/domain/`) — publica um comando `{ tenantId, sessionName, conversationId, messageId, content, idempotencyKey }`, sem saber quem o atende.
2. `OutboundMessageDispatcher` é implementado via uma nova fila BullMQ, **`whatsapp-outbound`** (`BullMqOutboundMessageDispatcher`, Infrastructure) — mesmo padrão porta+adapter já usado para `AiReplyScheduler`.
3. `apps/api` — único processo dono dos sockets — ganha um novo componente, **`OutboundCommandConsumer`** (Infrastructure de `services/whatsapp`, instanciado DENTRO do processo `apps/api`, nunca em `apps/worker`), que consome `whatsapp-outbound`, resolve a sessão via `Registry.getOrCreate()` (seguro aqui — mesmo processo dono do socket) e chama `WhatsAppProvider.sendMessage()`.
4. `ConversationAiService`/o worker de IA dependem só de `OutboundMessageDispatcher` — nenhuma mudança adicional de contrato em `WhatsAppProvider`/`SessionManager`/`Registry`, além do `sendMessage()` já previsto no Bloco 1 e de um novo método de envio em `SessionManager` (ver Bloco 4) que `OutboundCommandConsumer` chama em vez de tocar o `provider` diretamente — mantém a mesma encapsulação que já existe hoje (Router/Service nunca tocam `provider`, só `SessionManager`).
5. Coordenação distribuída de posse de socket entre múltiplas réplicas de `apps/api` (a alternativa de lease/lock) permanece fora do escopo desta milestone (ADR #16, Deferred) — mas o desenho acima é composicional com ela: quando for implementada, encaixa-se **atrás** do mesmo `OutboundCommandConsumer`, sem tocar `apps/worker` nem os contextos `ai`/`conversations`.
6. A alternativa "worker no mesmo processo da API" foi avaliada e rejeitada: resolveria o bloqueador, mas reacopla permanentemente a escala de geração de IA à escala de conectividade WhatsApp — o oposto do objetivo desta revisão.

Diagrama de componentes resultante:

```
┌─────────────── apps/api (único dono dos sockets) ───────────────┐      ┌────────── apps/worker ──────────┐
│ HTTP Router → WhatsAppSessionService → Registry → SessionManager│      │ BullMQ Worker "ai-reply"          │
│                                              │                  │      │        │                          │
│                                              └──► BaileysProvider (socket) │        └──► ConversationAiService │
│                                                        ▲          │      │                 │                │
│  OutboundCommandConsumer ──consome "whatsapp-outbound"─┘          │      │                 └──► AiProvider   │
└───────────────────────────▲───────────────────────────────────────┘      └────────────────┬────────────────┘
                             │                                                                │
                             └──────────────────── fila BullMQ "whatsapp-outbound" ◄───────────┘
                                    (worker nunca acessa Registry/WhatsAppProvider)
```

Sequence diagram resultante (substitui qualquer fluxo anterior que mostrasse o worker chamando `sendMessage()` diretamente):

```
Contato → BaileysProvider → SessionManager → MessageIngestion → [fila ai-reply] → Worker(ai) → ConversationAiService → AiProvider(Claude)
                                                                                      │
                                                                                      ▼ (se validado)
                                                                     OutboundMessageDispatcher.dispatch(comando)
                                                                                      │
                                                                                      ▼
                                                                    [fila whatsapp-outbound]
                                                                                      │
                                                                                      ▼
                                                              OutboundCommandConsumer (dentro de apps/api)
                                                                                      │
                                                              Registry.getOrCreate() (mesmo processo, socket já vivo)
                                                                                      │
                                                                          SessionManager.sendMessage() → BaileysProvider
```

**Achado aberto, registrado para o Bloco 4 (não bloqueia o Bloco 1)**: `OutboundCommandConsumer` depende de a sessão já estar viva no `Registry` de `apps/api`. Se a API reiniciou e nenhuma chamada HTTP reconectou a sessão ainda (P3 — bootstrap/recuperação pós-restart, Architecture Review original, ainda Deferred), `getOrCreate()` devolve um `SessionManager` cujo provider nunca chamou `connect()` — o envio falharia sobre um socket inexistente. Decisão necessária antes do Bloco 4: reconectar on-demand dentro do consumer, ou falhar o job (retry) até a sessão ser reconectada por outro caminho.

**RESOLVIDO (decisão D4, levantamento arquitetural pré-Bloco 4, ADR #55)**: `OutboundCommandConsumer` FALHA o job — nunca reconecta on-demand. Implementado "de graça": `consume()` só chama `registry.getOrCreate()` (pooling puro, sem `connect()`) + `sessionManager.sendMessage()`, que naturalmente lança `WhatsAppNotConnectedError` se o provider nunca conectou nesta instância de processo, deixando o BullMQ reter/reprocessar via retry/backoff nativo. P3 continua Deferred como risco de infraestrutura — não resolvido, só contido (o job falha de forma visível/logada, em vez de tentar mascarar com uma reconexão que poderia interagir mal com o ciclo de vida do `SessionManager`).

**RESOLVIDO (decisão D2, mesma revisão)**: chave de idempotência do comando outbound = `aiInteractionId` (usado como `jobId` nativo do BullMQ na fila `whatsapp-outbound`).

**RESOLVIDO (decisão D3, mesma revisão)**: a `Message` outbound é criada só DEPOIS do envio ter sucesso — `OutboundMessageCommand` não carrega `messageId` (não existe ainda no momento do despacho), carrega `aiInteractionId` em seu lugar. Ver ADR #55 para o detalhe completo das quatro decisões (D1–D4) e para a simplificação resultante do payload de `OutboundMessageCommand` frente ao esboço original desta seção.

### 2.6 Versionamento de prompts — `PromptVersion` — DECISÃO A CONFIRMAR

| Alternativa | Descrição | Prós | Contras |
|---|---|---|---|
| **A — Registro em código (RECOMENDADA)** | `PromptVersion` é um tipo Domain (`{ id: string; systemPrompt: string; createdAt: string }`) + um registro estático (`PROMPT_VERSIONS: Record<string, PromptVersion>`, ex.: `{ 'v1': { ... } }`) versionado junto com o código-fonte (git). `PromptBuilder` recebe o id da versão ATIVA via config/env (`AI_PROMPT_VERSION=v1`, default). | Zero infraestrutura nova; revisão de prompt passa por PR/code review como qualquer mudança de comportamento (rastreável no histórico do git); consistente com como `WhatsAppDisconnectReason`/`AiProviderName` já são uniões fechadas em código, não tabelas. | Trocar de prompt exige deploy (aceitável — é exatamente o mesmo custo de qualquer mudança de comportamento do sistema hoje). |
| **B — Tabela no Postgres** | `PromptVersion` vira um model Prisma, editável em runtime (via uma futura tela de admin). | Permite trocar/testar prompts sem deploy; abre caminho para A/B testing de prompts no futuro. | Infraestrutura para um requisito que NINGUÉM pediu ainda (edição de prompt em runtime não está no escopo desta milestone nem foi mencionado pelo usuário) — violaria YAGNI construir a tabela+CRUD+tela agora. |

**Recomendação**: **A**. `AiInteraction.promptVersion` grava o id (`'v1'`) independentemente de onde a versão "mora" — migrar de A para B no futuro é aditivo (criar a tabela, popular com o conteúdo que já existe em código, trocar de onde `PromptBuilder` lê) e NÃO exige mudar o schema de `AiInteraction` nem nenhum consumidor existente. Ou seja: a decisão A-agora-B-depois não é uma dívida técnica que force refatoração — é uma sequência natural, cada etapa aditiva.

### 2.7 Representação de custo monetário — DECISÃO A CONFIRMAR (mas com recomendação forte)

**Nunca `Float`/`number` para dinheiro** — é um erro de correção conhecido (arredondamento binário de ponto flutuante não representa frações decimais exatas; `0.1 + 0.2 !== 0.3` em ponto flutuante). Duas alternativas corretas:

| Alternativa | Descrição | Prós | Contras |
|---|---|---|---|
| **A — `Decimal` do Prisma (RECOMENDADA)** | Campo `costUsd Decimal @db.Decimal(12, 8)` (8 casas decimais — custo por token costuma ser frações de centavo). | Tipo nativo do Postgres (`NUMERIC`) para dinheiro, sem conversão manual; Prisma Client expõe `Decimal.js`, aritmética segura pronta. | Precisa de `Decimal.js` (já vem com `@prisma/client`, sem dependência nova) — só cuidado extra ao somar/serializar para JSON (não é `JSON.stringify`-safe direto, precisa `.toString()`). |
| **B — Inteiro em micro-dólares (`costMicroUsd BigInt`)** | Custo armazenado como inteiro (1 USD = 1.000.000 micro-USD), mesmo padrão usado por APIs de billing de nuvem (GCP, AWS Cost Explorer). | Aritmética inteira, zero ambiguidade, `BigInt` nativo do JS. | Toda leitura precisa converter (`/1_000_000`) para exibir; menos "auto-explicativo" que `Decimal`. |

**Recomendação**: **A**, por ser o padrão mais direto do ecossistema Prisma/Postgres para valores monetários, e por não introduzir uma convenção numérica customizada (micro-unidades) que precisaria ser documentada e lembrada em todo lugar que ler o campo.

---

## 3. Divisão em Blocos (revisada)

Mesma disciplina de entrega da Revisão 1 e das Milestones 1/2: cada bloco = implementação + testes + autoauditoria + validação (`tsc`, `npm test`, `npm run lint`, `next build` quando aplicável) + documentação (`DECISIONS.md`/`PROJECT_STATUS.md`) antes do próximo.

### Bloco 1 — Extensão mínima de `services/whatsapp/` (inbound + outbound de protocolo)
*(inalterado da Revisão 1)* `WhatsAppProviderEvent` +`message_received`; `WhatsAppProvider` +`sendMessage()`; `BaileysProvider` implementa ambos com os filtros de `fromMe`/grupo; `SessionManager` ganha dependência opcional `MessageReceivedHandler`.
**Achado registrado (não bloqueia este Bloco, revisar durante a implementação)**: `WhatsAppProvider.onEvent` aceita hoje **um único listener** (substitui, não acumula — decisão original YAGNI). `SessionManager` já é esse único assinante para `status_changed`; com `message_received`, `SessionManager` passa a ter duas razões para existir no caminho do evento (ciclo de vida da sessão + repasse de mensagens à ingestão). Funciona por construção (repasse interno ao `MessageReceivedHandler` injetado), mas é um ponto de atenção de SRP a reavaliar se um terceiro tipo de evento (`presence_updated`, `qr_updated`) precisar de outro consumidor.
**Estimativa**: ~5 arquivos modificados + 1 port novo + ~4 testes.

### Bloco 2 — Domain de Conversas (`services/conversations/`)
`Conversation`/`Message` (entidades), `ConversationRepository`/`MessageRepository` (ports+Prisma), `MessageIngestionService implements MessageReceivedHandler` — persiste a mensagem inbound e, ao final, chama um novo port pequeno `AiReplyScheduler.schedule(tenantId, conversationId, messageId)` (implementado de verdade só no Bloco 4 — no Bloco 2, um Fake/no-op basta para os testes). Isto mantém Bloco 2 sem qualquer conhecimento de BullMQ.
**Estimativa**: ~13 arquivos novos (2 entidades, 2 ports+2 impls Prisma, 1 service, 1 port `AiReplyScheduler`, 1 migration, ~5 testes).

### Bloco 3a — Abstração de IA: provider, prompt, validação (`services/ai/`)
`AiProvider` (port), `AiProviderName`, `AiProviderFactory` (port+impl), `ClaudeAiProvider`, `FakeAiProvider`, `PromptBuilder`, `PromptVersion` (registro em código, §2.6-A), `ReplyValidator`. **Nenhuma persistência ainda** — só as peças de geração/validação, testáveis isoladamente com `FakeAiProvider`.
**Estimativa**: ~11 arquivos novos (2 ports, 1 factory+impl, 2 providers, 1 prompt builder, 1 registro de versões, 1 validator, ~5 testes).

### Bloco 3b — Auditoria/billing: `AiInteraction` + `ConversationAiService`
`AiInteraction` (entidade), `AiInteractionRepository` (port+Prisma, `Decimal` para custo — §2.7), `ConversationAiService` (orquestrador — junta Bloco 3a inteiro + grava `AiInteraction` a cada tentativa, sucesso ou falha). Ainda SEM fila — `ConversationAiService` é chamado direto nos testes deste bloco.
**Estimativa**: ~8 arquivos novos (1 entidade, 1 port+1 impl Prisma, 1 service, 1 migration, ~4 testes).

### Bloco 4 — Fila BullMQ `ai-reply` (produtor + worker) + fila BullMQ `whatsapp-outbound` (ADR #54) — ✅ Concluído (ver ADR #55/#56, PROJECT_STATUS.md §25)
- `AiReplyScheduler` (Bloco 2) implementado de verdade via BullMQ (`BullMqAiReplyScheduler`, produtor — só enfileira `{ tenantId, conversationId, messageId }`).
- Worker de IA (`apps/worker`, processo separado — ver §2.5-B/ADR #54): consome a fila `ai-reply`, RE-CHECA `conversation.shouldAutoRespond()` no momento de processar (não só ao enfileirar), chama `ConversationAiService`. **Nunca** importa `WhatsAppConnectionRegistry`/`WhatsAppProvider`/qualquer implementação concreta de socket (ADR #54, decisão 1) — se a resposta for validada, publica um comando via `OutboundMessageDispatcher.dispatch(...)`, sem saber quem o atenderá.
- `OutboundMessageDispatcher` (novo port, Domain de `services/whatsapp`) implementado via BullMQ (`BullMqOutboundMessageDispatcher`, produtor — enfileira `{ tenantId, sessionName, conversationId, messageId, content, idempotencyKey }` na nova fila **`whatsapp-outbound`**) — ADR #54, decisão 2.
- `OutboundCommandConsumer` (novo componente, Infrastructure de `services/whatsapp`, instanciado DENTRO do processo `apps/api` — nunca em `apps/worker`): consome `whatsapp-outbound`, resolve a sessão via `WhatsAppConnectionRegistry.getOrCreate()` (seguro aqui — mesmo processo dono do socket) e envia através de um novo método de `SessionManager` (ex.: `sendMessage(content)`, delegando a `provider.sendMessage()`, sem parâmetro de identidade — consistente com a restrição da ADR #29) — ADR #54, decisão 3/achado técnico.
- `docker-compose.yml`: novo serviço `worker` (processo separado, `depends_on: postgres, redis`). `apps/api` passa a rodar dois papéis internos no mesmo processo: servidor HTTP + `OutboundCommandConsumer` (não é um terceiro artefato de deploy).
- Novas dependências: `bullmq`, `@anthropic-ai/sdk` (se ainda não adicionada no Bloco 3a).
- **Decisão pendente antes deste bloco (ver §2.8, achado aberto)**: comportamento de `OutboundCommandConsumer` quando a sessão ainda não está viva no `Registry` deste processo (P3, bootstrap pós-restart) — reconectar on-demand ou falhar o job com retry.
- **Decisão pendente antes deste bloco**: chave de idempotência do comando outbound (evitar reenvio em retry do BullMQ).
**Estimativa**: ~12 arquivos (produtor `ai-reply`, worker de IA, produtor `whatsapp-outbound`, `OutboundCommandConsumer`, novo método em `SessionManager`, wiring em `apps/api`, config de filas, `docker-compose.yml`, `Dockerfile` ajustado ou novo, ~6 testes incluindo Fakes de ambas as filas).

### Bloco 5 — Endpoints REST + composition root — ✅ Concluído (ver ADR #57, PROJECT_STATUS.md §26)
Rotas (reaproveitando `requireApiKey`, agora movido para `shared/presentation/`): `GET .../conversations`, `GET .../conversations/:id/messages`, `POST .../conversations/:id/escalate`, `POST .../conversations/:id/resume`, `GET .../ai-interactions?conversationId=` (parâmetro opcional — D13). Composition roots novos `createConversationsComposition` (D6) e `createAiComposition` (D15), consumidos por `index.ts` na ordem `ai` → `conversations` → `whatsapp` → consumidor outbound → routers (D15). `WhatsAppConnectionRegistry`/`createWhatsAppSessionsComposition` ganharam um `messageReceivedHandler` opcional (D5, exceção formal aditiva à ADR #45), fechando o pipeline inbound de ponta a ponta. Consumidor de `whatsapp-outbound` (`createOutboundCommandConsumerWorker`, D7) passou a rodar de fato dentro de `apps/api`, reaproveitando a mesma instância de `Registry` (não um segundo pool). `REDIS_URL` ausente degrada graciosamente, mantendo só as rotas de `whatsapp-sessions` (D8). Bug pré-existente de `TenantNotFoundError` nunca mapeado em `whatsAppErrorHandler` corrigido (D14); todos os error handlers passaram a ser montados escopados por path, corrigindo um risco real de encadeamento que engoliria erros de bounded contexts vizinhos (D17, com teste de regressão dedicado). `index.ts` ganhou seu primeiro shutdown gracioso (`SIGTERM`/`SIGINT`).
**Entregue**: 73 suítes / 510 testes (todos verdes), lint limpo em `apps/api`, `tsc` mostrando só a corrupção pré-existente do Prisma Client no sandbox (ADR #56), sem impacto em runtime. D11 (paginação por cursor) e D13 (`conversationId` opcional) resolvidos por iniciativa própria a partir da recomendação técnica já registrada — ver nota na ADR #57 para revisitar se a escolha de produto divergir.

### Bloco 6 — UI de Conversas/IA no Dashboard — ✅ Concluído (ver ADR #58, PROJECT_STATUS.md §27, `BLOCO_6_LEVANTAMENTO_ARQUITETURAL.md`)
Decisões D20–D34 aprovadas e implementadas integralmente, escopo estritamente frontend (`apps/dashboard`) — **zero alterações em `apps/api`**. Entregue: `createApiClient(resource)` (D21, `callApi` preservado sem quebra); 6 rotas BFF novas espelhando `pages/api/sessions/*` (D22); lista de conversas com primeira página viva via SSE + "Carregar mais" por cursor + filtro `bot`/`human` no servidor (D23/D24/D25); detalhe com timeline (selo "Gerada por IA" por correlação `messageId`, D27), ações de escalonar/retomar com banner inline (D31) e painel de AI Interactions embutido (D28); link "Conversas" no Sidebar + token `primary` no Tailwind (D30/D34). Limitação documentada (D26): timeline não marca o ponto de escalonamento (sem `ConversationStatusEvent` no backend). Achado registrado para bloco futuro de backend: falta `GET .../conversations/:id` — detalhe localizado via varredura paginada da listagem (até ~1000 conversas mais recentes).
**Entregue**: 80 suítes / 536 testes (26 casos novos — rotas BFF + lógica pura, D29: sem jsdom), lint/tsc limpos. `next build` completo pendente de confirmação na máquina real (compile webpack excede o teto de execução do sandbox — mesma situação da M2, ADRs #50/#51).

---

## 4. Impacto por Camada (revisado)

| Camada | Impacto |
|---|---|
| **Domain** | 2 bounded contexts novos (`conversations`, `ai`); `services/ai/domain` ganha `AiProvider`, `AiProviderFactory`, `AiProviderName`, `ReplyValidator`, `AiInteraction`, `AiInteractionRepository`, `PromptVersion`. `services/whatsapp/domain` ganha 1 membro de união, 1 método de port (`sendMessage()`, aditivo) e o novo port `OutboundMessageDispatcher` (ADR #54). |
| **Application** | `MessageIngestionService`, `PromptBuilder`, `ConversationAiService` (orquestrador fino, não monolítico). `SessionManager` ganha 1 dependência opcional (mesma técnica de M2) + 1 novo método de envio sem parâmetro de identidade (ADR #54, consistente com a ADR #29). |
| **Infrastructure** | `PrismaConversationRepository`/`PrismaMessageRepository`/`PrismaAiInteractionRepository`, `ClaudeAiProvider`, `BullMqAiReplyScheduler` + worker novo. `BaileysProvider` ganha 2 capacidades (receber, enviar). |
| **Presentation** | 5 rotas REST novas (Bloco 5, incluindo consulta de `AiInteraction` para billing/auditoria); BFF+UI opcionais (Bloco 6). |
| **Banco de dados** | 3 models novos (`Conversation`, `Message`, `AiInteraction`) na seção WhatsApp Connectivity do `prisma/schema.prisma`; `costUsd` como `Decimal`, nunca `Float`. Sem tocar a seção legada (ADR #11). |
| **Infraestrutura de deploy** | Redis passa de "provisionado, não usado" para "dependência real". **Novo serviço `worker`** em `docker-compose.yml` (processo separado da API — §2.5), que **nunca** acessa sockets Baileys (ADR #54). `apps/api` ganha um segundo papel interno (`OutboundCommandConsumer`), sem novo artefato de deploy. Duas filas BullMQ: `ai-reply` (inbound → IA) e `whatsapp-outbound` (IA → envio, ADR #54). Novas dependências: `bullmq`, `@anthropic-ai/sdk`. |

---

## 5. Riscos (revisado)

*(riscos da Revisão 1 continuam válidos — reproduzidos + novos desta revisão)*

- **Latência/custo de chamadas à Anthropic**: mitigado estruturalmente pelo BullMQ (retry/backoff nativos) — risco rebaixado em relação à Revisão 1, que dependia de tratamento manual no caminho síncrono.
- **Qualidade/alucinação da resposta**: `ReplyValidator` (§2.3) é a barreira estrutural para isto — mas guardrails sofisticados (moderação de conteúdo) continuam fora do escopo do MVP.
- **`messages.upsert` ruidoso**: filtro de `fromMe`/grupo no Bloco 1, antes de qualquer coisa tocar `services/conversations/`.
- **Colisão de nomenclatura com o domínio legado**: `Conversation`/`Message` — mapear com `@@map` explícito no Bloco 2.
- **(Novo) Job na fila processado depois que a conversa já foi escalonada**: mitigado pela re-checagem de `shouldAutoRespond()` DENTRO do worker (Bloco 4), não só ao enfileirar — sem isso, uma escalada feita enquanto um job está "em voo" seria ignorada.
- **(Novo) Fila sem observabilidade vira uma caixa-preta**: jobs travados/falhando silenciosamente = mensagens nunca respondidas, sem nenhum sintoma óbvio. Fora do escopo desta milestone implementar um dashboard de fila completo, mas o Bloco 4 deve, no mínimo, logar falhas terminais (`job.failed` do BullMQ) via o `Logger` port já existente — mesmo padrão usado em toda a Milestone 1/2.
- **(Novo) Drift entre `PromptVersion` em código e o que está de fato em produção**: mitigado por a versão ativa vir de env var (`AI_PROMPT_VERSION`) explícita, nunca implícita — visível em qualquer inspeção de configuração do deploy.
- **(Novo) Consistência entre múltiplos `AiProvider` no futuro**: cada provider tem formatos de erro/limite de tokens/nomes de modelo diferentes — `AiProvider.generateReply()` (§2.2) já normaliza o retorno para um formato único (`AiGenerationResult`), então esse risco fica contido na implementação de CADA provider, nunca vaza para `ConversationAiService`/`PromptBuilder`.
- **Falta de rate-limiting/anti-abuso**: mesmo risco da Revisão 1, ainda fora de escopo — registrado para acompanhamento antes de produção com tráfego real.
- **(Novo, ADR #54) Regressão silenciosa da fronteira `apps/worker` ↔ sockets**: nada além de disciplina de code review impede hoje que um import futuro de `WhatsAppConnectionRegistry`/`WhatsAppProvider` seja adicionado a `apps/worker` por engano. Recomenda-se uma regra de arquitetura automatizada (ex.: `dependency-cruiser` ou equivalente) antes ou durante o Bloco 4, não apenas revisão manual.
- **(Novo, achado da revisão que originou a ADR #54) Bootstrap/recuperação de sessão pós-restart (P3) agora afeta entrega de mensagens, não só UI de status**: ver §2.8, achado aberto — decisão necessária antes do Bloco 4, não bloqueia o Bloco 1.
- **(Novo, ADR #54) Idempotência do comando outbound**: sem uma chave de dedup, um retry do BullMQ na fila `whatsapp-outbound` pode reenviar a mesma mensagem ao contato — decisão necessária antes do Bloco 4.

---

## 6. Critérios de Aceite (revisado)

*(critérios da Revisão 1 continuam válidos + novos abaixo)*

- [ ] Toda geração de resposta de IA passa pela fila `ai-reply` (BullMQ) — nenhum caminho síncrono existe no código.
- [ ] Trocar de provider de IA (ex.: Claude → um `OpenAiProvider` hipotético futuro) não exige alterar `ConversationAiService`, `PromptBuilder`, `ReplyValidator` nem `AiInteractionRepository` — só uma nova classe de Infrastructure + uma entrada na factory.
- [ ] `AiInteraction` é gravada em TODA tentativa (sucesso, validação rejeitada, erro do provider, timeout) — nunca só nos sucessos.
- [ ] `AiInteraction.costUsd` é `Decimal`, nunca `number`/`Float`, em nenhum ponto do código (Domain, Application, Infrastructure, serialização de API).
- [ ] Um job de IA processado APÓS a conversa ter sido escalonada não envia nenhuma mensagem (re-checagem dentro do worker, não só ao enfileirar).
- [ ] `ReplyValidator` rejeita (sem lançar exceção) uma resposta vazia ou acima de um limite de tamanho configurável.
- [ ] `PromptVersion` ativa é registrada em `AiInteraction.promptVersion` em toda interação.
- [ ] Falha da API da Anthropic (timeout/erro) não derruba o worker nem perde o job (retry do BullMQ) nem perde a mensagem inbound original (já persistida antes de qualquer chamada de IA).
- [ ] Zero regressão nos 348 testes/contratos já existentes (`services/whatsapp/`, Milestone 2).
- [ ] `tsc --noEmit`, `npm test`, `npm run lint`, `prisma generate`/`migrate`, `next build` (quando aplicável) limpos ao final de CADA bloco — não só ao final da milestone inteira.
- [ ] **(ADR #54)** Nenhum arquivo de `apps/worker` importa, direta ou indiretamente, `WhatsAppConnectionRegistry`, `WhatsAppProvider` ou qualquer implementação concreta de socket.
- [ ] **(ADR #54)** Todo envio de mensagem outbound gerado pela IA passa pela fila `whatsapp-outbound` e é atendido exclusivamente pelo `OutboundCommandConsumer` dentro do processo `apps/api` — nenhum caminho alternativo de envio existe no código.

---

## 7. Próximos Passos (aprovação necessária antes de qualquer código)

Decisões que dependem de confirmação explícita antes do Bloco 1 começar:

0. **§2.8 — propriedade de socket e envio outbound**: ✅ **RESOLVIDA — ADR #54 (Accepted)**. Worker publica comandos via `OutboundMessageDispatcher`/fila `whatsapp-outbound`; `apps/api` consome via `OutboundCommandConsumer`. Dois achados abertos (idempotência do comando; comportamento do consumer quando a sessão não está viva no processo) permanecem pendentes de decisão antes do **Bloco 4** especificamente — não bloqueiam o Bloco 1.
1. **§2.5 — topologia do worker**: processo separado (RECOMENDADO, confirmado pela ADR #54) vs. mesmo processo do `apps/api`. **Resolvida**: processo separado.
2. **§2.6 — armazenamento de `PromptVersion`**: registro em código (RECOMENDADO) vs. tabela no Postgres desde já.
3. **§2.7 — tipo do campo de custo**: `Decimal` (RECOMENDADO) vs. inteiro em micro-dólares.
4. **Confirmar dependências novas**: `bullmq`, `@anthropic-ai/sdk` em `apps/api/package.json`/`apps/worker` — a segunda envolve uma chave de API paga/com custo real por chamada.
5. Aprovação para iniciar o Bloco 1 assim que os pontos acima forem confirmados. Ordem de execução proposta: 1 → 2 → 3a → 3b → 4 (inclui §2.8/ADR #54) → 5 → (6, entrega separada).

---

*Este documento é a referência de arquitetura da Milestone 3. A ADR #54 (propriedade de socket e envio outbound) já foi incorporada a `DECISIONS.md`. Novas decisões tomadas durante a implementação devem ser registradas ali (numeração a partir da ADR #55) e o progresso, em `PROJECT_STATUS.md`, seguindo exatamente o padrão já estabelecido nas Milestones 1 e 2.*
