# PROJECT_STATUS.md

> Documento de memória permanente do projeto. Deve ser atualizado ao final de cada milestone/item.
> Última atualização: 2026-07-09 — **ADR #54 (Accepted) incorporada: bloqueador estrutural da Milestone 3 (worker BullMQ separado abriria um segundo socket Baileys para a mesma sessão) resolvido por revisão arquitetural dedicada, ANTES do início de qualquer código do Bloco 1. Ver §24.**
>
> Histórico anterior: Milestone 2 (Dashboard de Gestão de Sessões WhatsApp — redefinição do roadmap, ver ADR #52) CONCLUÍDA: Fases 1–4 (backend REST, histórico de eventos, BFF, UI) implementadas e validadas (§22 — 348/348 testes, 47 suítes, `tsc`/`next build` limpos). Auditoria de estabilização pós-M2 concluída (§23): 4 correções de tooling sem mudança de contrato público (ver ADR #53), incluindo `npm run lint` — que estava completamente quebrado desde o scaffold da Milestone 0 e nunca havia sido executado com sucesso nesta sessão. Ver DECISIONS.md ADRs #48–#53 para o detalhe arquitetural completo.
>
> Histórico anterior (2026-07-08): Item 5 (endpoints REST de sessão, Blocos 1–8) concluído (§19). Production Hardening (Blocos 1–8b: multi-tenant real via API key, IDOR/C1 fechado, classificação de motivo de desconexão, reconexão com backoff+circuit breaker) concluído e validado (§20 — 28/28 suítes, 224/224 testes, `tsc`/`prisma generate` limpos). Auditoria final de encerramento em §21 (Bloco 9). Ver DECISIONS.md ADRs #33–#47.
>
> Histórico anterior (2026-07-06/07): auditoria adversarial independente (§12) encontrou 4 bugs reais (BUG-01 a BUG-04) — corrigidos (§13, ADR #23). Item 4 implementado (§14, ADR #24). Revisão Item 4 + integração encontrou P6 — corrigido (§15, ADR #25). Auditoria de INTEGRAÇÃO (cadeia completa) encontrou 10 achados (BUG-12 a BUG-21); 2 de gravidade Alta (BUG-12, BUG-13) — corrigidos (§16, ADR #26). Ambiente estabilizado e validado por ferramenta real pela primeira vez (§17–§18, ADR #27/#28).

---

## 1. Resumo do Projeto

**WhatsApp Automation Platform** — plataforma de automação inteligente para WhatsApp que funciona como um CRM com IA, ajudando PMEs a prospectar, atender e nutrir leads via WhatsApp com automação e intervenção humana quando necessário. Visão de longo prazo: evoluir de aplicação local para **SaaS multi-tenant**.

---

## 2. Arquitetura

- **Clean Architecture** em 4 camadas: Presentation → Application → Domain → Infrastructure.
- **Monorepo com npm workspaces**: `apps/dashboard` (frontend) e `apps/api` (backend).
- **Novo nesta sessão**: o port `WhatsAppProvider` (contrato que a Application usa para falar com qualquer provedor de WhatsApp) agora vive em `domain/providers/`, corrigindo uma violação de dependência que existia antes (`SessionManager`, da Application, importava de `infrastructure/`, que é uma camada mais externa — a direção certa é o contrário).

---

## 2.1. Decisão Arquitetural — Consolidação Adiada (ADR #11)

Uma auditoria de integração encontrou uma segunda árvore de código (`src/`, `tests/`, `specs/M003-Conversations.md`, com `prisma/schema.prisma` próprio) implementando um domínio de Conversas WhatsApp, completamente isolada da arquitetura oficial e nunca referenciada no `ROADMAP.md`. Confirmou-se, por busca cruzada de referências, **zero dependência de código** entre essa árvore e a Milestone 1.

**Decisão** (ver `DECISIONS.md` ADR #11): a migração desse domínio foi **adiada para depois da conclusão da Milestone 1**. `src/` passa a ser tratado como **código legado, apenas como referência técnica**. A arquitetura oficial continua sendo exclusivamente `apps/api` + `apps/dashboard`. Regras em vigor durante a M1: não mover arquivos de `src/`; não alterar `specs/M003`; não modificar a seção legada de `prisma/schema.prisma`; não fundir as arquiteturas.

---

## 3. Milestone 0 — Status

Concluído para fins de desenvolvimento (ver sessões anteriores). Pendências que continuam abertas, não bloqueantes: `git init` (ação do usuário) e confirmação real de `npm install`/`lint`/`test`/`docker compose config` no ambiente do usuário.

---

## 4. Milestone 1 — WhatsApp Connectivity — Progresso

| # | Item | Status |
|---|---|---|
| 1 | Port `WhatsAppProvider` (Domain) + correção do import no `SessionManager` + testes unitários | ✅ Concluído |
| 2 | `prisma/schema.prisma` — models `Tenant` + `WhatsAppSession` (Milestone 1) | ✅ **Concluído nesta sessão** |
| 3 | `WhatsappProvider` — implementação concreta com Baileys (Infrastructure) | ✅ **Concluído nesta sessão — ver §11** |
| 4 | `WhatsAppSessionRepository` — implementação concreta com Prisma (Infrastructure) | ✅ **Concluído nesta sessão — ver §14, ADR #24** |
| 5 | Endpoints REST de sessão (`API_SPECIFICATION.md` §3.5) | ✅ **Concluído — ver §19, ADRs #33–#38** |
| 6 | Scheduler básico BullMQ | Pendente |
| 7 | UI de escaneamento de QR no dashboard | Pendente |
| 8 | Testes de integração (Baileys mockado) | ✅ **Coberto pela suíte de testes do Item 5 + Production Hardening (28/28 suítes)** |

### Por que o Item 1 foi o primeiro
Antes de escrever qualquer linha de Baileys, o `SessionManager` (Application) precisava depender de um **contrato do Domain**, não de um caminho de Infrastructure que nem existia (`../infrastructure/WhatsappProvider`, um arquivo inexistente até então). Corrigir isso primeiro: (a) resolve a violação de Dependency Inversion que já estava no código; (b) é o que efetivamente tira o `SessionManager.ts` do estado "não compila"; (c) permite testar toda a lógica de orquestração de sessão (conectar, reconectar, desconectar, status) **sem depender de Baileys nem de Prisma** — exatamente o tipo de isolamento que Clean Architecture promete. Só depois disso faz sentido escrever a implementação concreta (Item 3) ou o schema de persistência (Item 2), porque agora ambos têm um contrato estável para satisfazer.

### O que os testes cobrem
`apps/api/tests/services/whatsapp/SessionManager.test.ts` usa fakes (sem Baileys, sem Prisma, sem rede) para validar: criação de nova sessão quando não existe nenhuma; reaproveitamento de sessão já conectada (sem reconectar); reconexão quando a sessão salva não está conectada; desconexão atualizando o repositório; erro ao consultar status de sessão inexistente; status combinando dado persistido com status ao vivo do provider; delegação do QR Code ao provider.

### Observação técnica levantada durante os testes (RESOLVIDA e IMPLEMENTADA)
`SessionManager.init()` agora recebe `(tenantId, sessionName)`, busca a sessão via `repo.findByTenantAndSessionName(...)` e **reaproveita/atualiza o registro existente** ao reconectar — nunca cria duplicata. Isso respeita literalmente a constraint `@@unique([tenantId, sessionName])` do schema. Cobertura de teste nova: reconexão reaproveita o mesmo `id` (sem duplicar registro), e isolamento entre tenants com o mesmo `sessionName`.

### Revisão Arquitetural — Camada de Eventos do Provider (nova, antes do Item 3)

Ao revisar Ports/Adapters/Repositories antes de iniciar o Baileys, identifiquei uma lacuna real: `WhatsAppProvider` só expunha métodos síncronos de pull (`connect`, `getStatus`, `getQRCode`). Mas Baileys é **orientado a eventos** (`sock.ev.on('connection.update', ...)`) — QR gerado, pareamento confirmado e quedas de conexão chegam de forma assíncrona, sem que a Application tenha chamado nada. Sem um canal para isso, o `BaileysProvider` (Item 3) exigiria polling (ruim) ou forçaria uma mudança de contrato depois (exatamente o retrabalho que você pediu para evitar).

**Implementado nesta revisão:**
- `WhatsAppProviderStatusUpdate` (novo, Domain) — tipo do evento assíncrono (`status`, `phoneNumber?`).
- `WhatsAppProvider.onStatusChange(listener)` (novo método do port) — Infrastructure notifica a Application quando o estado muda sem chamada direta.
- `SessionManager.subscribeToProviderUpdates()` (novo, privado) — assina o evento logo após `init()` conectar/reconectar, e persiste as mudanças via `repo.update()`, com cuidado explícito para não apagar `connectedAt`/`phoneNumber` já conhecidos quando o evento não traz esse dado.
- `WhatsAppSessionNotFoundError` (novo, Domain) — substitui `Error` genérico em `getStatus()`, para a futura Presentation poder mapear por nome de classe (como já é feito no domínio legado de Conversations).

**Não implementado (fora de escopo, YAGNI):** suporte a múltiplos listeners simultâneos no port (`onStatusChange` substitui o listener anterior em vez de acumular) — cada `WhatsAppProvider` corresponde a exatamente um socket/sessão hoje, então um único listener é suficiente; revisitar apenas se surgir necessidade real de múltiplos consumidores.

### Item 2 — `prisma/schema.prisma` (WhatsApp Connectivity)

Adicionados ao final do arquivo, **sem alterar uma linha sequer da seção legada** (Conversations): o enum `WhatsAppSessionStatus` e os models `Tenant` e `WhatsAppSession`.

**Justificativas principais:**
- **`WhatsAppSessionStatus` com apenas 3 valores** (`CONNECTING`, `CONNECTED`, `DISCONNECTED`), espelhando exatamente `WhatsAppSession.ts` (TS). Decisão deliberada de não "adivinhar" estados futuros (ex.: `QR_PENDING`, `ERROR`) — evita repetir o bug já encontrado no schema legado, onde `ConversationStatus.CLOSED` é referenciado em código/testes mas não existe no enum real.
- **`Tenant`** criado como model mínimo (id, name, timestamps) para dar à FK de `WhatsAppSession` integridade referencial real — preparação multi-tenant exigida desde o início (CLAUDE.md, regra permanente 6), em vez de repetir o padrão do schema legado (`tenantId` como `String` solta, sem `@relation`, em 3 tabelas).
- **`@@unique([tenantId, sessionName])`** em `WhatsAppSession` — formaliza no banco a decisão de reconexão acima: uma sessão lógica por tenant, nunca duplicada.
- **`@@map`/`@map` em snake_case** em todos os models/campos novos, seguindo a convenção definida em `CLAUDE.md` §8 (a seção legada não segue essa convenção — não foi alterada, apenas não repeti o desvio nos models novos).
- **Não incluí** campo de credenciais Baileys (`authState`) nem QR persistido neste model: `SessionManager.getQRCode()` continua delegando ao provider em tempo real, sem persistir (decisão que segue válida). Credenciais, por outro lado, já têm um lar — **não** neste model, e sim no model genérico `TenantCredential` (ver §9.4, ADR #21) — atualização desta nota em relação à versão original, que ainda listava isso como pendência do Item 3.

---

## 5. Riscos Conhecidos

- **`.git` ainda não existe** — ação pendente do usuário, não bloqueia desenvolvimento (ver sessão anterior para detalhes).
- ~~`SessionManager.init()` criava registro duplicado ao reconectar~~ — **RESOLVIDO nesta sessão**: `init(tenantId, sessionName)` reaproveita/atualiza o registro existente via `findByTenantAndSessionName`.
- ~~Typo `.datasource db {` no schema legado~~ — **RESOLVIDO nesta sessão**: corrigido para `datasource db {`. Correção de 1 caractere, aprovada explicitamente por você; nenhum model/enum da seção legada foi alterado.
- ~~Gap Domain vs Schema: `WhatsAppSession` (TS) sem `tenantId`~~ — **RESOLVIDO nesta sessão**: campo `tenantId` adicionado à entidade de Domain, ao repositório (`findByTenantAndSessionName`) e ao `SessionManager.init()`.
- Ambiguidade Puppeteer vs Baileys: **resolvida em `docs/whatsapp/README.md`** nesta sessão. Ainda pendente em `ARCHITECTURE.md` (fora do escopo deste item específico).
- Tentativa de corrigir `.claude/memories/architecture.md` (mesma correção Puppeteer→Baileys) **bloqueada pelo sandbox** (pasta `.claude/` é protegida nesta sessão) — não fiz essa edição.
- **Risco monitorado**: `onEvent` (renomeado de `onStatusChange` pelo achado F2 — ver ADR #14) só suporta um listener por instância de `WhatsAppProvider` (substitui, não acumula). Válido para o modelo atual (1 provider = 1 socket = 1 sessão); se o Item 3 (Baileys) precisar de múltiplos consumidores do mesmo evento, será necessário evoluir para um EventEmitter real — decisão adiada conscientemente (YAGNI), não é bloqueio hoje.
- ~~P2 (Architecture Review, §8): nenhum port/model para persistir credenciais Baileys~~ — **RESOLVIDO** via M1A.6 (`CredentialsStore`/`Cipher`, ADR #21, ver §9.4).

---

## 6. Checklist Milestone 1

- [x] Port `WhatsAppProvider` definido no Domain
- [x] `SessionManager` depende apenas do Domain (import corrigido)
- [x] `tsconfig.json` da API sem exclusões — todo o módulo whatsapp volta a compilar
- [x] Testes unitários do `SessionManager` (7 casos, 100% dos métodos públicos)
- [x] `docs/whatsapp/README.md` atualizado (Baileys, port real, sem menção a Puppeteer)
- [x] `prisma/schema.prisma` — `Tenant` + `WhatsAppSession` (+ enum `WhatsAppSessionStatus`)
- [x] Schema legado corrigido (`datasource` válido) sem alterar o domínio Conversations
- [x] `SessionManager.init()` reaproveita/atualiza sessão existente (sem duplicar)
- [x] Port `WhatsAppProvider.onEvent` (camada de eventos assíncronos, pré-requisito do Baileys — renomeado de `onStatusChange` pelo achado F2)
- [x] `WhatsAppSessionNotFoundError` (erro de Domain, substitui `Error` genérico)
- [x] `Logger` port (Domain) + `ConsoleLogger`/`NoopLogger` (M1A.1)
- [x] `provider` como enum, não `string` livre (achado F6)
- [x] Persistência de credenciais (`CredentialsStore`/`Cipher`, model `TenantCredential`, M1A.6/ADR #21)
- [x] `WhatsappProvider` com Baileys real (`BaileysProvider` + `BaileysCredentialsAdapter`, ver §11, ADR #22)
- [x] `WhatsAppSessionRepository` com Prisma (`PrismaWhatsAppSessionRepository`, ver §14, ADR #24)
- [x] Endpoints REST de sessão (`WhatsAppSessionKey`, `WhatsAppProviderFactory`, `WhatsAppConnectionRegistry`, router + composition root — ver §19)
- [ ] Scheduler BullMQ
- [ ] UI de QR
- [x] Testes de integração (suíte completa de 28 arquivos/224 testes, incluindo `whatsAppSessionsIntegration.test.ts` fim-a-fim)
- [x] Multi-tenant real via API key (`TenantRepository`, `ApiKeyHasher`, `requireApiKey`) + fechamento do IDOR/C1 — ver §20
- [x] Classificação de motivo de desconexão (`disconnectReason`) — ver §20, ADR #46
- [x] Reconexão automática com backoff exponencial + circuit breaker (`ReconnectionPolicy`) — ver §20, ADR #47

---

## 7. Próxima Tarefa Recomendada

~~Todas as pendências levantadas antes do Baileys foram resolvidas~~ — **SUPERADO duas vezes**: primeiro pela Architecture Review completa (2026-07-06, ver §8), depois pelo Architecture Gate Review (§9) e pela resolução do M1A.6 (§9.4). Estado atual: **nenhum bloqueador arquitetural conhecido restante** (ver §10 e o Relatório Final da M1A). Item 3 (BaileysProvider) aguarda apenas aprovação explícita do usuário para começar, não mais uma pendência técnica.

---

## 8. Architecture Review Pré-Baileys (2026-07-06) — VEREDITO: Arquitetura ainda não está pronta

Revisão crítica de todo o módulo WhatsApp (Domain/Application/Repository/Provider/Schema/ADRs/docs), sem nenhuma alteração de código. Relatório completo na conversa; resumo dos achados obrigatórios abaixo.

| ID | Problema | Gravidade |
|---|---|---|
| P1 | `SessionManager` fixa **um único** `WhatsAppProvider` no construtor, mas `init(tenantId, sessionName)` é genérico — incompatível com múltiplas sessões/tenants simultâneos. Achado mais grave da revisão. | Crítica |
| P2 | Nenhum port/model para persistir credenciais Baileys (auth state). Sem isso, reconexão após restart é impossível. **RESOLVIDO em 2026-07-06 via M1A.6 — ver §9.4, ADR #21.** | Crítica (resolvida) |
| P3 | Nenhuma estratégia de bootstrap/recuperação de sessões após reinício do processo (depende de P1+P2). | Crítica |
| P4 | Enum `WhatsAppSessionStatus` não distingue "queda temporária" de "deslogado, precisa novo QR". | Alta |
| P5 | String `'baileys'` hardcoded em `SessionManager.ts` — vazamento de detalhe de Infrastructure para Application. | Alta |
| P6 | Race condition: `init()` concorrente para a mesma sessão pode disparar dupla `create()`; violação de unicidade não tratada. | Alta |
| P7 | Zero logging/observabilidade em todo o módulo. | Alta (mínimo) |

Classificados como "pode esperar" (P8/P9/P12: observabilidade completa, afinidade de sessão para múltiplas réplicas, índice composto) e "melhoria futura" (P10/P11/P13: Domain Events, enum de provider, soft-delete) — detalhes completos na conversa.

**Item 3 (BaileysProvider) fica bloqueado até P1–P6 (e ao menos o desenho de P3) serem resolvidos.**

---

## 9. M1A — Architecture Hardening

Plano original em `docs/whatsapp/M1A-ARCHITECTURE-HARDENING.md` (itens M1A.1–M1A.7). **Superseded pelo Architecture Gate Review de 2026-07-06** (ver §8.1): em vez de M1A.2–M1A.7 como itemizados originalmente, o escopo final "antes do Baileys" passou a ser exatamente os achados F2, F6 e validação de schema do Gate Review — F1/F3/F4/F5/F9 foram registrados em ADR (#16–#20) e adiados, não implementados.

| # | Item | Status |
|---|---|---|
| M1A.1 | Logger port (Domain) + wiring mínimo | ✅ Concluído |
| F2 | Canal de eventos genérico (`onEvent` + união discriminada) | ✅ **Concluído nesta sessão** |
| F6 | `provider` como enum (Prisma + Domain) | ✅ **Concluído nesta sessão** |
| — | Validação do `schema.prisma` (`validate`/`generate`/`migration`) | ⚠️ **Parcial — ver §9.3** |
| F1, F3, F4, F5, F9 | Registrados em ADR (#16–#20), não implementados | Adiado (deliberado) |
| M1A.6 | Persistência de credenciais (`CredentialsStore` + `Cipher`, ADR #21) | ✅ **Concluído nesta sessão — ver §9.4** |

### M1A.1 — Logger port (concluído)

Precedido por um Design Review dedicado (ver conversa), que corrigiu o esboço original antes de codificar: caminho de pasta ajustado para `shared/domain/Logger.ts` (sem subpasta `ports/`, por consistência com `WhatsAppProvider`/`WhatsAppSessionRepository`, que também são ports vivendo direto em `domain/`); adicionado `child(bindings)` para evitar retrabalho em Baileys/BullMQ; adicionado `warn` (ausente no `logger.ts` legado); adicionado suporte a serializar `Error` em `meta.error` (JSON.stringify não captura `message`/`stack` de um `Error` por padrão); `Logger` definido como dependência **obrigatória** do construtor, com `NoopLogger` (Null Object) cobrindo o caso de quem não quer logging real, em vez de um parâmetro opcional.

**Criado:**
- `apps/api/src/shared/domain/Logger.ts` — port (interface).
- `apps/api/src/shared/infrastructure/logging/ConsoleLogger.ts` — implementação dev (JSON estruturado, `child()`, serialização de `Error`).
- `apps/api/src/shared/infrastructure/logging/NoopLogger.ts` — Null Object.
- `apps/api/tests/shared/logging/ConsoleLogger.test.ts`, `NoopLogger.test.ts`.

**Modificado:**
- `apps/api/src/services/whatsapp/application/SessionManager.ts` — `Logger` como 3º parâmetro obrigatório do construtor; logs em `init()` (debug ao iniciar, info ao reaproveitar sessão conectada, info ao conectar/atualizar), `disconnect()` (info), `getStatus()` (warn antes de lançar `WhatsAppSessionNotFoundError`) e na atualização assíncrona de status (debug em sucesso, error em falha).
- `apps/api/tests/services/whatsapp/SessionManager.test.ts` — `FakeLogger` (spy) adicionado; novo `describe('logging (M1A.1)', ...)` cobrindo todos os pontos de log acima.
- `docs/whatsapp/README.md`, `DECISIONS.md` (ADR #13).

**Achado durante a implementação (fora do escopo original, corrigido)**: `subscribeToProviderUpdates` registrava um listener `async` sem tratamento de erro — uma falha ali viraria uma unhandled promise rejection silenciosa, já que o provider chama o listener sem aguardar a Promise retornada. Adicionado `try/catch` com `logger.error(...)` no catch. É exatamente o tipo de problema que a ausência de Logger (P7) escondia.

### 9.1 — F2: canal de eventos genérico (concluído)

Substituído `onStatusChange`/`WhatsAppProviderStatusUpdate` por `onEvent`/`WhatsAppProviderEvent` (união discriminada por `type`, hoje só `'status_changed'`). Ver ADR #14.

**Criado**: `apps/api/src/services/whatsapp/domain/providers/WhatsAppProviderEvent.ts`.
**Modificado**: `WhatsAppProvider.ts` (método `onEvent`), `SessionManager.ts` (`subscribeToProviderEvents`, com early-return para tipos de evento não reconhecidos), `SessionManager.test.ts` (fake atualizado para `onEvent`/`emitEvent`), `docs/whatsapp/README.md`.
**Esvaziado (não deletado — sem tooling de exclusão de arquivo nesta sessão)**: `WhatsAppProviderStatusUpdate.ts`, marcado `@deprecated`.

### 9.2 — F6: `provider` como enum (concluído)

Novo enum Prisma `WhatsAppProviderType` (hoje só `BAILEYS`); `WhatsAppSession.provider` (Domain) tipado como literal `'baileys'` em vez de `string`. Ver ADR #15.

**Modificado**: `prisma/schema.prisma` (enum + campo `provider` do model `WhatsAppSession`), `WhatsAppSession.ts` (entidade Domain).
**Observação registrada (não corrigida nesta rodada)**: o literal `'baileys'` em `SessionManager.ts` agora é checado pelo compilador, mas a referência direta a um valor de Infrastructure dentro da Application ainda existe conceitualmente — resolução completa (ex.: via `provider.name` injetado) não fazia parte do escopo aprovado desta rodada.

### 9.3 — Validação do `schema.prisma` (parcial — limitação de ambiente)

O sandbox desta sessão **não tem acesso a um shell funcional** (`mcp__workspace__bash` retorna "Not enough disk space to set up the workspace" em toda tentativa, incluindo múltiplas tentativas nesta própria sessão) — o mesmo problema já registrado em sessões anteriores. Não foi possível rodar `prisma validate`/`generate`/`migrate dev` de fato.

**O que fiz em vez disso**: revisão manual, linha a linha, de todo o `schema.prisma` (274 linhas). Confirmo, com alta confiança: sintaxe de enums/models/relations/constraints da seção WhatsApp Connectivity está correta; `@default(BAILEYS)` referencia o enum corretamente; nenhuma colisão de nome (model, enum ou tabela mapeada) com a seção legada.

**Achado que exige confirmação no seu ambiente**: `generator client { ... previewFeatures = ["orderByRelation"] }` (linha do bloco `generator`, pré-existente, não introduzida por mim) — `orderByRelation` é um nome de preview feature que pode já ter sido estabilizado/removido em versões recentes do Prisma (o projeto usa `prisma@^5.10.2`). Se for esse o caso, **`prisma validate`/`generate` falha para o arquivo inteiro** (mesmo efeito do typo `.datasource` já corrigido antes). Não alterei essa linha — está fora do escopo aprovado desta rodada (F2/F6/validação) e toca o bloco `generator`, compartilhado com a seção legada.

**Comandos exatos para você rodar** (na raiz do projeto, com `DATABASE_URL` definida, ainda que apontando para um Postgres vazio/de teste):
```
npx prisma validate --schema=prisma/schema.prisma
npx prisma generate --schema=prisma/schema.prisma
npx prisma migrate dev --schema=prisma/schema.prisma --name whatsapp_connectivity_f2_f6
```
Se o primeiro comando reclamar de `orderByRelation`, remova essa linha do bloco `generator` e rode de novo.

**Achado adicional (não corrigido, fora do escopo aprovado)**: `@@index([tenantId])` em `WhatsAppSession` é provavelmente redundante frente a `@@unique([tenantId, sessionName])`, que já serve como índice por prefixo esquerdo em `tenantId` sozinho — otimização menor, não bloqueante.

### 9.4 — M1A.6: persistência de credenciais (`CredentialsStore` + `Cipher`, ADR #21, concluído)

Precedido de uma revisão arquitetural dedicada (Clean Architecture, DDD, SOLID, Ports & Adapters, multi-tenant, segurança, escalabilidade, extensibilidade a múltiplos providers), exigida explicitamente antes de qualquer código. Conclusão da revisão: **nenhum bloqueador arquitetural** — apenas trade-offs documentados (ver ADR #21) — então a implementação prosseguiu na mesma sessão.

**Principal correção de rumo encontrada durante a revisão** (valor concreto de revisar antes de codificar): o esboço original do M1A.6 (pré-Gate-Review) tratava "credenciais do Baileys" como um blob único (`save`/`load`/`clear` de uma string). Isso não reflete a forma real do `AuthenticationState` do Baileys — `keys` é um key-value store do protocolo Signal com leitura/escrita por chave individual, não um blob reescrito inteiro a cada mudança. Modelar o port em torno do blob único forçaria reserializar/regravar tudo a cada avanço do ratchet do Signal (um problema real de performance e de risco de escrita concorrente perdida em escala) — e, pior, modelar o port em torno da forma exata do `SignalKeyStore` do Baileys vazaria um detalhe de biblioteca concreta para o Domain (o mesmo erro já evitado no achado F9). Correção: port genérico de chave-valor namespaced (`get`/`getAll`/`set`/`remove`/`clear`, endereçado por `tenantId`+`namespace`+`key`), sem nenhum conceito de WhatsApp.

**Segunda correção de rumo**: o esboço original também não abordava blast radius de uma chave de criptografia única e global — em escala (milhares de tenants), o vazamento dessa chave comprometeria as credenciais de WhatsApp de todos os tenants de uma vez. Corrigido derivando uma chave por tenant via HKDF a partir de uma chave mestra (barato de implementar agora; caríssimo de retrofitar depois de dados reais em produção).

**Criado:**
- `apps/api/src/shared/security/domain/CredentialsStore.ts` — port.
- `apps/api/src/shared/security/domain/Cipher.ts` — port.
- `apps/api/src/shared/security/infrastructure/AesGcmCipher.ts` — AES-256-GCM, chave derivada por tenant via HKDF.
- `apps/api/src/shared/security/infrastructure/PrismaCredentialsStore.ts` — model `TenantCredential`.
- `apps/api/tests/shared/security/AesGcmCipher.test.ts` — round-trip, IV não determinístico, isolamento entre tenants, rejeição de ciphertext adulterado, validação de tamanho de chave mestra.
- `apps/api/tests/shared/security/PrismaCredentialsStore.test.ts` — via fake do shape do Prisma Client + fake `Cipher`, cobrindo `get`/`getAll`/`set`/`remove`/`clear`.

**Modificado:**
- `prisma/schema.prisma` — novo model `TenantCredential` (`@@unique([tenantId, namespace, key])`, `@@index([tenantId, namespace])`, FK só para `Tenant`, sem FK para `WhatsAppSession` — ver justificativa na ADR #21 e no comentário do schema); `Tenant.tenantCredentials` (relação inversa).
- `DECISIONS.md` — ADR #21.
- `docs/whatsapp/README.md` — seção "Persistência de credenciais".

**Não modificado, propositalmente**: `SessionManager.ts` e `WhatsAppProvider.ts` — `CredentialsStore` é consumido apenas pelo futuro `BaileysProvider` (Item 3), nunca pela Application. Isso mantém o número de dependências do `SessionManager` estável (provider/repo/logger), consistente com a revisão de escopo já feita para ele antes do Gate Review.

**Limitação de verificação (mesma já registrada em §9.3)**: `PrismaCredentialsStore` referencia `prisma.tenantCredential`, dependente de `npx prisma generate`, não executável neste sandbox. O shape usado segue estritamente as convenções do Prisma Client, mas precisa ser conferido com `tsc`/`prisma generate` no ambiente real antes do primeiro uso em produção — mesmos comandos já listados em §9.3, rodando novamente após esta mudança de schema.

---

## 10. Revisão Final M1A — Decisão de Encerramento

F2, F6 e M1A.6 (persistência de credenciais) resolvidos; F1/F3/F4/F5/F9 registrados em ADR e conscientemente adiados; validação de schema feita manualmente, com uma pendência ambiental documentada em §9.3 (não é um bloqueador de desenho).

A lacuna encontrada na revisão final anterior — persistência de credenciais do Baileys (antigo P2/M1A.6), que havia ficado de fora tanto da lista "implementar agora" quanto da lista "adiar via ADR" do Gate Review — está resolvida (§9.4, ADR #21), precedida da revisão arquitetural dedicada que você exigiu, sem bloqueadores encontrados.

**Não há novos bloqueadores conhecidos. Considero a fase M1A encerrada.** Ainda assim, conforme instrução explícita mais recente, **não inicio o Item 3 (BaileysProvider) sem sua aprovação explícita.**

---

## 11. Item 3 — `BaileysProvider` (implementação concreta, ADR #22)

Precedido de uma revisão final completa da M1A (Domain/Application/Shared/Prisma/ADRs/`PROJECT_STATUS.md`/docs), que corrigiu 7 inconsistências documentais (referências stale a `onStatusChange`, notas desatualizadas sobre credenciais "pendentes para o Item 3", checklist incompleto, ADR #6 sem nota cruzada) e confirmou: nenhum bloqueador arquitetural, nenhuma interface órfã, nenhum código duplicado. Riscos remanescentes identificados (P1/F1 — registry multi-tenant adiado; P3 — bootstrap/recovery após restart, depende de F1; P4 — granularidade de status; P6 — race condition em `init()` concorrente) foram avaliados individualmente e nenhum obriga retrabalho do que este item constrói. Parecer: pronto para iniciar. Ver ADR #22 para as decisões de desenho tomadas durante a implementação.

**Criado:**
- `apps/api/src/services/whatsapp/infrastructure/providers/baileys/BaileysCredentialsAdapter.ts` — bridge entre `CredentialsStore` (genérico) e o `AuthenticationState`/`SignalDataTypeMap` do Baileys.
- `apps/api/src/services/whatsapp/infrastructure/providers/baileys/BaileysProvider.ts` — implementação de `WhatsAppProvider`.
- `apps/api/tests/services/whatsapp/infrastructure/BaileysCredentialsAdapter.test.ts`, `BaileysProvider.test.ts` — mocks virtuais de `@whiskeysockets/baileys` (`jest.mock(..., { virtual: true })`), já que o pacote não pôde ser instalado neste sandbox.

**Modificado:**
- `apps/api/package.json` — dependências `@whiskeysockets/baileys`, `@hapi/boom`.
- `DECISIONS.md` — ADR #22.

**Decisões de desenho (detalhe na ADR #22):**
- Status do Baileys (motivos de desconexão ricos) colapsado em `'disconnected'` por ora, com o motivo específico preservado via `Logger` — não perde informação, não bloqueia, extensão futura do enum é aditiva.
- `BaileysProvider` recebe `tenantId`/`sessionName` no construtor — uma instância por socket/sessão, consistente com o modelo já documentado; multi-instância continua sendo escopo do futuro Factory (F1, adiado).
- `import type` usado para `Boom` (`@hapi/boom`) — elimina uma dependência de runtime desnecessária, já que é usado só como cast de tipo.

**Não feito, propositalmente (fora do escopo deste item):** wiring de composição (DI) em `index.ts`; endpoints REST; `WhatsAppSessionRepository` com Prisma. Ver checklist §6.

**Limitação de verificação (mesma limitação ambiental já registrada em §9.3/§9.4)**: nenhum destes arquivos foi executado de fato — sandbox sem shell funcional a sessão inteira. Isso inclui, além de `tsc`/`prisma generate`: `npm install` do Baileys (nome/versão exatos do pacote não confirmados) e `npm test` (os testes novos usam `jest.mock(..., { virtual: true })` para não depender do pacote fisicamente instalado, mas essa técnica em si não foi confirmada rodando de fato). **Recomendo fortemente rodar `npm install && npm test` localmente antes de considerar o Item 3 pronto para uso real.**

---

## 12. Auditoria Adversarial Independente (2026-07-06) — 4 bugs reais encontrados

Papel assumido: Principal Software Architect / Code Reviewer externo, deliberadamente adversarial ("tentar quebrar a arquitetura", não defender decisões anteriores). Revisão de toda a Milestone 1 (Item 1, M1A, Item 3) através de 30 dimensões pedidas pelo usuário. Resultado: **11 achados**, dos quais **4 eram bugs reais de ciclo de vida/concorrência em código já implementado** (não apenas trade-offs documentados) — BUG-01 (Crítica, race condition de eventos perdidos), BUG-02 (Crítica, reconexão pós-restart nunca acontecia de fato), BUG-03 (Alta, API pública sem checagem de posse entre sessão e provider), BUG-04 (Alta, socket zumbi em reconexões múltiplas). Veredito da auditoria: **"Existe retrabalho obrigatório antes do Item 4."** Notas dadas: arquitetura 7/10, implementação 4/10, escalabilidade 5/10, manutenibilidade 6/10, extensibilidade 7/10, segurança 6/10, qualidade de código 5/10, aderência ao roadmap 7/10.

Achados de gravidade Média/Baixa (BUG-05 a BUG-11: `CredentialsStore.getAll()` sem chamador real/ISP violado — a justificativa da ADR #21 sobre carga em lote estava tecnicamente errada; falta de evento `qr_updated`; `getQRCode()` lança `Error` genérico em vez de um erro de Domain dedicado; organização inconsistente de `shared/`; falta de campo de versionamento de chave em `TenantCredential`; uso de `as never` em testes; cobertura de teste concentrada no caminho feliz) foram registrados mas **não corrigidos nesta rodada** — o usuário pediu explicitamente para corrigir só BUG-01 a BUG-04 primeiro.

## 13. Correção de BUG-01 a BUG-04 (ADR #23)

**BUG-01** — `SessionManager.init()` agora assina `provider.onEvent(listener)` ANTES de `provider.connect()` (antes era depois — qualquer evento emitido nessa janela era descartado silenciosamente). Também passou a persistir um registro inicial (`'connecting'`) antes de assinar, para garantir que o handler assíncrono sempre encontre uma linha existente.

**BUG-02** — o "early return" de `init()` não confia mais só no status persistido no banco. Agora consulta `provider.getStatus()` (a fonte de verdade sobre conexão viva NESTE processo) — um provider recém-criado após um restart sempre reporta honestamente `'disconnected'`, forçando uma reconexão real em vez de aceitar um status `'connected'` stale.

**BUG-03** — novo campo privado `ownedSessionId` (atribuído no primeiro `init()` bem-sucedido) e método `assertOwnsSession()`, que lança o novo erro de Domain `WhatsAppSessionOwnershipError` (`apps/api/src/services/whatsapp/domain/errors/WhatsAppSessionOwnershipError.ts`) se `disconnect(sessionId)`/`getStatus(sessionId)` forem chamados com um `sessionId` que esta instância não gerencia.

**BUG-04** — `BaileysProvider` ganhou `teardownSocket()` (chamado no início de `connect()` e em `disconnect()`, encerra o socket anterior via `.end()`) e um check de identidade dentro do handler de `connection.update` (`this.socket !== socket`) que ignora eventos de um socket já substituído por uma reconexão mais recente.

**Modificado:**
- `apps/api/src/services/whatsapp/application/SessionManager.ts` — reordenação de `init()`, `ownedSessionId`, `assertOwnsSession()`.
- `apps/api/src/services/whatsapp/infrastructure/providers/baileys/BaileysProvider.ts` — `teardownSocket()`, closure com variável local `socket` + check de identidade.
- `apps/api/tests/services/whatsapp/SessionManager.test.ts` — `FakeWhatsAppProvider.status` agora inicia `'disconnected'` (não `'connected'` — o valor antigo mascarava o BUG-02 em todos os testes que dependiam dele); novo `autoEmitOnConnect` para simular eventos emitidos durante `connect()`; testes dedicados a cada bug (`[BUG-01]`, `[BUG-02]`, `[BUG-03]`).
- `apps/api/tests/services/whatsapp/infrastructure/BaileysProvider.test.ts` — mock de socket reescrito para criar um objeto distinto por chamada de `makeWASocket()` (necessário para provar teardown/identity-check); novo `describe('BUG-04 — ciclo de vida do socket em reconexões')`.

**Criado:**
- `apps/api/src/services/whatsapp/domain/errors/WhatsAppSessionOwnershipError.ts`.

**Auditoria de confirmação (focada exclusivamente nos 4 bugs, ver texto da conversa para o relatório completo)**: BUG-01 a BUG-04 confirmados corrigidos por leitura crítica do código final; testes novos verificados linha a linha para garantir que realmente discriminam comportamento antigo (bugado) de comportamento novo (corrigido), não apenas coincidem com o resultado final por outro caminho. Nenhuma regressão identificada nos testes pré-existentes (traçados manualmente contra a nova lógica). **Limitação inalterada**: nada disso foi executado de fato (`npm test` real pendente, sandbox sem shell).

## 14. Item 4 — `PrismaWhatsAppSessionRepository` (ADR #24)

**Criado:**
- `apps/api/src/services/whatsapp/infrastructure/repositories/PrismaWhatsAppSessionRepository.ts` — implementação de `WhatsAppSessionRepository`.
- `apps/api/tests/services/whatsapp/infrastructure/PrismaWhatsAppSessionRepository.test.ts` — mock virtual de `@prisma/client` (mesma técnica já usada para Baileys), cobrindo mapeamento de enums, `findByTenantAndSessionName` (chave composta), no-op em P2025, e propagação de outros erros (ex.: P2002).

**Decisões (detalhe na ADR #24):** `update()` trata registro-não-encontrado (P2025) como no-op, replicando deliberadamente o `FakeWhatsAppSessionRepository` já usado nos testes do `SessionManager` — um Fake mais tolerante que a implementação real é exatamente a classe de lacuna que expôs o BUG-02. `create()` deixa propagar violações de unicidade (P6, ainda aberto, não resolvido aqui).

**Limitação de verificação (idêntica às demais desta Milestone)**: depende de `npx prisma generate`, não executável neste sandbox.

**Risco identificado neste item, corrigido na revisão seguinte (§15)**: P6 (race condition em `init()` concorrente) — antes só existia contra Fakes em memória; com um repositório real, tornou-se concretamente alcançável (dois `init()` simultâneos podiam colidir na constraint `@@unique([tenantId, sessionName])`, e `create()` deste repositório deixava esse erro propagar sem tratamento).

---

## 15. Revisão Arquitetural — Item 4 + Integração Item 3↔4 (2026-07-06) — P6 corrigido (ADR #25)

Revisão pedida explicitamente antes do Item 5, cobrindo: Clean Architecture, DDD, SOLID, concorrência, transações Prisma, idempotência, consistência Fake↔Prisma, comportamento sob falha de banco, regressões de BUG-01–04, riscos de produção, necessidade de novos testes.

**Achado estrutural (Alta) — corrigido**: P6 concretamente alcançável (ver nota acima) + `FakeWhatsAppSessionRepository` não aplicava a mesma invariante de unicidade do schema real, mascarando o problema em todos os testes — o mesmo padrão de "Fake mais tolerante que a implementação real" que já havia causado o BUG-02. Corrigido com `upsertByTenantAndSessionName` (operação atômica, `INSERT ... ON CONFLICT DO UPDATE` no Postgres) adicionada ao port, implementada em `PrismaWhatsAppSessionRepository` e no Fake; `SessionManager.init()` refatorado para usá-la em vez do antigo `find` + `create()`/`update()` separados. Detalhe completo na ADR #25.

**Achados registrados, não corrigidos (Média/Baixa, não bloqueiam)**:
- `findAll()` sem escopo de tenant nem paginação, sem chamador real hoje — mesma classe de achado já feita para `CredentialsStore.getAll()` na auditoria anterior; bomba-relógio de escala assim que alguém o usar.
- Divergência teórica Fake↔Real em `update()`: se um chamador futuro passar `{ campo: undefined }` explicitamente pretendendo limpar um valor, o Fake (merge raso) aplica, o Prisma real (filtra `!== undefined`) ignora. Nenhum chamador atual faz isso.
- Comportamento sob falha de banco: só P2025 é tratado como caso especial; qualquer outra falha (conexão, timeout, P2002 fora do upsert) propaga sem retry/circuit breaker — deliberado, documentado, não é um port para acumular essa lógica agora (YAGNI).

**Modificado:**
- `apps/api/src/services/whatsapp/domain/repositories/WhatsAppSessionRepository.ts` — novo método `upsertByTenantAndSessionName`.
- `apps/api/src/services/whatsapp/infrastructure/repositories/PrismaWhatsAppSessionRepository.ts` — implementação via `prisma.whatsAppSession.upsert()`.
- `apps/api/src/services/whatsapp/application/SessionManager.ts` — `init()` refatorado (upsert atômico substitui find+create/update).
- `apps/api/tests/services/whatsapp/SessionManager.test.ts` — Fake implementa `upsertByTenantAndSessionName` (+ helper `forcedUpsertResult`); novo teste `[P6]`.
- `apps/api/tests/services/whatsapp/infrastructure/PrismaWhatsAppSessionRepository.test.ts` — novo `describe('[P6] upsertByTenantAndSessionName...')`.

**Veredito desta revisão**: nenhum bloqueador crítico ou alto restante após a correção do P6. Autorizado seguir para o Item 5.

---

## 16. Auditoria de Integração — Cadeia Completa (2026-07-06) — BUG-12/13 corrigidos (ADR #26)

Auditoria não-conceitual: simulação mental do ciclo de vida completo (primeira conexão → QR → pareamento → credenciais atualizando → restart → bootstrap → reconecta → desconecta → conecta de novo → múltiplas sessões → concorrência → falha de banco → perda de conexão → logout → troca de QR → restart durante reconnect → evento chegando durante persistência → falha parcial) através de toda a cadeia `SessionManager → BaileysProvider → CredentialsAdapter → CredentialsStore → Cipher → Prisma → Banco`.

**BUG-12 (Alta, corrigido)** — handler de `creds.update` sem o mesmo check de identidade que `connection.update` já tinha (BUG-04). Um evento tardio de um socket já substituído/encerrado podia sobrescrever credenciais mais novas com dados stale — risco real de corrupção/perda de credenciais numa reconexão rápida.

**BUG-13 (Alta, corrigido)** — nenhuma limpeza de credenciais ao detectar `DisconnectReason.loggedOut`. Após um logout real do usuário, credenciais inválidas permaneciam persistidas e seriam recarregadas numa reconexão futura em vez de gerar QR novo — reconexão incorreta.

**Achados Média/Baixa, registrados, não corrigidos**: BUG-14 (`latestQrCode` nunca limpo), BUG-15 (reconfirmação do BUG-06 — sem evento `qr_updated`), BUG-16 (sem transação entre status da sessão e credenciais — tabelas diferentes), BUG-17 (`keys.set()` do adapter não atômico — `Promise.all` sem rollback em falha parcial), BUG-18 (sem retry na persistência assíncrona de eventos), BUG-19 (`create()` "inseguro" ainda exposto ao lado do upsert atômico), BUG-20 (exceções do Prisma sem tradução para erro de Domain), BUG-21 (gaps de teste que deixaram BUG-12/13 passarem despercebidos em duas auditorias anteriores).

**Modificado:**
- `apps/api/src/services/whatsapp/infrastructure/providers/baileys/BaileysProvider.ts` — check de identidade + tratamento de erro no handler `creds.update`; limpeza de credenciais em `loggedOut`.
- `apps/api/tests/services/whatsapp/infrastructure/BaileysProvider.test.ts` — `describe('BUG-12 ...')`, `describe('BUG-13 ...')`.
- `DECISIONS.md` — ADR #26.

**Veredito**: nenhum bloqueador crítico ou alto restante após a correção de BUG-12/13. Autorizado seguir para o Item 5.

---

## 17. Estabilização de ambiente — `package-lock.json` fóssil (ADR #27) — AÇÃO LOCAL PENDENTE

Ao tentar validar M1 localmente, `npm install` falhou com `ERESOLVE` (`@typescript-eslint/parser` vs `eslint-config-next`). Diagnóstico completo (ver ADR #27 em `DECISIONS.md`): **`package-lock.json` é um fóssil** de uma versão muito anterior do monorepo (de antes das Tasks #1 e #15), contendo `eslint-config-next@13.5.6` e `fastify` que não existem mais em nenhum `package.json` atual. `node_modules/` também está num estado híbrido inconsistente (nem reflete o lockfile antigo, nem o `package.json` atual). Os três `package.json` (raiz, `apps/api`, `apps/dashboard`) já estão mutuamente consistentes — **nenhuma versão de dependência precisou ser alterada**.

**Escopo desta correção**: infraestrutura apenas. Nenhuma regra de negócio ou código de domínio/aplicação/infraestrutura da Milestone 1 foi tocado.

**Decisão sobre workspaces fantasmas**: `packages/*`, `services` e `infrastructure` permanecem no array `workspaces` da raiz — são placeholders intencionais do roadmap (M5 SaaS multi-tenant / possível split em microsserviços), ainda não materializados fisicamente. Não removidos.

**Limitação de execução (recorrente, disclosed desde o início do projeto)**: este ambiente de trabalho não tem shell disponível. A remoção de `package-lock.json`, `node_modules/` e `package-list.txt` (dump de diagnóstico do PowerShell sem função no projeto) e a execução do `npm install` limpo **precisam ser feitas localmente por Wesley**. Comandos exatos:

PowerShell:
```powershell
cd "C:\Users\Meu Computador\Desktop\Whatsapp-automatico"
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
Remove-Item -Force package-list.txt
npm install
```

Após o `npm install` limpo (sem `--force`/`--legacy-peer-deps`) rodar sem erro, validar também:
```powershell
npx tsc --noEmit -p apps/api/tsconfig.json
npx prisma generate --schema=prisma/schema.prisma
npm test
```

**Pendente**: aguardando confirmação local de que os quatro comandos acima executam sem erro antes de retomar qualquer implementação (Item 5 ou além). Um novo `package-lock.json` será gerado nesse processo e deve ser commitado — a partir daí volta a ser a fonte confiável do grafo de dependências.

**Resultado da validação (2026-07-07)**: `npm install` — sucesso, sem `ERESOLVE`, sem flags de força. Confirma a causa raiz. `npm test` — sucesso, 12 suítes / 87 testes. `tsc`/`prisma generate` — falharam por um bug pré-existente e não relacionado ao lockfile, corrigido na ADR #28 (ver abaixo). Achados informativos sem ação necessária: `npm warn allow-scripts` (política de segurança do npm local bloqueando scripts pre/postinstall de `@prisma/client`/`prisma`/`baileys`/`protobufjs`/`esbuild` — não é bug do projeto) e `npm audit` (2 vulnerabilidades, incluindo uma conhecida em `next@13.5.6`, publicada pela Vercel — investigação futura separada).

---

## 18. Bug pré-existente no schema legado — relação `InternalNote ↔ Conversation` incompleta (ADR #28)

`prisma/schema.prisma` tinha uma relação incompleta: `InternalNote.conversation` sem o lado oposto `Conversation.internalNotes`, ao contrário de `Message`/`ConversationTag`/`ConversationEvent`, que declaram corretamente suas relações opostas. Bug do domínio legado `Conversations` (pré-Milestone-1, migração adiada — ADR #11), nunca detectado porque `prisma generate` nunca tinha rodado de verdade neste projeto. Os 3 erros de `tsc` em `PrismaWhatsAppSessionRepository.ts` (tipos/enums e classes de erro ausentes do `@prisma/client`) eram efeito cascata desse bug, não um problema de código da M1.

**Correção**: adicionado `internalNotes InternalNote[]` ao model `Conversation`. Mudança estrutural, sem migration, sem alteração de regra de negócio. Aprovada explicitamente por Wesley antes da edição.

**Confirmado localmente (2026-07-07)**: `npx prisma generate` — sucesso, Prisma Client v5.22.0 gerado. `npx tsc --noEmit -p apps/api/tsconfig.json` — 0 erros (nenhuma saída), confirmando que os 3 erros anteriores eram 100% efeito cascata da falha do `prisma generate`, sem nenhum bug de código adicional — nenhuma linha de `PrismaWhatsAppSessionRepository.ts` ou de qualquer outro arquivo de código precisou ser alterada. `npm test` — sucesso, 12 suítes / 87 testes.

**Ambiente estabilizado e validado por ferramenta real, não apenas por rastreamento manual**: `npm install` (sem flags), `npx prisma generate`, `npx tsc --noEmit`, `npm test` — todos passam limpos. Este é o primeiro ponto do engajamento em que os quatro comandos de validação local confirmam sucesso de fato.

---

## 19. Item 5 — Endpoints REST de sessão (Blocos 1–8, concluído)

Implementado em 8 blocos sequenciais, cada um aprovado e validado antes do próximo. Ver DECISIONS.md ADRs #33–#38 para o detalhe arquitetural completo de cada um.

| Bloco | Entregável | ADR |
|---|---|---|
| 1 | `WhatsAppSessionKey` (Value Object de identidade, `tenantId`+`sessionName`) | #33 |
| 2 | `WhatsAppProviderFactory` (port) + `BaileysProviderFactory` + Fake | #34 |
| 3 | Refatoração do `SessionManager` (identidade via `sessionKey`, mutex de ciclo de vida, remoção de `assertOwnsSession`) | #29 |
| 4 | `WhatsAppQRCodeNotAvailableError` (BUG-07) | #35 |
| 5 | `WhatsAppConnectionRegistry` (pool de `SessionManager` por sessão) | #36 |
| 6 | Extração de Fakes compartilhadas entre suítes de teste (`testDoubles.ts`) | — (só testes) |
| 7 | Rotas REST (`whatsAppSessionsRouter.ts`) + composition root inicial | #37 |
| 8 | Wiring em `index.ts` (import dinâmico, guard de env vars) | #38 |

**Nota importante**: o router e o composition root descritos na ADR #37 (Bloco 7/8 deste Item) foram REFATORADOS na Production Hardening (Bloco 7, ADR #45) para depender de `WhatsAppSessionService` em vez do `WhatsAppConnectionRegistry` diretamente — a versão vigente do fluxo HTTP é a descrita em §20/ADR #45, não a original deste Item.

Também corrigidos, ainda dentro deste arco, dois problemas encontrados em validação manual real com um número de WhatsApp de verdade: regressão ESM do Baileys quebrando `health.test.ts` (ADR #38), necessidade de `fetchLatestBaileysVersion()` (ADR #31), e BUG-14/reconexão obrigatória após `restartRequired` (ADR #32, hoje superseded pela ADR #47).

---

## 20. Production Hardening — Blocos 1–8b (concluído e validado)

Objetivo: levar o módulo WhatsApp de "funciona com um único tenant, sem autenticação" para "seguro para múltiplos tenants reais via API própria, com reconexão resiliente". Oito blocos sequenciais, cada um aprovado e validado (`tsc`/`npm test`) antes do próximo. Ver DECISIONS.md ADRs #39–#47 para o detalhe arquitetural completo.

| Bloco | Entregável | ADR |
|---|---|---|
| 1 (+1-bis) | `TenantRepository` (Shared Kernel, somente leitura) em `shared/tenant/` | #39 |
| 2 | `ApiKeyHasher` (HMAC-SHA256 + pepper) | #40 |
| 3 | Script local de emissão de API key (`issueApiKey.ts`) | #41 |
| 4 | Contador de `generation` + `evictIfCurrent` (evicção segura do Registry) | #42 |
| 5 | `WhatsAppSessionService` (valida tenant antes de delegar ao Registry) | #43 |
| 6 | `requireApiKey` + `resolveTenantFromApiKey` + `sanitizeHeaders` — fecha o IDOR/C1 | #44 |
| 7 | Wiring HTTP real (composition root estendido + router refatorado + `index.ts`) | #45 |
| 8a | `disconnectReason` — classificação do motivo da última desconexão | #46 |
| 8b | Reconexão automática com backoff exponencial + circuit breaker (`ReconnectionPolicy`) | #47 |

**Fluxo HTTP resultante (confirmado por leitura direta do código em 2026-07-08, ver §21)**:

```
HTTP → requireApiKey → resolveTenantFromApiKey → WhatsAppSessionService
     → WhatsAppConnectionRegistry → SessionManager → BaileysProvider
```

**Validação final**: `npx tsc --noEmit -p apps/api/tsconfig.json` limpo; `npm test` — 28/28 suítes, 224/224 testes verdes (confirmado pelo usuário ao final de cada bloco, incluindo após a migration do Prisma para `disconnectReason`/`WhatsAppDisconnectReason`).

**Riscos aceitos e conhecidos, carregados desta fase (não bloqueantes, não corrigidos nesta rodada)**:
- Coordenação distribuída entre pods/multi-instância ainda não implementada (ADR #16) — bloqueia deploy multi-pod real, não bloqueia o uso atual em instância única.
- `WhatsAppSession['status']` continua com só 3 valores; `disconnectReason` é um campo complementar, não uma expansão do enum (decisão deliberada, ADR #46).
- Uma vez que o circuit breaker de reconexão abre, só uma conexão bem-sucedida o fecha — uma reconexão manual via HTTP que também falhe não reabre as tentativas automáticas (ver ADR #47, risco documentado).
- `latestQrCode` (`BaileysProvider`) nunca é limpo — pode devolver um QR expirado após conectar/reconectar com credenciais em cache (ADR #26).
- Nenhum limite de tamanho/TTL no `Map` do `WhatsAppConnectionRegistry` — sessões desconectadas continuam ocupando memória até o processo reiniciar (ADR #36/#42).
- Achados de gravidade Média/Baixa de auditorias anteriores, ainda não corrigidos: BUG-05, 06, 08, 09, 10, 11, 15, 16, 17, 18, 19, 20, 21 (ver ADR #26 e PROJECT_STATUS.md §16 para a lista completa).

---

## 21. Bloco 9 — Auditoria final e encerramento da Production Hardening (2026-07-08)

**9a — Auditoria (sem alteração de código de produção)**: releitura completa, arquivo por arquivo, de toda a cadeia HTTP (`index.ts`, `compositionRoot.ts`, `requireApiKey.ts`, `resolveTenantFromApiKey.ts`, `whatsAppSessionsRouter.ts`, `whatsAppErrorHandler.ts`, `WhatsAppSessionService.ts`, `WhatsAppConnectionRegistry.ts`, `SessionManager.ts`, `BaileysProvider.ts`, `BaileysProviderFactory.ts`, `ReconnectionPolicy.ts`/`WhatsAppReconnectionPolicy.ts`, `isDisconnectReasonRecoverable.ts`, entidades/VOs de Domain, `prisma/schema.prisma`) e da documentação existente (`DECISIONS.md`, `PROJECT_STATUS.md`, `docs/whatsapp/README.md`).

**Confirmado (sem achados que exijam mudança de código)**:
- Direção de dependência entre camadas íntegra: nenhum arquivo de Domain lido importa de Application/Infrastructure/Presentation.
- Fluxo HTTP completo confere exatamente com `HTTP → requireApiKey → resolveTenantFromApiKey → WhatsAppSessionService → WhatsAppConnectionRegistry → SessionManager → BaileysProvider`.
- IDOR/C1 fechado: `requireApiKey` compara `tenant.id` autenticado com `req.params.tenantId`, 403 `tenant_mismatch` em divergência.
- SRP/DIP/OCP respeitados em todos os componentes revisados (Registry é pool puro; Service isola validação de tenant; SessionManager isola ciclo de vida; BaileysProvider isola protocolo Baileys; ReconnectionPolicy isola backoff/circuit breaker via port próprio).
- Dois arquivos anteriormente registrados como "órfãos, sandbox sem capacidade de excluir" (`WhatsAppSessionOwnershipError.ts`, ADR #29; `WhatsAppProviderStatusUpdate.ts`, ADR #14) **já não existem mais na árvore** — foram removidos localmente por Wesley em algum momento entre sessões. Nenhum código morto encontrado na árvore ativa de `services/whatsapp/`.

**Achados documentais (corrigidos nesta rodada, só documentação — ver DECISIONS.md ADRs #33–#47 adicionadas)**:
- `PROJECT_STATUS.md` não tinha nenhuma entrada desde a ADR #28 (2026-07-07) — Item 5 inteiro (Blocos 1–8) e toda a Production Hardening (Blocos 1–8b) estavam implementados, testados e validados, mas nunca consolidados aqui. Corrigido nas seções §19/§20 acima.
- `DECISIONS.md` não tinha ADR para: `WhatsAppSessionKey`, `WhatsAppProviderFactory`, `WhatsAppQRCodeNotAvailableError`, `WhatsAppConnectionRegistry`, endpoints REST do Item 5, `TenantRepository`, `ApiKeyHasher`, script de emissão de API key, contador de `generation`/`evictIfCurrent`, `WhatsAppSessionService`, `requireApiKey`/IDOR, wiring HTTP da Production Hardening, `disconnectReason`, e `ReconnectionPolicy` — treze decisões implementadas e já bem documentadas em docstrings de código, mas nunca transcritas para `DECISIONS.md`. Adicionadas como ADRs #33–#47, reaproveitando a justificativa já presente no código (nenhuma decisão nova foi inventada nesta rodada).
- ADR #32 (BUG-14, reconexão só para `restartRequired`) estava desatualizada em relação ao código real desde a implementação do Bloco 8b — o texto original afirmava "nenhum outro motivo de desconexão passou a reconectar automaticamente", o que deixou de ser verdade. Marcada como Superseded pela ADR #47.
- `docs/whatsapp/README.md` (linha 8) ainda descrevia `disconnect(sessionId)`/`getStatus(sessionId)` lançando `WhatsAppSessionOwnershipError` — comportamento removido pela própria ADR #29 (Item 5, Bloco 3), que já eliminou os parâmetros de identidade externos e a classe de erro. Corrigido (ver abaixo).

**9b — Atualização de documentação (concluída)**: `DECISIONS.md` (ADRs #33–#47 adicionadas, #32 marcada como superseded), `PROJECT_STATUS.md` (este arquivo — §19/§20/§21 adicionadas, checklist da Milestone 1 e tabela de progresso atualizadas), `docs/whatsapp/README.md` (linha sobre `WhatsAppSessionOwnershipError` corrigida). **Nenhum código de produção foi alterado nesta rodada** — confirmado por esta auditoria não ter encontrado nenhuma inconsistência que exigisse correção indispensável de código (as duas únicas discrepâncias reais encontradas eram de documentação desatualizada, não de comportamento).

**Riscos remanescentes**: ver lista consolidada em §20 acima (nenhum novo risco crítico/alto encontrado nesta auditoria).

**Dívida técnica aceita**: BUG-05/06/08/09/10/11/15–21 (Média/Baixa, ADR #26/PROJECT_STATUS §16), coordenação distribuída entre pods (ADR #16), Value Objects adicionais (`PhoneNumber`, ADR #18), `WhatsAppChannel` separado de sessão de conexão (ADR #19), abstração para Cloud API (ADR #20), ausência de timeout em `provider.connect()` (ADR #29, achado F4), `latestQrCode` nunca limpo (ADR #26), ausência de TTL/limite no Registry (ADR #36/#42), circuit breaker que só reseta em conexão bem-sucedida (ADR #47).

**Itens futuros recomendados** (não implementados, não bloqueantes): Scheduler BullMQ (Item 6), UI de escaneamento de QR (Item 7), coordenação distribuída/multi-pod antes de qualquer deploy horizontal (ADR #16), avaliação de KMS real por tenant para rotação de chave de credenciais (ADR #21), tradução de exceções do Prisma para erros de Domain (BUG-20), evento `qr_updated` para eliminar polling de QR (BUG-06/15).

**Conclusão**: **a Production Hardening (Blocos 1–8b) está encerrada.** Todos os oito blocos foram implementados, testados (28/28 suítes, 224/224 testes) e validados por `tsc`/`npm test` reais executados pelo usuário ao final de cada etapa. A auditoria de encerramento (Bloco 9a) não encontrou nenhuma inconsistência arquitetural, nenhuma violação de SRP/DIP/OCP, nenhum código morto na árvore ativa, e nenhuma lacuna de cobertura de teste que exigisse correção de código — apenas gaps de documentação, corrigidos nesta mesma rodada (Bloco 9b). O módulo WhatsApp está arquiteturalmente pronto para os próximos itens do roadmap (Scheduler, UI de QR), sujeito aos riscos aceitos e à dívida técnica listados acima.

---

*Este documento deve ser atualizado ao final de cada item aprovado.*

## 22. Milestone 2 — Dashboard de Gestão de Sessões WhatsApp (Fases 1–4, concluída e validada)

**Redefinição de escopo** (ver ADR #52): "Milestone 2" passa a designar oficialmente o Dashboard de gestão de sessões WhatsApp entregue nesta sessão, não o "CRM Core" (Leads/Campanhas) do `ROADMAP.md`/`CLAUDE.md` originais — esse escopo original fica como backlog sem slot alocado (ver `CLAUDE.md` §11 atualizado). Executada em modo "produção acelerada" (checkpoints reduzidos, blocos mesclados por fase), com validação real do usuário (`tsc`/`npm test`/`prisma migrate`/`next build`) ao final de cada fase.

| Fase | Entregável | ADR | Validação |
|---|---|---|---|
| 1 | Backend REST completo: `listSessions`, `generation` no detalhe (`WhatsAppSessionDetails`), `removeSession` | #48 | 248/248 testes, `tsc` limpo |
| 2 | Histórico de eventos de sessão (`WhatsAppSessionEvent`, único ponto que toca `SessionManager.ts`) | #49 | 262/262 testes, `tsc`/`prisma generate` limpos, migration `20260709193407_add_whatsapp_session_event` |
| 3 | BFF completo (cookie httpOnly cifrado, proxy de 10 rotas, SSE via polling ~2s) | #50 | 325/325 testes (43 suítes, 2 projetos Jest), `tsc`/`next build` limpos |
| 4 | UI completa (login, lista, detalhe, QR Code via `qrcode.react`, ações, histórico) | #51 | 348/348 testes (47 suítes), `tsc`/`next build` limpos |

**Arquitetura resultante**:
```
Browser → Next.js (BFF, cookie httpOnly) → apps/api (X-API-Key) → WhatsAppSessionService → Registry → SessionManager → BaileysProvider
                ↑ SSE (poll ~2s sobre REST)
```

**Decisões estruturais principais** (detalhe completo nas ADRs #48–#51):
- API key do tenant NUNCA chega ao browser — fica só no cookie httpOnly do servidor Next.js.
- SSE implementado como polling do BFF sobre os endpoints REST já existentes (não push real de Domain) — trade-off de latência (1-3s) aceito para não expandir `WhatsAppProviderEvent`/tocar `SessionManager` além do estritamente necessário (Fase 2).
- `WhatsAppSessionEvent` é uma entidade separada de `WhatsAppSession` (log append-only vs. estado atual), sobrevive deliberadamente à remoção da sessão.
- QR Code renderizado no CLIENTE (`qrcode.react`) a partir da string crua que `getQRCode()` devolve — BFF continua um proxy fino, sem lógica de imagem.

**Bug pego em auto-revisão antes da entrega da Fase 4**: `useSessionsList`/`useSessionDetail` inicialmente liam o payload SSE (`{ status, body }`) como se fosse `body` direto — corrigido antes de qualquer validação do usuário (ver ADR #51, decisão 3).

**Riscos aceitos, documentados (não bloqueantes)**:
- Componentes React (`.tsx`) sem cobertura de teste automatizada — `jest.config.js` usa `testEnvironment: 'node'`, sem jsdom/Testing Library; toda lógica não-trivial foi extraída para `lib/` puro e testada, componentes ficam como cola fina verificada por `tsc`/`next build`. Revisitar se a superfície de UI crescer.
- Mesma latência de 1-3s do SSE-via-polling já aceita na Fase 3 permanece válida para toda a UI.
- `stream`/`qrcode`/`remove`/`history` continuam segmentos de path reservados sob `/sessions/:sessionName/` (ADR #50).

**Checklist Milestone 2**:
- [x] Backend REST completo (listar, detalhe com `generation`, remover)
- [x] Histórico de eventos de sessão
- [x] BFF (autenticação via cookie, proxy, SSE)
- [x] UI completa (login, lista, detalhe, QR Code, ações, histórico)
- [x] Zero regressão nos testes/contratos da Milestone 1 e da Production Hardening

**Conclusão**: Milestone 2 encerrada. Nenhum bloqueador conhecido para iniciar a Milestone 3 (ver §23 para a auditoria de estabilização feita antes de prosseguir, e o documento `MILESTONE_003_AI_AUTORESPONDER.md` para a arquitetura proposta).

---

## 23. Estabilização pós-Milestone-2 — Auditoria completa e correções de tooling (2026-07-09)

Auditoria solicitada explicitamente pelo usuário antes de iniciar a Milestone 3: código morto, imports mortos, dependências não usadas, TODO/FIXME, duplicação, violações de SOLID/Clean Architecture, riscos de segurança, gargalos de performance, oportunidades de simplificação. Detalhe completo de cada achado e correção na ADR #53.

**Metodologia**: varredura via `grep`/`eslint`/`tsc`/`npm test` reais (shell disponível nesta sessão, diferente de sessões anteriores) em `apps/api/src`, `apps/api/tests`, `apps/dashboard` — a árvore legada `src/`/`tests/unit/` (domínio `Conversations`, congelada pela ADR #11) foi varrida só para inventário, NUNCA modificada.

**Achados corrigidos (4, todos tooling, zero mudança de contrato público)**:
1. `ts-jest[config] (WARN) isolatedModules is deprecated` — duplicação entre `tsconfig.base.json` (`compilerOptions.isolatedModules: true`, já herdado) e a opção equivalente, agora legada, no nível do `ts-jest` em `jest.config.js`. Removida a duplicação.
2. **`npm run lint` completamente quebrado** (achado mais sério): `eslint.config.js` (scaffold da Milestone 0, nunca exercitado) fazia o ESLint 8.57+ auto-preferir "flat config" inválido, ignorando `.eslintrc.js` por completo. `eslint . --ext ...` falhava imediatamente — usado pelos 3 scripts `lint` do monorepo e pelo `ci.yml`. Corrigido forçando modo legado via `ESLINT_USE_FLAT_CONFIG=false` (nova dependência `cross-env`, necessária para funcionar no Windows).
3. 6 comentários `// eslint-disable-next-line import/first` mortos (referenciavam uma regra de um plugin nunca instalado) em 3 arquivos de teste — removidos.
4. `@typescript-eslint/no-unused-vars` sem `argsIgnorePattern: '^_'` — causava falso positivo em `requireApiKey.test.ts` (parâmetro `_next`, exigido pela aridade-4 de error handlers do Express). Regra ajustada para reconhecer a convenção de prefixo `_` já usada no código.

**Achados registrados, não corrigidos**:
- `WhatsAppProviderStatusUpdate.ts` (órfão, vazio, `@deprecated` desde ADR #14) permanece na árvore — sandbox sem capacidade de excluir arquivos (mesma limitação de sempre). **Correção da nota de §21**: este documento havia registrado incorretamente que o arquivo "já não existe mais na árvore" — na verdade, permanece presente. Recomenda-se remoção manual: `Remove-Item apps/api/src/services/whatsapp/domain/providers/WhatsAppProviderStatusUpdate.ts`.
- `docs/decisions/README.md` promete um padrão "um arquivo por ADR" nunca seguido — todas as 53 decisões vivem só em `DECISIONS.md`. Recomenda-se formalizar isso.
- Documentação de scaffold (`ROADMAP.md`, `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `TECH_STACK.md`, `DEVELOPMENT_GUIDELINES.md`, `CODING_STANDARDS.md`, `SECURITY.md`, `DATABASE.md`, `API_SPECIFICATION.md`, `CHANGELOG.md`, `TASKS.md`) majoritariamente em inglês (violando CLAUDE.md) e desatualizada (`ARCHITECTURE.md` nunca corrigido de Puppeteer→Baileys). Fora do escopo desta rodada (usuário nomeou explicitamente `CLAUDE.md`/`PROJECT_STATUS.md`/`DECISIONS.md`/`ROADMAP.md`) — decisão sobre os demais fica pendente de instrução explícita.
- `eslint.config.js` continua inválido, só neutralizado — migração completa para ESLint 9/flat config é item de manutenção de tooling futuro, não decidido nesta rodada.

**Confirmado, sem achados que exijam correção**:
- Zero TODO/FIXME/HACK/XXX reais na árvore ativa (`apps/api/src`, `apps/dashboard`).
- Todas as dependências declaradas em `apps/api/package.json`/`apps/dashboard/package.json` estão em uso real (verificado por `grep` de cada import).
- Nenhuma violação nova de SRP/DIP/OCP/ISP — direção de dependência entre camadas íntegra (Domain não importa de Application/Infrastructure/Presentation em nenhum arquivo tocado desde a última auditoria, §21).
- Nenhum risco de segurança novo — controles existentes (API key hasheada+pepper, IDOR fechado, credenciais cifradas por tenant, cookie httpOnly da Milestone 2) permanecem intactos e não foram tocados por esta rodada.
- Nenhum gargalo de performance novo introduzido pela Milestone 2 — SSE-via-polling é um trade-off já aceito (ADR #50), não uma regressão.

**Validação final**: `npm install` (pega `cross-env`), `npm run lint` (raiz — 0 problemas em `apps/api`/`apps/dashboard`, ~38 problemas pré-existentes confinados à árvore legada `src/`), `npx tsc --noEmit` (ambos os apps, limpo), `npm test` (47/47 suítes, 348/348 testes), `npx tsc --noEmit -p apps/dashboard/tsconfig.json` limpo. Nenhuma regressão.

**Conclusão**: projeto estabilizado. Nenhum bloqueador conhecido para iniciar a Milestone 3 (ver `MILESTONE_003_AI_AUTORESPONDER.md` para a arquitetura proposta, documento de planejamento, sem código implementado).

---

## 24. ADR #54 — Propriedade de socket e fila `whatsapp-outbound` (Milestone 3, pré-implementação)

**Contexto**: revisão arquitetural completa da Milestone 3 (`MILESTONE_003_AI_AUTORESPONDER.md`), solicitada explicitamente pelo usuário e conduzida antes de qualquer código, classificou cada dimensão relevante (Clean Architecture, DDD, SOLID, Ports & Adapters, BullMQ, worker separado, escalabilidade, retry, idempotência, observabilidade, multi-tenancy, RAG, tool calling, atendimento humano, múltiplos provedores de IA, evolução multi-canal). Encontrou **1 bloqueador estrutural real** (🔴): a topologia recomendada pelo próprio documento de M3 (worker BullMQ em processo separado, `apps/worker`) enviaria a resposta de IA "via `WhatsAppProvider.sendMessage()`, resolvido via `WhatsAppConnectionRegistry.getOrCreate()`" — mas o `Registry` é um `Map` em memória, válido só no processo `apps/api`, onde os sockets Baileys realmente vivem. Executado no processo do worker, isso abriria um **segundo socket Baileys para a mesma sessão**, o exato cenário que a ADR #16 (coordenação distribuída, Deferred) já havia identificado como não tratado — só que garantido, não hipotético, mesmo em instância única.

**Decisão**: três alternativas foram desenhadas e avaliadas em profundidade (diagrama de componentes, sequence diagram, impacto em Clean Architecture/DDD/SOLID, escalabilidade, operação, custo, complexidade, riscos, compatibilidade com ADRs existentes/Kubernetes/múltiplos workers/múltiplos canais, para cada uma):
- **Alternativa A** (escolhida) — worker nunca acessa `Registry`/`WhatsAppProvider`; publica comandos outbound via um novo port `OutboundMessageDispatcher`; `apps/api` consome via um novo componente `OutboundCommandConsumer`, na nova fila BullMQ `whatsapp-outbound`.
- Alternativa B — coordenação distribuída completa (lease/lock, Registry distribuído) — é, na prática, a implementação integral da ADR #16. Mais robusta a longo prazo, mas desproporcional ao estágio atual do projeto (deploy de instância única) e de complexidade/risco de concorrência mais altos que o histórico do projeto recomenda assumir agora (BUG-01 a BUG-21 já encontrados num modelo mais simples).
- Alternativa C — worker no mesmo processo da API — rejeitada por reacoplar permanentemente a escala de geração de IA à escala de conectividade WhatsApp, exatamente a dívida técnica que a M3 pretende evitar.

**Aprovação**: Alternativa A aprovada explicitamente pelo usuário. Formalizada como **ADR #54 (Accepted)** em `DECISIONS.md`, incorporada retroativamente ao `MILESTONE_003_AI_AUTORESPONDER.md` (Revisão 3) — nenhum trecho do documento de milestone menciona mais o worker enviando mensagens diretamente via `WhatsAppProvider`/`Registry`; todos os diagramas de componentes e sequence diagrams foram atualizados para refletir a fila `whatsapp-outbound` e o `OutboundCommandConsumer`. `ARCHITECTURE.md` §6/§6.1 atualizado com a topologia de processos (`apps/api` dono exclusivo dos sockets + `OutboundCommandConsumer`; `apps/worker` só IA, nunca sockets; duas filas BullMQ — `ai-reply` e `whatsapp-outbound`). `ROADMAP.md` recebeu nota explicativa da reorganização interna do Bloco 4 da M3 (sem mudança de escopo/timeline no nível de Roadmap).

**Auditoria de conflitos com ADRs anteriores (#1–#53)**: nenhuma contradição encontrada. Um cross-reference aditivo foi adicionado à ADR #16 (Deferred, inalterada em status) explicando que a ADR #54 é complementar — quando a coordenação distribuída for implementada, encaixa-se atrás do mesmo `OutboundCommandConsumer`, sem tocar `apps/worker`/`ai`/`conversations`. Nenhuma outra ADR precisou de alteração.

**Riscos/achados abertos registrados para o Bloco 4 (não bloqueiam o Bloco 1)**:
- `OutboundCommandConsumer` depende de a sessão já estar viva no `Registry` de `apps/api` — se a API reiniciou e nenhuma chamada HTTP reconectou a sessão ainda (P3, bootstrap/recuperação pós-restart, Deferred desde a Architecture Review original de 2026-07-06), o envio falharia sobre um socket inexistente. P3 deixa de ser um risco só de UI de status e passa a afetar diretamente a entrega de mensagens automatizadas — decisão necessária antes do Bloco 4.
- Idempotência do comando outbound (chave de dedup, para não reenviar em retry do BullMQ) — não implementada, decisão necessária antes do Bloco 4.
- `SessionManager` precisa de um novo método de envio (ex.: `sendMessage(content)`) sem parâmetro de identidade, para que `OutboundCommandConsumer` nunca precise tocar o `provider` diretamente — consistente com a restrição já fixada pela ADR #29.
- Achado independente de ADR #54, reafirmado nesta auditoria: `WhatsAppProvider.onEvent` aceita um único listener; com `message_received` (Bloco 1) e `status_changed` compartilhando o mesmo `SessionManager` como assinante único, o repasse interno a um `MessageReceivedHandler` funciona por construção, mas é um ponto de atenção de SRP a reavaliar se um terceiro tipo de evento precisar de outro consumidor. Não bloqueia o Bloco 1.

**Conclusão**: bloqueador estrutural da Milestone 3 resolvido antes do início da implementação. Arquitetura multiprocesso (`apps/api` + `apps/worker` + BullMQ `ai-reply`/`whatsapp-outbound`) estabilizada e documentada em `ARCHITECTURE.md`, `MILESTONE_003_AI_AUTORESPONDER.md` e `DECISIONS.md`. Aguardando nova autorização explícita do usuário para iniciar o Bloco 1.

---

## 25. Milestone 3 — IA Autoresponder — Blocos 1 a 4 (implementados e validados)

**Status geral**: Blocos 1, 2, 3a, 3b e 4 concluídos e validados. Bloco 5 concluído — ver §26 abaixo. Bloco 6 (UI opcional no Dashboard) permanece pendente — ver `MILESTONE_003_AI_AUTORESPONDER.md` §3.

**Bloco 1 — extensão mínima de `services/whatsapp/`**: `WhatsAppProviderEvent` ganhou o membro `'message_received'`; `WhatsAppProvider` ganhou `sendMessage()`; `BaileysProvider` implementa ambos, com filtros de `fromMe`/mensagem de grupo; `SessionManager` ganhou dependência opcional `MessageReceivedHandler`.

**Bloco 2 — Domain de Conversas (`services/conversations/`)**: entidades `Conversation`/`Message`; ports `ConversationRepository`/`MessageRepository` (+ implementações Prisma) e `AiReplyScheduler` (só port, sem implementação real neste bloco); `MessageIngestionService implements MessageReceivedHandler` — persiste a mensagem inbound e agenda IA via `AiReplyScheduler.schedule()`; policy `shouldAutoRespond(conversation)`. Models `WhatsAppConversation`/`WhatsAppMessage` no `prisma/schema.prisma`.

**Bloco 3a — Abstração de IA (`services/ai/`)**: ports `AiProvider`/`AiProviderFactory`/`AiProviderName`; `ClaudeAiProvider` (único arquivo autorizado a importar `@anthropic-ai/sdk`) + `AiProviderFactoryImpl` (resolve por `Map`); `PromptBuilder`; `PromptVersion` (registro estático em código, `PROMPT_VERSIONS`); `ReplyValidator` (rejeita sem lançar — resultado `{valid, reason}`).

**Bloco 3b — Auditoria/billing (`AiInteraction`)**: entidade + port `AiInteractionRepository` (`record()`/`linkMessage()`) + `PrismaAiInteractionRepository` (`costUsd` como `Decimal`, nunca `Float`); `ConversationAiService` (orquestrador: `PromptBuilder` → `AiProviderFactory.create().generateReply()` → `ReplyValidator` → `AiInteractionRepository.record()` em TODA tentativa, sucesso ou falha). Ainda sem fila neste bloco — chamado direto nos testes.

**Bloco 4 — filas BullMQ `ai-reply`/`whatsapp-outbound` + worker de IA (ADR #54, decisões D1–D4 na ADR #55)**:
- `BullMqAiReplyScheduler` (produtor real de `AiReplyScheduler`, `jobId = tenantId:conversationId:messageId`).
- `OutboundMessageDispatcher` (port novo, Domain de `services/whatsapp`) + `BullMqOutboundMessageDispatcher` (produtor, `jobId = aiInteractionId`) + `OutboundCommandConsumer` (Infrastructure de `services/whatsapp`, instanciado dentro de `apps/api` — ainda não ligado ao composition root real de `index.ts`, isso é Bloco 5).
- `AiReplyJobProcessor` (`services/ai/application/`) — orquestra um job `ai-reply`: busca conversa, re-checa `shouldAutoRespond()`, busca histórico (`MessageRepository.listRecentByConversation()`, invertido para ordem cronológica), chama `ConversationAiService.generateReply()`, despacha via `OutboundMessageDispatcher` quando bem-sucedido. Testável com Fakes, sem Redis/BullMQ real.
- `apps/api/src/worker.ts` — entrypoint do worker de IA (decisão D1: mesmo pacote de `apps/api`, processo Node separado). Falha rápido se `DATABASE_URL`/`REDIS_URL`/`CLAUDE_API_KEY`/`AI_CLAUDE_MODEL` ausentes; loga `completed`/`failed` de todo job; encerramento gracioso via `SIGTERM`/`SIGINT`.
- `docker-compose.yml`: novo serviço `worker` (mesma imagem de `api`, `command` diferente, `depends_on` só `postgres`/`redis`). `apps/api/package.json`: scripts `dev:worker`/`start:worker`. `.env.example`: seção nova com `CLAUDE_API_KEY`/`AI_CLAUDE_MODEL`/`AI_CLAUDE_MAX_TOKENS`/`AI_PROMPT_VERSION`/`AI_HISTORY_LIMIT`.
- Decisões arquiteturais (D1–D4) e de design (simplificação do payload de `OutboundMessageCommand`, extração de `AiReplyJobProcessor`) registradas na ADR #55. Achados de ambiente (corrupção adicional do Prisma Client no sandbox; divergência de versão do `ioredis` corrigida) registrados na ADR #56.

**Validação final do Bloco 4** (raiz do monorepo, `npx jest`/`npm run lint --workspace=apps/api`/`npx tsc --noEmit` a partir de `apps/api`): 63/63 suítes, 450/450 testes, lint limpo. `tsc --noEmit`/`npm run build` de `apps/api` restam com exatamente 4 erros, todos em `PrismaAiInteractionRepository.ts`, causados por uma corrupção do Prisma Client **exclusiva deste ambiente de execução sandboxed** (regeneração bloqueada por falta de acesso de rede a `binaries.prisma.sh` — ver ADR #56) — zero impacto em `npm test` (todo import do Prisma Client nesses arquivos é `import type`, apagado pelo `ts-jest`) e irrelevante na máquina real do usuário.

**Pendente antes do Bloco 5**: nenhum bloqueador identificado. Bloco 5 precisa, entre outras coisas, ligar `OutboundCommandConsumer` ao composition root real de `apps/api/index.ts` (hoje só testado isoladamente) e expor os endpoints REST de conversas/escalonamento/auditoria de IA listados em `MILESTONE_003_AI_AUTORESPONDER.md` §3.

---

## 26. Milestone 3 — IA Autoresponder — Bloco 5 (endpoints REST + composition root final, concluído e validado)

**Status geral**: Bloco 5 concluído — decisões D5–D19 do levantamento arquitetural (`BLOCO_5_LEVANTAMENTO_ARQUITETURAL.md`) todas implementadas, ver ADR #57 para o detalhe completo. Pipeline inbound→IA→outbound agora fechado de ponta a ponta dentro de `apps/api`, com endpoints REST de conversas/escalonamento/auditoria de IA expostos pela primeira vez.

**Pipeline fechado (D5/D15)**: `WhatsAppConnectionRegistry`/`createWhatsAppSessionsComposition` ganharam um `messageReceivedHandler` opcional (exceção formal aditiva à ADR #45), permitindo que `index.ts` monte a cadeia real na ordem `ai` (`createAiComposition`) → `conversations` (`createConversationsComposition`, D6) → `whatsapp` (consumindo `messageIngestionService`) → consumidor outbound (`createOutboundCommandConsumerWorker`, D7, reaproveitando a mesma instância de `Registry`) → montagem dos três routers. Duas conexões `IORedis` distintas no processo `apps/api` (produtor `ai-reply` / consumidor `whatsapp-outbound`, D19), nunca compartilhadas entre papéis. `REDIS_URL` ausente degrada graciosamente, mantendo só as rotas de `whatsapp-sessions` (D8).

**Endpoints REST novos**: `GET .../conversations` (paginação por cursor, D11), `GET .../conversations/:id/messages` (reaproveita `listRecentByConversation`, invertido para ordem cronológica, D12 — não é paginação completa, limitação documentada), `POST .../conversations/:id/escalate` e `.../resume` (`updateStatus()` único e idempotente, D10), `GET .../ai-interactions?conversationId=` (parâmetro opcional, D13). Routers separados por bounded context (`conversationsRouter`/`aiInteractionsRouter`, D16), sem classe Controller (D18, mesmo padrão de `whatsAppSessionsRouter`).

**Correções de bugs pré-existentes**: `TenantNotFoundError` nunca era mapeado em `whatsAppErrorHandler` (caía num 500 cego) — corrigido (D14), e já nascendo correto nos dois novos handlers. Achado de maior risco do levantamento (D17): error handlers globais sem path-scoping engoliriam erros de bounded contexts vizinhos, porque `whatsAppErrorHandler` nunca delega erro desconhecido via `next(error)` — todos os três handlers agora são montados escopados por path em `index.ts`, com teste de regressão dedicado (`tests/errorHandlerChaining.test.ts`).

**Extração para `shared/` (D9)**: `requireApiKey`/`RequestWithTenant` e `asyncHandler`/`validateOrRespond` movidos de `services/whatsapp/presentation/` para `shared/presentation/` — gatilho previsto desde a Production Hardening ("extrair quando existir um segundo consumidor"), atingido pelos routers de `conversations`/`ai`.

**Shutdown gracioso**: `index.ts` ganhou seu primeiro handler de `SIGTERM`/`SIGINT` (lacuna introduzida pelo próprio Bloco 5 ao manter `Worker`/conexões Redis vivos no processo HTTP) — fecha `server` → `outboundWorker` → conexão Redis produtora → Prisma, nessa ordem.

**Validação final**: 73/73 suítes, 510/510 testes (todos verdes) — 44 testes novos nesta rodada. Lint limpo em `apps/api`. `tsc --noEmit` mostra 6 erros (eram 4 no Bloco 4), todos confinados a `PrismaAiInteractionRepository.ts`, mesma corrupção pré-existente do Prisma Client exclusiva do sandbox (ADR #56) — as 2 novas ocorrências vêm só dos 2 métodos novos de listagem (`listByConversation`/`listByTenant`), zero impacto em runtime de testes.

**Achados registrados, não corrigidos (fora de escopo deste bloco)**:
- ~38 erros de lint pré-existentes num domínio legado congelado na raiz do monorepo (`src/`, `tests/unit/` — "Milestone 003" antiga, ADR #11), não relacionados a este bloco.
- Dois arquivos não puderam ser fisicamente removidos neste sandbox (`services/whatsapp/presentation/requireApiKey.ts` e seu teste, `rm`/`mv` com `EPERM`) — viraram stubs de re-export com ação pendente documentada inline para remoção manual (`git rm`) no ambiente real.

**D11/D13 resolvidos por iniciativa própria**: o levantamento sinalizava ambos como dependentes de escolha de produto, não só técnica. Como a implementação foi autorizada sem revisão individual das decisões, adotei a recomendação técnica já registrada (cursor para paginação; `conversationId` opcional para o endpoint de auditoria) — nenhum dos dois tem consumidor externo ainda (Bloco 6 não implementado), revisitável sem quebra caso a direção de produto divirja. Ver ADR #57 para o detalhe.

**Pendente**: Bloco 6 (UI opcional no Dashboard) — ver §27 abaixo (concluído). Milestone 4 (Analytics) — ver §28.

---

## 27. Milestone 3 — Bloco 6: UI de Conversas/IA no Dashboard (concluído e validado)

**Status geral**: Bloco 6 concluído — decisões D20–D34 (aprovadas explicitamente, ver `BLOCO_6_LEVANTAMENTO_ARQUITETURAL.md` e ADR #58) todas implementadas. Escopo estritamente frontend: **nenhum arquivo de `apps/api` foi alterado** (restrição da aprovação, cumprida). Com isso, a Milestone 3 (IA Autoresponder) está completa em todos os blocos (1, 2, 3a, 3b, 4, 5, 6).

**BFF (`pages/api/*`)**: `lib/apiClient.ts` generalizado via `createApiClient(resource)` (D21 — `callApi` preservado, zero call sites alterados; novos `callConversationsApi`/`callAiInteractionsApi`). 6 rotas novas (D22), proxy fino sobre os endpoints do Bloco 5: `conversations/{index,stream}`, `conversations/[conversationId]/{messages,escalate,resume}`, `ai-interactions/index`. SSE só na lista de conversas (D23, `runSsePoller` reaproveitado sem alteração); todo o resto via fetch simples.

**UI**: 2 páginas novas (`/conversations`, `/conversations/[conversationId]`) + link no Sidebar (D34). Lista com primeira página viva via SSE, "Carregar mais" por cursor com dedupe client-side (`lib/conversationsView.ts`, lógica pura testada — D24) e filtro `bot`/`human` resolvido no servidor (D25). Detalhe com status atual no cabeçalho (D26 — sem marcador de escalonamento na timeline, limitação documentada), timeline com selo "Gerada por IA" via correlação `messageId` sobre um único fetch (D27), ações escalonar/retomar com banner inline de sucesso/erro (D31) e painel de AI Interactions embutido (D28 — provider, modelo, prompt, tokens, custo como string decimal exata, latência, status, timestamps). Componentes novos: `ConversationListItem`, `ConversationStatusBadge`, `ConversationFilterTabs`, `LoadMoreButton`, `MessageBubble`, `MessageTimeline`, `ConversationActions`, `AiInteractionPanel`, `AiInteractionRow`, `AiInteractionStatusBadge`. Hooks novos: `useConversationsList`, `useConversationDetail`, `useMessagesTimeline`, `useAiInteractions`. Token `colors.primary: '#0A74DA'` no Tailwind (D30, só componentes novos). Sem Context novo (D32), sem virtualização (D33), sem dependência nova.

**Achado registrado para bloco futuro de backend**: não existe `GET .../conversations/:id` no Bloco 5 — `useConversationDetail` localiza a conversa varrendo a listagem paginada (`limit=200`, até 5 páginas ≈ 1000 conversas mais recentes; além disso, URL direta não localiza). Recomendação: endpoint de detalhe aditivo (o `findById` do port já existe desde o Bloco 4).

**Validação final**: 80/80 suítes, 536/536 testes (26 casos novos — 22 de rotas BFF + 4 de lógica pura; D29: sem jsdom, componentes `.tsx` validados por `tsc`/lint, mesmo risco aceito da ADR #51). Lint limpo nos dois workspaces. `tsc --noEmit` do dashboard limpo. **`next build` completo pendente de confirmação na máquina real**: a fase de type-check do build passou no sandbox, mas o compile webpack excede o teto de 45s de execução do ambiente (mesma situação da M2 — ADRs #50/#51, "confirmado pelo usuário"). `next.config.js` permanece idêntico ao original (alteração temporária de diagnóstico revertida, diff zero).

---
## 28. Milestone 4 — Analytics (M4A–M4E implementados; encerramento com pendências de validação na máquina real)

**Status geral**: Milestone 4 implementada por completo (sub-blocos M4A–M4E do plano da ADR #59/`MILESTONE_004_ANALYTICS_LEVANTAMENTO.md`), sob a restrição-mãe D51 (analytics 100% read-only, derivado em tempo de consulta — zero cache/rollup/fila/scheduler). Ver ADR #60 para o detalhe completo.

**M4A**: avisos de "documento superado" nos 4 docs stale; migration aditiva `20260717120000_add_analytics_indexes` (só 2 `CREATE INDEX` — D43).

**M4B (domain/application)**: `services/analytics` — DTOs (`costUsd` string, D46), port `AnalyticsRepository` (única fronteira Application↔Infrastructure), `InvalidAnalyticsRangeError`, `AnalyticsService` (valida tenant + faixa com `MAX_WINDOW_DAYS=366`, delega). 11 testes verdes.

**M4C (infrastructure/presentation/wiring)**: `PrismaAnalyticsRepository` — única camada do projeto com SQL: 5 consultas `$queryRaw`+`Prisma.sql` parametrizadas (`date_trunc` UTC, `COUNT/SUM/AVG/FILTER`, custo `::text`); `createAnalyticsComposition`; `analyticsRouter` (Zod, thin); `analyticsErrorHandler` (400/404, path-scoped); wiring aditivo em `index.ts` nas duas ramificações (analytics não depende de Redis — montado também no modo degradado). 21 testes verdes (incl. anti-injection e IDOR).

**M4D (BFF)**: `callAnalyticsApi`; 4 rotas proxy `pages/api/analytics/*`; DTOs/fetchers em `clientApi.ts`. 8 testes verdes.

**M4E (UI)**: `recharts@2.12.7` + jsdom/Testing Library (D49); terceiro projeto Jest `dashboard-jsdom` isolado (`tests-jsdom/`, suítes `node` intocadas); `lib/analyticsView.ts` (conversão costUsd→number SÓ na fronteira do gráfico; `sumCostUsd` em BigInt sem float; `fillMissingDays`; 8 testes `node` verdes); hooks de fetch simples; componentes de gráfico; página `/analytics` com metric cards e nota de UTC; link no Sidebar. 6 casos de teste de componente escritos (2 suítes jsdom).

**Validação observada no sandbox**: 48 casos novos da M4 verdes (11 M4B + 21 M4C + 8 M4D + 8 analyticsView); lint limpo em todos os arquivos novos/alterados; `tsc --noEmit` do dashboard limpo (inclui recharts e tests-jsdom).

**Pendências de validação NA MÁQUINA REAL** (o sandbox impediu — mesma classe das ADRs #53/#56; nenhuma é pendência de implementação):
1. `npm install` na raiz (reconciliar `package-lock.json` — o sandbox bloqueou renames do npm; as deps novas do dashboard estão no `package.json`).
2. `npx prisma migrate dev` / `prisma generate` (rede bloqueada no sandbox, ADR #56).
3. `npm test` completo, incluindo a primeira execução do projeto `dashboard-jsdom` (jsdom+recharts não carregam dentro do teto de execução do sandbox).
4. `npm run build -w apps/dashboard` (`next build` — pendência herdada desde a M2).

---

*Este documento deve ser atualizado ao final de cada item aprovado.*
