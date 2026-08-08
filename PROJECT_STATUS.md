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

| #   | Item                                                                                         | Status                                                                              |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Port `WhatsAppProvider` (Domain) + correção do import no `SessionManager` + testes unitários | ✅ Concluído                                                                        |
| 2   | `prisma/schema.prisma` — models `Tenant` + `WhatsAppSession` (Milestone 1)                   | ✅ **Concluído nesta sessão**                                                       |
| 3   | `WhatsappProvider` — implementação concreta com Baileys (Infrastructure)                     | ✅ **Concluído nesta sessão — ver §11**                                             |
| 4   | `WhatsAppSessionRepository` — implementação concreta com Prisma (Infrastructure)             | ✅ **Concluído nesta sessão — ver §14, ADR #24**                                    |
| 5   | Endpoints REST de sessão (`API_SPECIFICATION.md` §3.5)                                       | ✅ **Concluído — ver §19, ADRs #33–#38**                                            |
| 6   | Scheduler básico BullMQ                                                                      | Pendente                                                                            |
| 7   | UI de escaneamento de QR no dashboard                                                        | Pendente                                                                            |
| 8   | Testes de integração (Baileys mockado)                                                       | ✅ **Coberto pela suíte de testes do Item 5 + Production Hardening (28/28 suítes)** |

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

| ID  | Problema                                                                                                                                                                                                  | Gravidade           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| P1  | `SessionManager` fixa **um único** `WhatsAppProvider` no construtor, mas `init(tenantId, sessionName)` é genérico — incompatível com múltiplas sessões/tenants simultâneos. Achado mais grave da revisão. | Crítica             |
| P2  | Nenhum port/model para persistir credenciais Baileys (auth state). Sem isso, reconexão após restart é impossível. **RESOLVIDO em 2026-07-06 via M1A.6 — ver §9.4, ADR #21.**                              | Crítica (resolvida) |
| P3  | Nenhuma estratégia de bootstrap/recuperação de sessões após reinício do processo (depende de P1+P2).                                                                                                      | Crítica             |
| P4  | Enum `WhatsAppSessionStatus` não distingue "queda temporária" de "deslogado, precisa novo QR".                                                                                                            | Alta                |
| P5  | String `'baileys'` hardcoded em `SessionManager.ts` — vazamento de detalhe de Infrastructure para Application.                                                                                            | Alta                |
| P6  | Race condition: `init()` concorrente para a mesma sessão pode disparar dupla `create()`; violação de unicidade não tratada.                                                                               | Alta                |
| P7  | Zero logging/observabilidade em todo o módulo.                                                                                                                                                            | Alta (mínimo)       |

Classificados como "pode esperar" (P8/P9/P12: observabilidade completa, afinidade de sessão para múltiplas réplicas, índice composto) e "melhoria futura" (P10/P11/P13: Domain Events, enum de provider, soft-delete) — detalhes completos na conversa.

**Item 3 (BaileysProvider) fica bloqueado até P1–P6 (e ao menos o desenho de P3) serem resolvidos.**

---

## 9. M1A — Architecture Hardening

Plano original em `docs/whatsapp/M1A-ARCHITECTURE-HARDENING.md` (itens M1A.1–M1A.7). **Superseded pelo Architecture Gate Review de 2026-07-06** (ver §8.1): em vez de M1A.2–M1A.7 como itemizados originalmente, o escopo final "antes do Baileys" passou a ser exatamente os achados F2, F6 e validação de schema do Gate Review — F1/F3/F4/F5/F9 foram registrados em ADR (#16–#20) e adiados, não implementados.

| #                  | Item                                                                 | Status                                   |
| ------------------ | -------------------------------------------------------------------- | ---------------------------------------- |
| M1A.1              | Logger port (Domain) + wiring mínimo                                 | ✅ Concluído                             |
| F2                 | Canal de eventos genérico (`onEvent` + união discriminada)           | ✅ **Concluído nesta sessão**            |
| F6                 | `provider` como enum (Prisma + Domain)                               | ✅ **Concluído nesta sessão**            |
| —                  | Validação do `schema.prisma` (`validate`/`generate`/`migration`)     | ⚠️ **Parcial — ver §9.3**                |
| F1, F3, F4, F5, F9 | Registrados em ADR (#16–#20), não implementados                      | Adiado (deliberado)                      |
| M1A.6              | Persistência de credenciais (`CredentialsStore` + `Cipher`, ADR #21) | ✅ **Concluído nesta sessão — ver §9.4** |

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

| Bloco | Entregável                                                                                                            | ADR           |
| ----- | --------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1     | `WhatsAppSessionKey` (Value Object de identidade, `tenantId`+`sessionName`)                                           | #33           |
| 2     | `WhatsAppProviderFactory` (port) + `BaileysProviderFactory` + Fake                                                    | #34           |
| 3     | Refatoração do `SessionManager` (identidade via `sessionKey`, mutex de ciclo de vida, remoção de `assertOwnsSession`) | #29           |
| 4     | `WhatsAppQRCodeNotAvailableError` (BUG-07)                                                                            | #35           |
| 5     | `WhatsAppConnectionRegistry` (pool de `SessionManager` por sessão)                                                    | #36           |
| 6     | Extração de Fakes compartilhadas entre suítes de teste (`testDoubles.ts`)                                             | — (só testes) |
| 7     | Rotas REST (`whatsAppSessionsRouter.ts`) + composition root inicial                                                   | #37           |
| 8     | Wiring em `index.ts` (import dinâmico, guard de env vars)                                                             | #38           |

**Nota importante**: o router e o composition root descritos na ADR #37 (Bloco 7/8 deste Item) foram REFATORADOS na Production Hardening (Bloco 7, ADR #45) para depender de `WhatsAppSessionService` em vez do `WhatsAppConnectionRegistry` diretamente — a versão vigente do fluxo HTTP é a descrita em §20/ADR #45, não a original deste Item.

Também corrigidos, ainda dentro deste arco, dois problemas encontrados em validação manual real com um número de WhatsApp de verdade: regressão ESM do Baileys quebrando `health.test.ts` (ADR #38), necessidade de `fetchLatestBaileysVersion()` (ADR #31), e BUG-14/reconexão obrigatória após `restartRequired` (ADR #32, hoje superseded pela ADR #47).

---

## 20. Production Hardening — Blocos 1–8b (concluído e validado)

Objetivo: levar o módulo WhatsApp de "funciona com um único tenant, sem autenticação" para "seguro para múltiplos tenants reais via API própria, com reconexão resiliente". Oito blocos sequenciais, cada um aprovado e validado (`tsc`/`npm test`) antes do próximo. Ver DECISIONS.md ADRs #39–#47 para o detalhe arquitetural completo.

| Bloco      | Entregável                                                                            | ADR |
| ---------- | ------------------------------------------------------------------------------------- | --- |
| 1 (+1-bis) | `TenantRepository` (Shared Kernel, somente leitura) em `shared/tenant/`               | #39 |
| 2          | `ApiKeyHasher` (HMAC-SHA256 + pepper)                                                 | #40 |
| 3          | Script local de emissão de API key (`issueApiKey.ts`)                                 | #41 |
| 4          | Contador de `generation` + `evictIfCurrent` (evicção segura do Registry)              | #42 |
| 5          | `WhatsAppSessionService` (valida tenant antes de delegar ao Registry)                 | #43 |
| 6          | `requireApiKey` + `resolveTenantFromApiKey` + `sanitizeHeaders` — fecha o IDOR/C1     | #44 |
| 7          | Wiring HTTP real (composition root estendido + router refatorado + `index.ts`)        | #45 |
| 8a         | `disconnectReason` — classificação do motivo da última desconexão                     | #46 |
| 8b         | Reconexão automática com backoff exponencial + circuit breaker (`ReconnectionPolicy`) | #47 |

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

_Este documento deve ser atualizado ao final de cada item aprovado._

## 22. Milestone 2 — Dashboard de Gestão de Sessões WhatsApp (Fases 1–4, concluída e validada)

**Redefinição de escopo** (ver ADR #52): "Milestone 2" passa a designar oficialmente o Dashboard de gestão de sessões WhatsApp entregue nesta sessão, não o "CRM Core" (Leads/Campanhas) do `ROADMAP.md`/`CLAUDE.md` originais — esse escopo original fica como backlog sem slot alocado (ver `CLAUDE.md` §11 atualizado). Executada em modo "produção acelerada" (checkpoints reduzidos, blocos mesclados por fase), com validação real do usuário (`tsc`/`npm test`/`prisma migrate`/`next build`) ao final de cada fase.

| Fase | Entregável                                                                                                 | ADR | Validação                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------- |
| 1    | Backend REST completo: `listSessions`, `generation` no detalhe (`WhatsAppSessionDetails`), `removeSession` | #48 | 248/248 testes, `tsc` limpo                                                                           |
| 2    | Histórico de eventos de sessão (`WhatsAppSessionEvent`, único ponto que toca `SessionManager.ts`)          | #49 | 262/262 testes, `tsc`/`prisma generate` limpos, migration `20260709193407_add_whatsapp_session_event` |
| 3    | BFF completo (cookie httpOnly cifrado, proxy de 10 rotas, SSE via polling ~2s)                             | #50 | 325/325 testes (43 suítes, 2 projetos Jest), `tsc`/`next build` limpos                                |
| 4    | UI completa (login, lista, detalhe, QR Code via `qrcode.react`, ações, histórico)                          | #51 | 348/348 testes (47 suítes), `tsc`/`next build` limpos                                                 |

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

## 29. Milestone 5 — Autenticação, RBAC e Multiusuário (M5A–M5H-lite) — concluída e validada

> Este documento não foi atualizado durante a execução da M5 (lacuna identificada e registrada em auditoria posterior) — entrada retroativa. O registro técnico completo, decisão por decisão, vive em `CLAUDE.md` §18 ("Milestone 5 — Auth, RBAC e Multiusuário"); esta seção é o resumo de status.

Bounded context `services/auth` completo: usuários com senha scrypt, access token JWT curto + refresh token com rotação e detecção de reuso, RBAC fixo em código (5 cargos), trilha de auditoria append-only, gestão de usuários com hierarquia estrita, `authenticate` dois-planos (Bearer OU API key) nas rotas de conversas/sessões. BFF com cookie httpOnly de sessão de pessoa, login e-mail/senha, troca de senha obrigatória. UI: login, `/change-password`, `/users` (RH), Header com usuário logado. Rate limit de login em memória (por IP).

**Validado na máquina real**: 761+ testes. **Pendências conhecidas, não bloqueantes** (ver `CLAUDE.md` §18 e ADR relevante): viewer de auditoria na UI, CSRF token explícito (mitigado por `SameSite=Lax`), lockout por conta (mitigado por rate limit por IP), rate limit compartilhado via Redis para múltiplas instâncias. Provisionamento de tenant/usuário permanece manual (scripts `createOwner.ts`/`issueApiKey.ts`) — signup automatizado (M5I) avaliado e **adiado** (ver ADR #61).

---

## 30. Milestone 6 — Product Experience — Bloco M6A (fundação do Design System) — ✅ concluído

**Contexto**: após validação manual do protótipo (WhatsApp real, IA com Base de Conhecimento, atendimento humano pela Dashboard), análise estratégica (CTO/PM/UX) concluiu que o maior gargalo passou a ser a experiência do produto, não a arquitetura. `PRODUCT_PRINCIPLES.md` e `USER_JOURNEY.md` (raiz do projeto) formalizam essa direção. Slot M6 do roadmap redefinido de "Deploy Production" (agora M7) para "Product Experience" — ADR #61.

**M6A (fundação)**: ADRs #61–#66 registradas. shadcn/ui (style "new-york") + Radix UI + lucide-react + Framer Motion + cva/clsx/tailwind-merge configurados (`components.json`, `lib/utils.ts`). Tokens de cor via CSS variables (`styles/globals.css`) — baseline shadcn/ui + extensão semântica do produto (`success`/`warning`, mapeando o contrato de cor de `PRODUCT_PRINCIPLES.md` §2.3). Tipografia/espaçamento/breakpoints confirmados como já-corretos nos defaults do Tailwind (não redefinidos — YAGNI). Fonte Inter ativada globalmente via `next/font/google` (`pages/_app.tsx`) — única mudança visual perceptível deste bloco. Primeiro primitivo `components/ui/button.tsx` criado como prova de pipeline, com 5 testes jsdom. `DESIGN_SYSTEM.md` (raiz) documenta a linguagem visual resultante. **Nenhum dos 26 componentes de domínio existentes foi alterado; nenhuma tela mudou de aparência além da fonte.**

**Validação real (máquina do usuário, 2026-07-23)**: `npm install` ok. `tsc --noEmit` limpo. `next build` compilou as 36 rotas com sucesso. `dashboard-jsdom`: 3/3 suítes, 12/12 testes verdes. `npm run lint` acusou, na primeira rodada, 3 erros (`@typescript-eslint/no-var-requires` em `next.config.js` e `tailwind.config.js`) + 1 warning (`@next/next/no-html-link-for-pages` em `button.test.tsx`) — dívida pré-existente exposta pela reinstalação completa do lockfile, não regressão do M6A (ver `CLAUDE.md` §18, entrada da M6). Corrigido: override de regra em `.eslintrc.js` raiz restrito a arquivos de config CommonJS + `eslint-disable` pontual no teste (uso do `<a>` ali é prova do Radix Slot, não navegação real).

## 30.1 Milestone 6 — Bloco M6B (identidade de marca v1 — "Francis") — ✅ concluído

**Contexto**: com a fundação do Design System pronta (M6A), o produto ainda não tinha nome, logo nem `<title>` de página. Nome e marca foram definidos numa sessão de exploração dedicada com o usuário (brainstorm + checagem informal de disponibilidade a cada candidato — várias opções descartadas por colisão real: "FrancConnect" ≈ "FranConnect", franquias; "Francis Automation" ≈ "Francis Automates", automação). Escopo ajustado pelo usuário em relação ao plano original: marca 100% centralizada em código, e favicon/assets binários adiados (marca v1 iterável, só SVG por ora) — ver ADR #67.

**Entregue**: `apps/dashboard/lib/brand.ts` (fonte única — `name`, `tagline`, `assistantName`, `description`, helper `pageTitle`); `components/brand/FrancisLogo.tsx` (símbolo balão+check, SVG) e `FrancisWordmark.tsx` (símbolo + nome, tagline opcional); marca aplicada na Sidebar (topo) e no login (com tagline); `<title>` próprio em todas as 9 páginas (`Página · Francis`); novo `_document.tsx` (`lang="pt-BR"`); `BRAND.md` (raiz) documentando nome, tagline, personalidade ("prestativo, direto e transparente"), símbolo e cor (reusa o token `primary` já existente, `#0A74DA`). Nenhuma string de marca hardcoded em componente. Nenhum contrato de API/BFF alterado; dos componentes de domínio existentes, só Sidebar e login foram tocados (apenas acréscimo).

**Validação real (máquina do usuário, 2026-07-24)**: `tsc --noEmit` limpo. `npm run lint` limpo (sem erros/warnings novos). `next build` compilou as 36 rotas com sucesso. `dashboard-jsdom`: 4/4 suítes, 20/20 testes verdes (9 novos de marca — logo, wordmark, tagline, `pageTitle` — após corrigir uma ambiguidade de query no teste, não no componente: o `<title>` de acessibilidade do SVG e o `<span>` visível têm o mesmo texto).

---

## 30.2 Milestone 6 — Bloco M6C (biblioteca de primitivos) — ✅ concluído

**Contexto**: com fundação (M6A) e marca (M6B) prontas, faltava a biblioteca de componentes reutilizáveis pro retrofit (M6E+). Auditoria já apontava 3 badges de status duplicados (`StatusBadge`, `ConversationStatusBadge`, `AiInteractionStatusBadge` — mesma estrutura visual, tipos diferentes). Usuário aprovou: (1) Radix Toast em vez de Sonner (consistência com ADR #62); (2) aproveitar o bloco pra eliminar a duplicação dos badges.

**Entregue**: 7 primitivos em `components/ui/` — `Input`, `Card` (+Header/Title/Description/Content/Footer), `Badge` (variantes `default`/`secondary`/`destructive`/`success`/`warning`/`outline`, `success`/`warning` mapeando o contrato de cor já documentado), `Select` e `Dialog` (`@radix-ui/react-select`/`@radix-ui/react-dialog`), `Toast`+`useToast`+`Toaster` (`@radix-ui/react-toast`, `<Toaster/>` montado em `_app.tsx`), `Table` (semântico). Dedup real: os 3 badges de status agora compõem `Badge` por baixo (`variant="outline"` + cor resolvida em `lib/formatters.ts` via `className`) — mesma aparência pixel-a-pixel, tipo e lógica de cor intocados. Nenhuma tela de domínio consome os primitivos novos ainda (retrofit é M6E+), exceto os 3 badges. Ver ADR #68.

**Validação real (máquina do usuário, 2026-07-24)**: `npm install` ok (37 pacotes novos — `@radix-ui/react-select`, `@radix-ui/react-dialog`, `@radix-ui/react-toast`). `tsc --noEmit` limpo. `npm run lint` limpo. `next build` compilou as 36 rotas com sucesso. `dashboard-jsdom`: 11/11 suítes, **39/39 testes verdes** — incluindo interação real de abrir/fechar Dialog e disparo de Toast, que não puderam ser validados no sandbox de desenvolvimento (confirmado funcionando na máquina real).

---

## 30.3 Milestone 6 — Bloco M6D (Skeleton, EmptyState, ErrorState — contrato de estados) — ✅ concluído

**Contexto**: com a biblioteca de primitivos pronta (M6C), faltavam as peças concretas do contrato de 4 estados já normatizado (ADR #64). Levantamento em `pages/*.tsx` confirmou o padrão a substituir no retrofit: cada tela com seu próprio `<p>` avulso para carregando/vazio/erro, textos inconsistentes entre telas, e nenhuma com ação de tentar de novo — apesar de os hooks (`useSessionsList`, `useConversationDetail` etc.) já exporem `refresh()`.

**Entregue**: `Skeleton` (`components/ui/skeleton.tsx`, sem forma própria — `className` define o formato). `EmptyState` e `ErrorState` (`components/states/` — pasta nova, separada de `components/ui/` por serem convenção de UX do produto, não primitivos genéricos): ícone (lucide, opcional) + título + descrição + ação opcional; `EmptyState` em tom de convite, `ErrorState` em tom destrutivo com botão "Tentar de novo" (`onRetry`, opcional). Fecha o roadmap de fundação da M6: tokens (M6A), marca (M6B), primitivos (M6C), contrato de estados (M6D) — todos prontos e testados, nenhum ainda aplicado a telas reais (isso é M6E). Ver ADR #69.

**Validação real (máquina do usuário, 2026-07-24)**: sem dependência nova, sem `npm install` necessário. `tsc --noEmit` limpo. `npm run lint` limpo. `next build` compilou as 36 rotas. `dashboard-jsdom`: 14/14 suítes, **49/49 testes verdes** (10 novos: Skeleton, EmptyState, ErrorState).

---

## 30.4 Milestone 6 — Bloco M6E (retrofit prioritário: conexão WhatsApp + inbox de Conversas) — ✅ concluído

**Contexto**: com a fundação da M6 completa (tokens M6A, marca M6B, primitivos M6C, contrato de estados M6D), chegou o primeiro retrofit real de telas de domínio — os dois momentos de prioridade "Máxima" de `USER_JOURNEY.md` §9 que cabem num bloco de retrofit visual: o estado vazio de conexão do WhatsApp e o inbox de conversas (o caminho crítico mobile assumir→responder fica reservado para M6G, auditoria de responsividade dedicada). Usuário aprovou três decisões antes da implementação: trocar `window.confirm()` por `Dialog` na remoção de sessão; migrar os banners inline de sucesso/erro (`ConversationActions`/`MessageComposer`) para `Toast`; adiar a prévia da última mensagem no inbox (exigiria campo novo em `ConversationSummary`, tocando `apps/api`+BFF — fora do escopo de um bloco só de UI).

**Entregue** — **Sessões**: `pages/index.tsx` (`Skeleton` no carregamento, `EmptyState` no lugar do texto solto "Nenhuma sessão ainda"), `SessionListItem`/`CreateSessionForm` sobre `Card`/`Input`/`Button`, `pages/sessions/[sessionName].tsx` (`Skeleton`/`ErrorState`/`Card`), `QRCodeCard` (passo a passo numerado ao lado do QR, `Skeleton` unificando os estados "gerando"/"carregando"), `SessionActions` (`Dialog` de confirmação no lugar de `window.confirm`). **Conversas**: `pages/conversations/index.tsx` (`Skeleton`/`EmptyState`/`Card`), `ConversationListItem` (layout de linha de inbox, destaque "aguardando atendente" via `Badge variant="warning"` em vez de classes `amber-*` soltas), `pages/conversations/[conversationId].tsx` (`Skeleton`/`ErrorState`/`Card`, retry usando o `refresh()` já exposto pelo hook), `MessageTimeline` (`Skeleton` em formato de bolhas de conversa, `ErrorState` com retry), `ConversationActions`/`MessageComposer` (`Toast` no lugar do banner inline), `LoadMoreButton` sobre `Button`. Zero mudança de contrato de API/BFF; zero mudança de comportamento funcional — só a casca visual e o canal de feedback. Ver ADR #70.

**Testes novos**: nenhum dos componentes tocados tinha teste jsdom antes deste bloco. `SessionListItem.test.tsx`, `ConversationListItem.test.tsx`, `MessageTimeline.test.tsx` (render + estados), `SessionActions.test.tsx` (primeiro teste do projeto a mockar `next/router` — abre/cancela/confirma o `Dialog` de remoção), `ConversationActions.test.tsx` e `MessageComposer.test.tsx` (primeiros a mockar `toast`, verificando `variant: 'success'`/`'destructive'`).

**Validação real (máquina do usuário, 2026-07-24)**: `tsc --noEmit` limpo. `npm run lint` limpo. `next build` compilou as 36 rotas com sucesso. `dashboard-jsdom`: **20/20 suítes, 67/67 testes verdes** (18 novos: `SessionListItem`, `ConversationListItem`, `MessageTimeline`, `SessionActions`, `ConversationActions`, `MessageComposer`) — primeira rodada já passou limpa, sem ciclo de correção. Bloco M6E fechado.

---

## 30.5 Milestone 6 — Bloco M6F (login redesenhado — reforma visual, ADR #71/#72) — ✅ implementado, validação parcial

**Contexto**: primeiro bloco da reforma visual de 100% (ADR #71). O login era um cartão único centralizado sobre fundo cinza. O fundador pediu uma experiência de SaaS de IA premium (referências: Linear, Vercel, Slack, Intercom, Notion, HubSpot), atuando eu como Product Designer/UX Lead — com liberdade para criticar as ideias dele e propor alternativas melhores.

**Entregue** (ver ADR #72 para as decisões de UX completas): tela dividida **40/60** (painel de marca menor, formulário maior); nova peça visual vetorial `components/brand/LoginChatPreview.tsx` (mockup de conversa IA/WhatsApp — decisão explícita de NÃO gerar asset raster via MCP, justificada); headline comercial ("Nenhum cliente sem resposta.") + subcopy; 3 benefícios reescritos com ícone; marca com mais presença (logo em caixa + nome + tagline); formulário em **card premium** (`shadow-lg`, `rounded-2xl`, entrada `animate-in`); campo "Identificação da empresa" → **"Empresa"** + texto auxiliar + ícone; API Key recolhida em toggle "Outras formas de acesso"; microinterações (mostrar/ocultar senha, ícones nos inputs, spinner no botão). Comportamento de auth 100% inalterado. Nenhuma dependência nova; nenhum contrato de API/BFF tocado.

**Pushback de UX registrado**: pedir um código de tenant no login não é o padrão premium (o ideal é login por e-mail com workspace resolvido no servidor, ou subdomínio estilo Slack) — não alterado agora por ser mudança de backend/auth, fica como melhoria futura.

**Testes**: `LoginForm.test.tsx` atualizado (6 casos, incluindo mostrar/ocultar senha e o novo fluxo de API Key). **Validado na máquina do usuário**: `tsc`/`lint`/`build` limpos, `dashboard-jsdom` 72/72. **Login aprovado pelo fundador.**

---

## 30.6 Milestone 6 — Bloco M6G (dashboard de WhatsApps conectados) — ✅ implementado, validação parcial

**Contexto**: segundo bloco da reforma visual (ADR #71/#73). A home era uma lista de linhas de sessão; a visão de produto pede um painel dos WhatsApps conectados com ação clara de conectar, cada número levando ao seu detalhe (e, no M6H/M6I, às suas conversas). Frontend-only.

**Entregue**: novo `WhatsAppAccountCard` (card de grid: avatar colorido por status, nome, número, `StatusBadge`, última atividade, "Gerenciar" no hover) substituindo `SessionListItem`; grid responsivo 1/2/3 colunas; ação "Conectar WhatsApp" em destaque via novo `ConnectWhatsAppDialog` (encapsula `CreateSessionForm` num `Dialog`), reutilizado no cabeçalho e no CTA do estado vazio; `CreateSessionForm` sem `Card` (vive no Dialog) com ícone/autofocus/texto auxiliar; skeleton em grid, `EmptyState` guiado. Fundo `bg-muted/30`. Nenhuma mudança de contrato de API/BFF nem de lógica. Ver ADR #73.

**Nota de ambiente**: como o sandbox não permite apagar arquivos, `SessionListItem.tsx` virou re-export depreciado de `WhatsAppAccountCard` (o usuário pode apagá-lo e renomear `tests-jsdom/components/SessionListItem.test.tsx` → `WhatsAppAccountCard.test.tsx` quando quiser).

**Testes**: teste do card (ex-`SessionListItem.test.tsx`, agora testando `WhatsAppAccountCard`: nome/telefone/link, "Número ainda não vinculado", última atividade). `tsc --noEmit` e `npm run lint` limpos no sandbox; **`dashboard-jsdom` + `next build` pendentes na máquina do usuário**.

---

## 30.7 Milestone 6 — Bloco M6H-1 (arquitetura de navegação em dois níveis — Workspace × Sessão) — ✅ implementado, validação parcial

**Contexto**: reestruturação de produto pedida pelo fundador — a navegação atual era "achatada" (Dashboard/Conversas/Analytics/Usuários/Cérebro da IA todos visíveis antes de escolher qual WhatsApp administrar). Pedido: dois níveis — Workspace (nível 1, limpo, só contas de WhatsApp) e Sessão (nível 2, com sua própria navegação, "cada WhatsApp é uma empresa independente"). Análise completa em `DECISIONS.md` ADR #74, incluindo os pontos onde discordei do pedido original (Usuários continuam por tenant, não por sessão; CRM não vira maquete sem o campo no banco) e o levantamento de fatos no schema real (Conversas já têm `sessionName` no banco; Cérebro da IA é 1:1 por tenant, precisa de migration para ficar por sessão; Analytics não tem `sessionName` direto).

**Entregue**: `SessionSidebar` (nova navegação de sessão: Conversas/Cérebro da IA/Analytics/Equipe/Configurações, link de volta ao Workspace, badge de "aguardando atendimento" via `useWaitingForHuman.countBySession`, novo e aditivo) + `SessionLayout` (sidebar+Header+conteúdo). `pages/index.tsx` perde a `Sidebar` global (Workspace agora é só a grade de contas + botão de conectar). `pages/sessions/[sessionName].tsx` migrado para dentro do `SessionLayout`, virando a tela "Configurações". `Header` perdeu o título fixo "WhatsApp Automation Dashboard" (redundante), ganhou a `FrancisWordmark` compacta. Ver ADR #74 para a lista completa de decisões e divergências do pedido original.

**Limitação documentada (não é bug)**: os itens "Cérebro da IA", "Analytics" e "Equipe" do `SessionSidebar` ainda apontam para as páginas tenant-wide de sempre — quem tiver 2+ WhatsApps vê o mesmo conteúdo nas duas sessões até M6H-3/M6H-4. "Conversas" ainda não tem rota própria por sessão (aponta implicitamente para "Configurações" via o card do Workspace) — isso é o M6H-2, que precisa de um filtro real no servidor (a paginação por cursor não permite filtrar no cliente, decisão já documentada em `useConversationsList`).

**Testes**: `SessionSidebar.test.tsx` (novo, 5 casos), `WhatsAppAccountCard.test.tsx` (+2 casos de badge). `tsc --noEmit` e `npm run lint` limpos no sandbox; **`dashboard-jsdom` + `next build` pendentes na máquina do usuário**.

---

## 30.8 Milestone 6 — Bloco M6H-1b (nesting das telas restantes + retrofit visual) — ✅ implementado, validação parcial

**Contexto**: ao testar o M6H-1, apareceram dois problemas reais: "Conversas" 404 no menu da sessão, e "Cérebro da IA"/"Analytics"/"Equipe" ainda com a `Sidebar` antiga + visual pré-Design-System. Fundador escolheu a prioridade **"layout primeiro, dados depois"** (ver ADR #75).

**Entregue**: as 5 páginas soltas (`ai-profile`, `analytics`, `users`, `conversations`, `conversations/:id`) migraram para dentro de `/sessions/:sessionName/...` (SessionLayout); rotas antigas viram redirecionamento para `/` em vez de 404. Bug corrigido no `SessionSidebar`: "Configurações" não fica mais permanentemente "ativo" em toda sub-rota. `ConversationListItem` usa `conversation.sessionName` para montar o link certo mesmo antes do filtro server-side existir. Retrofit visual mecânico (troca de classe, sem mudar lógica): `MetricCard`, `AiProfilePanel` (+ novo primitivo `Textarea`), `UserManagementPanel` (314 linhas — form de criação, tabela, ações de linha) e a página de Analytics (seções agora em `Card`) — todos sobre tokens/primitivos do Design System em vez de cores `gray-*`/`blue-*` cruas.

**Fora de escopo, por decisão explícita**: gráficos internos de Analytics (não reclamados, risco sem benefício); modo quiz do Cérebro da IA (funcionalidade nova, não layout — fica pra milestone própria).

**Testes**: `textarea.test.tsx` (novo primitivo, 3 casos). `tsc --noEmit` e `npm run lint` limpos no sandbox; **`dashboard-jsdom` + `next build` pendentes na máquina do usuário**. Gap conhecido (pré-existente): `AiProfilePanel`/`UserManagementPanel` seguem sem teste jsdom dedicado.

---

## 30.9 Milestone 6 — Bloco M6H-2 (Conversas filtradas por sessão + inbox estilo WhatsApp/Telegram) — ✅ implementado, validação parcial

**Contexto**: dois pedidos — terminar o filtro real de Conversas por sessão (prometido desde o M6H-1) e o layout lista+chat lado a lado (pedido reafirmado pelo fundador). Ver ADR #76 para o detalhe completo.

**Entregue** — **Backend**: `sessionName` opcional, aditivo, sem migration, em 5 camadas (Domain port → `PrismaConversationRepository` → `ConversationsService` → `conversationsRouter` (Zod) → BFF `pages/api/conversations/{index,stream}.ts` → `clientApi`/`useConversationsList`). **Frontend**: novo `ConversationInbox` (lista + `ConversationDetailPanel` lado a lado, inspirado em WhatsApp/Telegram); `ConversationListItem` virou linha compacta de inbox (avatar+nome+hora, estado `active`); Interações de IA viraram seção recolhida (`<details>`) dentro do painel da conversa; busca por número (filtro cliente sobre o já carregado); responsivo (lista OU chat no mobile, os dois no desktop).

**Limitação técnica documentada**: sem poder apagar arquivos, `conversations/index.tsx` e `conversations/[conversationId].tsx` continuam sendo 2 arquivos (não um catch-all único) — ambos renderizam o mesmo `ConversationInbox`; navegar entre eles remonta a lista (reconecta via SSE em ~1-2s) em vez de zero flash. Aceito, ainda uma melhoria grande sobre o 404 de antes.

**Testes**: `ConversationsService.test.ts` (+1), `PrismaConversationRepository.test.ts` (+1), `formatters.test.ts` (+3, novo `formatConversationTimestamp`), `ConversationListItem.test.tsx` (reescrito, +1 caso `active`). `tsc --noEmit` e `npm run lint` limpos no sandbox (`apps/api` e `apps/dashboard`); **suíte jest completa e `next build` pendentes na máquina do usuário** (jest não terminou no sandbox neste bloco — mesma limitação de tempo já registrada). Próximo bloco: **M6H-3** — Cérebro da IA por sessão (exige migration).

---

## 30.10 Milestone 6 — Bloco M6H-2b (auto-scroll + nome/foto de perfil do WhatsApp na inbox) — ✅ implementado, migration + validação final pendentes na máquina do usuário

**Contexto**: pedido do fundador, ainda em Conversas — indicador de novas mensagens, abrir a conversa já rolada para o fim (padrão "PgDn"), e mostrar nome/foto do contato do WhatsApp. Sequenciamento escolhido pelo fundador: username+foto primeiro, indicador de não lidas depois, M6H-3 por último. Ver ADR #77 para o detalhe completo.

**Entregue — auto-scroll (sem migration)**: `ConversationDetailPanel` rola para a última mensagem ao abrir uma conversa OU ao chegar mensagem nova, mas só quando o operador já estava perto do fim (nunca arranca de um scroll manual para cima).

**Entregue — nome de exibição (`contactName`)**: migration aditiva `20260724120000_add_conversation_contact_name` (`whatsapp_conversations.contact_name`, nullable, sem backfill). `BaileysProvider` captura `pushName` do evento `messages.upsert` (nunca lido até aqui) → flui por `WhatsAppProviderEvent`/`InboundWhatsAppMessage`/`SessionManager`/`MessageIngestionService` até `PrismaConversationRepository`, que só ATUALIZA o nome quando a mensagem trouxe um (nunca apaga por falta de nome numa mensagem seguinte). Aparece na API/BFF de graça (a entidade `Conversation` já é serializada inteira). `ConversationListItem`/`ConversationDetailPanel` mostram o nome no lugar do número quando disponível.

**Entregue — foto de perfil**: nova capacidade `WhatsAppProvider.getProfilePictureUrl(jid)` (nunca persistida — busca ao vivo no socket Baileys conectado a cada chamada), passthrough por `SessionManager`/`WhatsAppSessionService.getContactAvatarUrl` → rota `GET .../whatsapp-sessions/:sessionName/contacts/:contactJid/avatar` (sempre 200, nunca 404 por falta de foto) → BFF → `hooks/useContactAvatar` + `components/ContactAvatar.tsx` (fallback de iniciais do nome, ou 2 últimos dígitos do número). Vive inteiramente em `services/whatsapp` — nunca cruza para `services/conversations`.

**Fora de escopo deste bloco**: indicador de não lidas (círculo verde com contagem) — próximo da fila, exige sua própria migration/decisão de UX.

**Testes**: `BaileysProvider.test.ts` (+5), `PrismaConversationRepository.test.ts` (+3), `MessageIngestionService.test.ts` (+2), `WhatsAppSessionService.test.ts` (+2), `whatsAppSessionsRouter.test.ts` (+1), `formatters.test.ts` (+6), `ConversationListItem.test.tsx` (+2), `ContactAvatar.test.tsx` (novo, 4 casos). `tsc --noEmit` limpo em `apps/dashboard`; `apps/api` mostra só os 5 erros JÁ CONHECIDOS de `contactName` ausente no Prisma Client gerado (sandbox sem acesso à rede de binários do Prisma — mesma classe de erro do bloco `AiBusinessProfile`, resolve com `npx prisma migrate dev` + `npx prisma generate` na máquina do usuário). `npm run lint` limpo nos dois pacotes. **Suíte jest completa, `next build` e a migration em si pendentes na máquina do usuário.**

---

## 30.11 Incidente crítico pós-M6H-2b — foto de perfil sem timeout travava o socket Baileys (Dashboard + WhatsApp real) — ✅ corrigido e confirmado pelo usuário

**Contexto**: logo após validar o Bloco M6H-2b, o app travou por completo ao abrir qualquer conversa — Dashboard sem responder a cliques E entrega/recebimento real de WhatsApp parados. Ver ADR #78 para o diagnóstico completo.

**Causa raiz**: `BaileysProvider.getProfilePictureUrl` (introduzida no M6H-2b) consultava o socket Baileys ao vivo SEM nenhum timeout — uma IQ query presa travava a fila de IQ do socket inteiro, incluindo mensagens reais. Agravado por buscas de avatar concorrentes e duplicadas (lista + painel de detalhe) sem deduplicação.

**Corrigido**: `getProfilePictureUrl` envolvido em `Promise.race` contra um timeout de 6s (`PROFILE_PICTURE_TIMEOUT_MS`), devolvendo `undefined` se estourar (promise órfã tratada para nunca virar unhandled rejection). `hooks/useContactAvatar.ts` reescrito com deduplicação/cache em memória (`Map`s por `sessionName:contactJid`) — a mesma foto nunca é buscada duas vezes em paralelo.

**Teste novo**: `BaileysProvider.test.ts` (+1, `jest.useFakeTimers()` provando que o timeout resolve para `undefined`). **Confirmado pelo usuário na máquina real** após reiniciar o terminal da API: "Aparentemente deu certo e parou de travar."

---

## 30.12 Reforma do escalonamento — a IA nunca mais tira a si mesma do circuito ao pedir ajuda humana — ✅ implementado, migration + validação final pendentes na máquina do usuário

**Contexto**: pedido do fundador — hoje, quando a IA não sabe responder ou decide encaminhar, a conversa vira `status: 'human'` sem dono automaticamente, parando a IA de responder; se ninguém assumir, o cliente fica sem resposta nenhuma. Pedido: a IA avisa o cliente e notifica a Dashboard, mas continua respondendo enquanto ninguém assume — só um humano clicando "Assumir conversa" tira a IA do circuito. Ver ADR #79 para o desenho completo.

**Entregue**: novo campo `Conversation.escalatedAt?: Date` (migration `20260725120000_add_conversation_escalated_at`) — "a IA pediu ajuda pela última vez em X", independente de `status`. Novo método `ConversationRepository.flagNeedsHumanAttention` (sempre reescreve o timestamp, mesmo em escaladas repetidas — sustenta um novo alerta a cada pedido de ajuda). `AiReplyJobProcessor` não muda mais `status` ao escalar (nem no marcador da IA, nem em falha de geração/cota/provider) — só sinaliza `escalatedAt`; a IA continua respondendo normalmente. `ConversationsService.escalateConversation`/`resumeConversation` (as ações de "Assumir conversa"/"Devolver ao bot") passaram a ser o ÚNICO caminho que muda `status`, sempre limpando `escalatedAt` junto. Filtro novo `?needsHumanAttention=true` em `GET /conversations` (API/BFF) substitui o antigo filtro por `status: 'human'` sem dono. Frontend: `useWaitingForHuman` migrado para o novo filtro, com detecção de "nova escalada" por set-diff de `id:escalatedAt` (não mais "o total subiu" — agora detecta também uma segunda escalada na mesma conversa). `ConversationStatusBadge`/`ConversationListItem`/`ConversationDetailPanel` mostram "Aguardando atendente" baseado em `escalatedAt`, independente de `status`.

**Escopo — o que NÃO mudou**: a reativação automática após 30min de silêncio (`shouldReactivateBot`) ficou intocada como rede de segurança para linhas legadas; estruturalmente inalcançável para escaladas novas, mas não removida (sem custo de mantê-la).

**Testes**: `AiReplyJobProcessor.test.ts` (blocos de auto-escalonamento e "resultado não enviável" reescritos para `status: 'bot'` + `escalatedAt`, incluindo teste de escalada repetida), `ConversationsService.test.ts` (+2), `ConversationListItem.test.tsx` (+2), `ConversationStatusBadge.test.tsx` (novo, 3 casos). `PrismaConversationRepository`/`conversationsRouter` seguem sem teste dedicado (padrão já estabelecido no projeto).

**Validação real na máquina do usuário**: migration aplicada com sucesso; `tsc --noEmit` (`apps/api`) achou 1 erro real (`validateOrRespond<T>` não suportava schema com `.transform()` de tipo de entrada diferente do de saída — corrigido generalizando para 3 genéricos) e `npm run lint` achou 1 erro real (aspas retas em JSX em `ConversationDetailPanel.tsx` — corrigido com `&quot;`). Após as correções, `tsc --noEmit` (API + dashboard) e `npm run lint` confirmados 100% limpos pelo usuário. Ver ADR #79 (seção de correções de acompanhamento) para o detalhe.

**Ajuste adicional, mesmo dia**: usuário reportou que a ordem da lista de Conversas não refletia a atividade mais recente — corrigido trocando a ordenação de `createdAt` para `updatedAt` em `PrismaConversationRepository.findAllByTenant` (zero migration nova). Teste novo em `ConversationsService.test.ts` provando a inversão de ordem.

---

## 30.13 Status de conexão desatualizado no card do Workspace + bolinha de status (StatusDot) — ✅ implementado, validação final pendente na máquina do usuário

**Contexto**: usuário reportou, com prints, que o card "Seus WhatsApps" mostrava "Conectado" para uma sessão já desconectada, enquanto Configurações da mesma sessão mostrava o status real corretamente. Ver ADR #80 para o diagnóstico completo.

**Causa raiz**: `listSessions()` (Workspace) sempre leu o status DIRETO do banco (por desenho, para não abrir sockets à toa); só é atualizado enquanto uma instância viva da sessão existe no Registry em memória. Reinícios da API (vários nesta sessão de trabalho) deixavam o banco com o último status conhecido, potencialmente errado.

**Corrigido**: novo `WhatsAppConnectionRegistry.peek()` (leitura pura, nunca cria instância nova). `listSessions()` agora sobrepõe o status do banco com o status AO VIVO quando existe uma instância viva (mesma fonte de `getSessionStatus()`); sem instância viva, mantém o valor do banco — nenhuma sessão nova é instanciada só para listar.

**Bolinha de status**: novo componente `StatusDot` (verde/amarelo/cinza, `role="status"` + `aria-label`), aplicado no `WhatsAppAccountCard` e no cabeçalho da `SessionSidebar`, junto ao nome da sessão — mesmo indicador visual que já existia implicitamente na navegação por sessão.

**Testes**: `WhatsAppSessionService.test.ts` (+2), `WhatsAppAccountCard.test.tsx` (+2), `SessionSidebar.test.tsx` (+2). `tsc --noEmit`/`npm run lint` confirmados limpos no sandbox (API + dashboard); suíte jsdom não pôde rodar no sandbox (timeout, limitação já documentada) — **pendente na máquina do usuário**.

**Ajuste de acompanhamento, mesmo dia**: usuário testou e pediu dois ajustes — remover o texto "Conectado" do cabeçalho da sessão (deixar só a bolinha, à direita do nome) e fazer a bolinha aparecer também nas páginas que ainda não tinham (Conversas, Cérebro da IA, Analytics, Equipe). Corrigido: `SessionSidebar` passou a buscar o próprio status via `useSessionDetail` (mesmo hook SSE de Configurações), em vez de depender de um prop `status` que só uma página fornecia. `SessionLayoutProps`/`SessionSidebarProps` perderam esse prop. `tsc --noEmit`/`npm run lint` confirmados limpos novamente.

---

## 30.14 Indicador de conversas não lidas (contagem exata) — ✅ implementado, migration + validação final pendentes na máquina do usuário

**Contexto**: pendência deixada de fora do Bloco M6H-2b por decisão de sequenciamento do fundador. Pedido: círculo com número, estilo WhatsApp. Usuário escolheu explicitamente a contagem EXATA de não lidas (não a alternativa binária mais barata, que era a recomendada). Ver ADR #81.

**Implementado**: contador denormalizado `WhatsAppConversation.unreadCount` (migration `20260725150000_add_conversation_unread_count`), incrementado atomicamente a cada mensagem inbound (`MessageIngestionService`, try/catch silencioso — indicador auxiliar não derruba a ingestão), zerado por completo ao abrir a conversa (`markAsRead`, novo endpoint `POST /conversations/:id/read`, permissão `conversation:read`). Frontend: badge numérico verde em `ConversationListItem`; `ConversationDetailPanel` marca como lida ao abrir (efeito chaveado só em `conversationId`, não em todo o objeto `conversation` — evita disparo a cada tick de polling).

**Achado incidental**: `PrismaConversationRepository.test.ts` estava com 4 testes desatualizados desde a mudança de ordenação da ADR #79 (nunca fazia parte das rodadas de teste daquele bloco) — corrigido/reescrito nesta rodada como limpeza de dívida técnica.

**Testes**: `MessageIngestionService.test.ts` (+3), `ConversationsService.test.ts` (+4), `PrismaConversationRepository.test.ts` (reescrito, +4 novos), `ConversationListItem.test.tsx` (+2). `tsc --noEmit`/`npm run lint` confirmados limpos (erros de `tsc` no `apps/api` são só os esperados de Prisma Client desatualizado). Suíte `dashboard-jsdom` completa não pôde rodar no sandbox — **pendente na máquina do usuário**, junto com a migration.

---

## 30.15 Milestone 6, Bloco M6H-3 — Cérebro da IA por sessão — ✅ implementado, migration + validação final pendentes na máquina do usuário

**Contexto**: a Base de Conhecimento (Nível 1) era 1:1 por TENANT desde a M3 — não atende o caso de uma franquia/rede com um número por unidade, cada uma com contexto de negócio diferente. Ver ADR #82 para as duas decisões de produto levadas ao usuário antes de codificar (estratégia de backfill e formato da rota) e o detalhe completo da propagação em cadeia.

**Implementado**: migration `20260725160000_ai_business_profile_per_session` (coluna nova + backfill para a sessão mais antiga de cada tenant + remoção de órfãos + troca do índice único de `(tenant_id)` para `(tenant_id, session_name)`). Toda a cadeia Domain → Application → Infrastructure → Presentation → BFF → Frontend migrada de `findByTenant`/`upsert(tenantId, content)` para `findByTenantAndSession`/`upsert(tenantId, sessionName, content)`. Rota migrada de flat (`/api/tenants/:tenantId/ai-profile`) para aninhada (`/api/tenants/:tenantId/sessions/:sessionName/ai-profile`), mesmo padrão do avatar de contato. Rotas antigas (API mount e BFF `pages/api/ai-profile/index.ts`) desativadas com aviso claro (410) em vez de removidas (ambiente não permite apagar arquivos). `AiProfilePanel` agora recebe `sessionName` como prop obrigatória.

**Testes**: `AiBusinessProfileService.test.ts` (reescrito), `PrismaAiBusinessProfileRepository.test.ts` (reescrito), `aiProfileRouter.test.ts` (reescrito, mount aninhado), `ConversationAiService.test.ts` (todas as chamadas com `sessionName`), `FakeAiBusinessProfileRepository` (chave composta), novo `tests/pages/api/sessions/aiProfile.test.ts` (6 casos), `tests/pages/api/ai-profile/index.test.ts` reduzido a validar o 410. `AiReplyJobProcessor.test.ts` não precisou de mudança. `tsc --noEmit` limpo em `apps/dashboard`; `apps/api` só com os erros já esperados de Prisma Client desatualizado. `npm run lint` limpo. Suíte de testes da API relevante ao bloco e os testes BFF confirmados verdes no sandbox — **suíte `dashboard-jsdom` completa, `next build` e a migration em si pendentes na máquina do usuário**. Gap conhecido pré-existente: `AiProfilePanel` segue sem teste jsdom dedicado.

---

## 30.16 Milestone 6, Bloco M6H-4 — Analytics por sessão — ✅ implementado e validado no sandbox (sem migration pendente)

**Contexto**: pendência explícita deixada pela própria ADR #74 — Analytics (`AnalyticsRepository`/`AnalyticsService`) media dados do TENANT INTEIRO, mesmo já vivendo dentro da moldura visual "por sessão" desde o M6H-1b. Duas tabelas de origem (`ai_interactions`, `whatsapp_messages`) não têm `session_name` próprio; usuário escolheu explicitamente resolver via `INNER JOIN` contra `whatsapp_conversations` em vez de mais uma migration (ver ADR #83).

**Implementado**: os 5 métodos do `AnalyticsRepository` (port + `AnalyticsService` + `PrismaAnalyticsRepository`) ganharam `sessionName` como parâmetro. `newConversationsByPeriod`/`conversationStatusCounts`/`sessionStabilityByPeriod` filtram direto por `session_name` (coluna já indexada); `aiUsageByPeriod`/`messageFlowByPeriod` usam `INNER JOIN "whatsapp_conversations"`. Toda consulta permanece 100% parametrizada (`Prisma.sql`, sem concatenação — restrição anti-injection e D51 preservadas). Rota migrada de `/api/tenants/:tenantId/analytics` para `/api/tenants/:tenantId/sessions/:sessionName/analytics` (mesmo padrão de `aiProfileRouter`); as 4 rotas BFF flat (`pages/api/analytics/*.ts`) desativadas com `410 route_moved`; novas rotas aninhadas em `pages/api/sessions/[sessionName]/analytics/*.ts`. `apiClient.callAnalyticsApi` trocou de recurso `analytics` para `sessions`. Hooks (`useAiUsageAnalytics`/`useMessagesAnalytics`/`useConversationsAnalytics`) e `pages/sessions/[sessionName]/analytics.tsx` passam `sessionName`. **Sem nenhuma migration Prisma neste bloco** — decisão deliberada do usuário.

**Testes**: `AnalyticsService.test.ts` (reescrito, +1 caso de isolamento entre sessões), `testDoubles.ts`/`FakeAnalyticsRepository` (todo `*Calls`/assinatura com `sessionName`), `PrismaAnalyticsRepository.test.ts` (reescrito — asserts de parametrização + verificação do SQL gerado conter/não conter `JOIN`), `analyticsIntegration.test.ts` (reescrito para o mount aninhado). BFF: `tests/pages/api/analytics/{aiUsage,otherRoutes}.test.ts` reduzidos a validar o 410; novo `tests/pages/api/sessions/analytics.test.ts` (10 casos). `analyticsErrorHandler.test.ts`/`compositionRoot.test.ts` sem mudança (path-agnósticos). `tsc --noEmit` limpo em `apps/api` e `apps/dashboard` (**sem nenhum erro pendente de Prisma Client desta vez** — não há migration neste bloco). `npm run lint` limpo (via `ESLINT_USE_FLAT_CONFIG=false`, mitigação de sandbox já documentada na ADR #53). Suíte de Analytics confirmada 100% verde no sandbox: API 27/27 (`AnalyticsService` 12, `PrismaAnalyticsRepository` 7, `analyticsIntegration`+`analyticsErrorHandler` 13, `compositionRoot` 1 — conferir contagem exata no output de teste), Dashboard 13/13 (`ai-profile`/`analytics`/`otherRoutes`/`sessions/analytics`). Suíte `dashboard-jsdom` completa e `next build` pendentes na máquina do usuário (mesma limitação de tempo de sempre) — mas sem migration a rodar antes, só reiniciar os 3 terminais de dev.

---

## 30.17 Milestone 6, Blocos M6H-5/M6I — Pipeline de CRM real (schema + classificação por IA + board Kanban) — ✅ implementado, migration + validação final pendentes na máquina do usuário

**Contexto**: item de backlog desde a ADR #52, iniciado a pedido explícito do fundador. Três decisões de produto levadas ao usuário via `AskUserQuestion` em duas rodadas (ver ADR #84 para o detalhe completo): funil de 5 estágios (Novo → Contatado → Negociando → Fechado/Perdido); a IA classifica o estágio sozinha, a cada resposta (não um humano); exibição via board Kanban com arrastar-e-soltar (não um seletor simples); regra de conflito "humano corrige, IA nunca mais sobrescreve"; e entrega de tudo num bloco só (schema + IA + board), não dividido.

**Implementado — schema**: migration `20260730120000_add_conversation_stage` — enums `ConversationStage`/`ConversationStageSetBy` + colunas `stage`/`stageSetBy`/`stageUpdatedAt` em `WhatsAppConversation` (todas com default, aditivas) + índice composto `(tenant_id, session_name, stage)`.

**Implementado — Domain/Application**: policy pura `shouldAiUpdateStage` (verdadeiro só quando `stageSetBy === 'ai'`). `ConversationRepository.updateStage(tenantId, conversationId, stage, setBy)` no port + `PrismaConversationRepository`. `ConversationsService.updateStage` (chamado pelo endpoint humano) sempre grava `stageSetBy: 'human'`, travando a IA para aquela conversa.

**Implementado — IA**: `stageSignal.ts` (Domain puro, mesmo padrão de `escalationSignal.ts`) extrai o marcador de texto `[[ESTAGIO:...]]` da resposta da IA e o remove antes de o cliente ver a mensagem — escolha deliberada de manter o padrão de marcador em texto já estabelecido no projeto, em vez de pedir saída estruturada aos providers (nenhum dos dois pede JSON hoje). `PromptVersion` v1 ganhou instrução de classificação a cada resposta. `ConversationAiService.generateReply` encadeia `extractEscalation` → `extractStage` e devolve `suggestedStage`. `AiReplyJobProcessor.process()` aplica o estágio sugerido (só se `shouldAiUpdateStage` permitir) DEPOIS de confirmar o despacho da resposta — mesma ordem de segurança já usada para `escalate`.

**Implementado — Presentation/BFF**: `POST /api/tenants/:tenantId/conversations/:conversationId/stage`, RBAC via `message:send` (sem checagem de ownership — mover um card é ação operacional, não de posse, diferente de `escalate`/`resume`). Rota mantida FLAT (não aninhada por sessão, diferente de `ai-profile`/`analytics` — `conversationId` já é único no tenant). Nova rota BFF `pages/api/conversations/[conversationId]/stage.ts` (proxy fino) + `clientApi.updateConversationStage`.

**Implementado — Frontend (board Kanban)**: nova tela `/sessions/:sessionName/pipeline`, novo item "Pipeline" na `SessionSidebar` (visível a qualquer papel). `PipelineBoard`/`PipelineColumn`/`PipelineCard` novos, com drag-and-drop via **HTML5 Drag and Drop API nativa** (sem biblioteca nova — sandbox não roda `npm install`, e o projeto já tem precedente de preferir API nativa a dependência nova). Novo hook `usePipelineConversations` (busca TODAS as conversas da sessão via `fetchConversations` em loop de páginas — deliberadamente distinto de `useConversationsList`, que é SSE/cursor-paginado e não serve para um board que precisa do conjunto completo agrupado por estágio). Atualização otimista no drop; falha dispara toast destrutivo + recarga completa. Nova função pura `groupConversationsByStage` (`conversationsView.ts`) + `formatConversationStageLabel`/`CONVERSATION_STAGE_ORDER` (`formatters.ts`).

**Testes**: Domain/Application (`shouldAiUpdateStage.test.ts` novo — 3 casos, `ConversationsService.test.ts` +6, `PrismaConversationRepository.test.ts` reescrito +3), IA (`stageSignal.test.ts` novo — 5 casos, `AiReplyJobProcessor.test.ts` +4, `ConversationAiService.test.ts` +3), Presentation/BFF (`conversationsIntegration.test.ts` +6, `tests/pages/api/conversations/stage.test.ts` novo — 4 casos), Frontend (`formatters.test.ts` +2, `conversationsView.test.ts` +3, `PipelineCard.test.tsx`/`PipelineColumn.test.tsx`/`PipelineBoard.test.tsx` novos — 13 casos no total). Correção de dívida: `ConversationListItem.test.tsx`/`ConversationActions.test.tsx` (jsdom) tiveram os helpers `buildConversation` atualizados com os 3 campos novos. `tsc --noEmit` limpo em `apps/dashboard`; `apps/api` só com os erros já esperados de Prisma Client desatualizado. `npm run lint` limpo em todos os arquivos tocados/novos (via `ESLINT_USE_FLAT_CONFIG=false`). **Suíte `dashboard-jsdom` completa e `next build` NÃO puderam ser executadas neste sandbox** — processos em background não sobrevivem entre chamadas de shell neste ambiente (limitação distinta da de tempo, documentada pela primeira vez nesta rodada) e a execução em foreground não completa dentro do teto de 45s mesmo isolando um único arquivo; os 3 arquivos de teste novos foram revisados manualmente linha a linha contra a implementação real em substituição.

**Confirmado pelo usuário (2026-07-30)**: migration + `prisma generate` aplicados com sucesso (banco subido via `docker-compose.yml` da raiz). `dashboard-jsdom` completa, `next build` e validação visual/funcional do drag-and-drop seguem como próximo passo do usuário, sem bloqueio técnico conhecido.

---

## 30.18 Cérebro da IA v2 — modo "Assistente Guiado" (quiz) — ✅ implementado, validação final pendente na máquina do usuário

**Contexto**: item aprovado em alto nível pela ADR #71 (M6, redefinição estratégica) mas sem nenhum detalhe de escopo registrado. Iniciado a pedido do fundador; decisões de produto levadas via `AskUserQuestion`: as 8 perguntas essenciais recomendadas (nome, o que vende, preços, horário, endereço, pagamento, diferencial, tom de voz); layout em abas na mesma tela (`/ai-profile`) em vez de wizard isolado ou formulário de tela única; e a regra de que editar manualmente o texto desconecta do quiz (reabrir depois começa do zero). Ver ADR #85 para o detalhe completo.

**Implementado**: ZERO mudança de schema/backend — o quiz só gera uma string enviada pelo mesmo `PUT .../ai-profile` de sempre. Novo módulo puro `lib/aiProfileQuiz.ts` (8 perguntas essenciais + 1 avançada, função `generateProfileTextFromQuiz`). Novo componente `AiProfileQuizWizard.tsx` — wizard passo a passo com barra de progresso. `AiProfilePanel.tsx` ganhou abas "Assistente Guiado"/"Texto livre" (sem dependência nova, `role="tablist"`/`role="tab"` nativos) — o texto gerado pelo quiz preenche o modo texto livre automaticamente (usuário revisa e salva pelo caminho único de sempre); editar manualmente remove o vínculo com o quiz (`quizGeneratedContent` comparado por igualdade simples de string).

**Testes**: `aiProfileQuiz.test.ts` (11 casos, lógica pura), `AiProfileQuizWizard.test.tsx` (jsdom, 7 casos), `AiProfilePanel.test.tsx` (jsdom, novo — fecha gap pré-existente de painel sem teste dedicado, 6 casos). `tsc --noEmit`/`npm run lint` limpos em `apps/dashboard`. Suíte `dashboard-jsdom` completa e `next build` pendentes na máquina do usuário (mesma limitação de sandbox de sempre) — sem nenhuma migration a rodar antes (feature 100% client-side).

---

## 30.19 Cérebro da IA — botão "Cadastrar pergunta não respondida" (FAQ manual) — ✅ implementado, validação final pendente na máquina do usuário

**Contexto**: pedido explícito do fundador — botão no modo "Texto livre" para cadastrar uma pergunta que um cliente fez e a IA não soube responder. É o item (a) da iniciativa "aprendizado contínuo sem RAG" da ADR #71. Levantamento prévio confirmou que o backend hoje NÃO guarda a pergunta do cliente vinculada a um escalonamento, nem distingue "IA não sabe" de "cliente pediu humano" — por isso esta é a versão MANUAL (o dono digita pergunta+resposta), não uma captura automática a partir de uma conversa real. Ver ADR #86.

**Implementado**: ZERO mudança de backend. Novo módulo puro `lib/aiProfileFaq.ts` (`appendFaqEntry`) gera um bloco `**P:** .../**R:** ...` e anexa ao final do texto existente. Novo `components/AiProfileFaqDialog.tsx` — botão + `Dialog` (primitivo já existente) com campos Pergunta/Resposta, validação simples, fecha e limpa ao confirmar/cancelar. `AiProfilePanel.tsx` (aba Texto livre) integra o botão; ao confirmar, anexa ao conteúdo atual e marca o formulário como "dirty" — usuário revisa e salva pelo caminho único de sempre.

**Testes**: `aiProfileFaq.test.ts` (5 casos, lógica pura), `AiProfileFaqDialog.test.tsx` (jsdom, 6 casos), `AiProfilePanel.test.tsx` (+4 casos de integração). `tsc --noEmit`/`npm run lint` limpos em `apps/dashboard`. Suíte `dashboard-jsdom` completa e `next build` pendentes na máquina do usuário — sem migration a rodar (feature 100% client-side). Fora de escopo, registrado para o futuro: captura automática a partir de conversas reais (itens (b)/(c) da ADR #71) exige trabalho de backend ainda não iniciado.

---

## 30.20 Três correções pós-validação real — ✅ código completo, validação mista pendente

**Contexto**: ao validar as ADRs #84/#85/#86 na máquina real, o fundador reportou três problemas na mesma conversa: foto de perfil nunca aparece (mesmo com foto pública confirmada, F5 não ajuda); board Kanban do Pipeline não avança os cards (todos presos em "Novo"); e o quiz do Cérebro da IA apagava o conteúdo já escrito manualmente/via FAQ ao gerar um novo texto. Ver DECISIONS.md ADR #87 para o detalhe completo.

**Implementado — Cérebro da IA sempre soma (CODE-COMPLETE, testado no sandbox)**: nova função `appendToProfileContent` (`lib/aiProfileFaq.ts`), compartilhada pelo quiz e pela FAQ manual. `AiProfilePanel.tsx` corrigido: o quiz agora faz `setContent((current) => appendToProfileContent(current, text))` em vez de sobrescrever. Rastreamento do aviso "texto do Assistente Guiado" trocado de comparação de string inteira para um booleano simples (`justAddedFromQuiz`), robusto a texto pré-existente. Testes: `aiProfileFaq.test.ts` (+6 casos), `AiProfilePanel.test.tsx` (reescrito, prova explicitamente que gerar pelo quiz sobre texto existente ANEXA e que reabrir duas vezes ACUMULA).

**Implementado — prompt de estágio reforçado (CODE-COMPLETE, NÃO VALIDADO)**: nenhuma mudança de lógica em `stageSignal.ts`/`AiReplyJobProcessor.ts` (já corretos). `PromptVersion.ts` (v1) reescrito: instrução de classificação de estágio virou um bloco imperativo separado ("INSTRUÇÃO OBRIGATÓRIA") com dois exemplos completos de formato de resposta — hipótese é que o `gemini-3.5-flash` não seguia a instrução original (prosa corrida, sem exemplo). Pendente: usuário testar uma conversa nova e confirmar que os cards passam a se mover no board.

**Implementado — logs de diagnóstico da foto de perfil (PARCIAL, causa raiz de fundo ainda não identificada)**: `useContactAvatar.ts` ganhou TTL de 60s no cache de "sem foto" (antes cacheava para sempre, mesmo após um timeout transitório). `BaileysProvider.getProfilePictureUrl` ganhou log `warn` no caminho antes 100% silencioso (socket desconectado) e log `warn` diferenciando timeout de outros erros no `catch` (antes tudo em `debug` indistinguível). `ConsoleLogger` não filtra por nível — os logs novos já aparecem no terminal ao reiniciar a API. Pendente: usuário reiniciar a API, testar de novo, e reportar o conteúdo exato do log novo para decidir o próximo passo (aumentar timeout, tratar `@lid`, ou outra causa).

**Validação**: `tsc --noEmit` e `npm run lint` confirmados limpos, arquivo por arquivo, em `apps/api` e `apps/dashboard` (`BaileysProvider.ts`, `PromptVersion.ts`, `useContactAvatar.ts`, `AiProfilePanel.tsx`, `aiProfileFaq.ts`, e os dois arquivos de teste). Suíte `dashboard-jsdom` completa e `next build` pendentes na máquina do usuário — sem nenhuma migration nova a rodar neste bloco.

**Atualização (mesmo dia) — bug 2 (Pipeline) precisou de uma 3ª rodada**: usuário confirmou bug 3 (Cérebro da IA) resolvido; bug 1 (foto) adiado a pedido do usuário (não bloqueante); bug 2 (Pipeline) continuava sem funcionar mesmo após o prompt reforçado — teste real mostrou conversa clara de intenção de compra sem nenhum card avançar de "Novo". Investigação mais profunda (via agente de exploração) achou a causa raiz real: `gemini-3.5-flash` tem "thinking" ligado por padrão, consumindo o mesmo orçamento de tokens de saída que o texto visível — o marcador de estágio, sempre no final da resposta, era cortado silenciosamente quando esse orçamento estourava. Corrigido em `GeminiAiProvider.ts` com `thinkingConfig: { thinkingBudget: 0 }` (desliga o consumo invisível) e um `Logger` opcional que agora avisa (`warn`) sempre que a resposta é cortada por `MAX_TOKENS`. `tsc`/lint limpos; testes ajustados/novos revisados manualmente (jest não rodou neste sandbox por um erro de parsing do ambiente, não do código). Ainda pendente de validação real do usuário. Ver DECISIONS.md ADR #87 (3ª rodada) para o detalhe completo. **HIPÓTESE REFUTADA na rodada seguinte** — ver §30.20b: a causa real era outra, e o `thinkingBudget: 0` foi revertido.

---

## 30.20b Causa raiz real do Pipeline: conversas travadas em `stageSetBy: 'human'` — ✅ diagnosticado e resolvido

**O que era**: consulta direta ao banco (em vez de mais uma hipótese) mostrou que as duas conversas usadas nos testes estavam com `stage_set_by = HUMAN`. A policy `shouldAiUpdateStage` bloqueava a gravação exatamente como projetado — **não havia bug de código em nenhum ponto da cadeia**. O próprio teste de arrastar-e-soltar, validado numa rodada anterior, havia travado aquelas conversas de forma permanente e silenciosa.

**Lição de processo registrada**: três correções especulativas entraram no código antes de qualquer medição. Regra adotada: qualquer bug que sobreviva à primeira tentativa de correção exige instrumentar e medir antes da segunda.

**Resolvido**: `thinkingBudget: 0` revertido (hipótese refutada; log de `MAX_TOKENS` mantido por ser melhoria independente). A trava em si foi eliminada na rodada seguinte — ver §30.21. Ver DECISIONS.md ADRs #88 e #89.

---

## 30.21 Pipeline: regra de classificação revista — a IA sempre reclassifica, mas nunca regride — ✅ implementado, validação pendente

**Contexto**: a regra original (ADR #84) travava a IA permanentemente em qualquer conversa corrigida à mão. Ao entender a regra, o fundador pediu para mudá-la: o Pipeline precisa acompanhar a conversa mesmo depois de uma correção manual, senão o board envelhece e mente.

**Decisão de produto (fundador, entre 3 opções)**: a IA reclassifica sempre, **mas só para frente** — nunca move um card para trás no funil. Protege a correção humana sobre progresso (ex.: negócio fechado por telefone não volta para "Negociando") sem congelar o card.

**Implementado**: `shouldAiUpdateStage` reescrita — decide por DIREÇÃO (`STAGE_ORDER[sugerido] >= STAGE_ORDER[atual]`), não mais por `stageSetBy`. `closed_won`/`closed_lost` compartilham o índice final (corrigir um desfecho para o outro é permitido). `stageSetBy` vira informação pura, exibida no card. Toda a ação de destravar criada na ADR #88 foi removida (serviço, rota REST, clientApi, aviso e botão do card); a rota BFF virou `410` por não poder ser apagada neste ambiente. `PromptVersion` v1 ganhou instrução de classificar pelo estado atual da conversa inteira, não pela última mensagem.

**Testes**: `shouldAiUpdateStage.test.ts` reescrito (11 casos: avanço, regressão, empate entre desfechos, e prova de que `stageSetBy` não influencia mais), `AiReplyJobProcessor.test.ts` (caso de trava invertido + caso novo de regressão bloqueada), `ConversationsService.test.ts` (6 casos removidos junto com o método), `PipelineCard.test.tsx`/`PipelineColumn.test.tsx` atualizados.

**NOTA DE VERIFICAÇÃO**: a VM do sandbox caiu no meio desta rodada e não voltou — `tsc --noEmit`/`npm run lint` NÃO foram executados após as edições finais. Revisão manual completa + `grep` global confirmando zero referência órfã em código (só menções em documentação). **Pendente na máquina do fundador**: `tsc`, `lint`, suíte jest, `next build`, e o teste funcional — arrastar um card e confirmar que a IA volta a avançá-lo (sem regredi-lo) nas respostas seguintes. Sem migration a rodar.

---

## 31. Fase 1 — nova estratégia em 5 fases + Bloco F1.1 completo: suporte a mensagens de mídia — ✅ implementado e validado na máquina do fundador

**Contexto**: o fundador redefiniu a estratégia do Francis em 5 fases sequenciais (Finalizar o produto → Beta Fechado → Product Design → Infraestrutura Comercial → Escala) e pediu uma análise estratégica completa (PM+CTO+UX+Arquiteto) antes de qualquer código, entregue como `FASE_1_ANALISE_ESTRATEGICA.md` — documento agora oficial do projeto. O achado de maior severidade: o projeto nunca suportou mensagens de mídia (`BaileysProvider` descartava silenciosamente imagem/áudio/vídeo/documento/figurinha desde a Milestone 3), eleito prioridade máxima da Fase 1 por ser um gap estrutural que qualquer cliente real encontra na primeira semana de uso. Em seguida, o fundador concedeu autonomia total de execução sobre toda a Fase 1 — sem precisar pedir permissão entre milestones, exceto para decisões de produto ambíguas, decisões arquiteturais praticamente irreversíveis, bloqueios técnicos reais, risco de regressão, ou necessidade real de reordenar o roadmap.

**Implementado (Bloco F1.1, sub-blocos F1.1-2 a F1.1-6 — ver DECISIONS.md ADR #90 para o detalhe técnico completo)**:

- Schema aditivo: enum `whatsapp_message_content_type` + 5 colunas em `whatsapp_messages`, sem tabela `Attachment` separada (WhatsApp nunca tem mais de 1 anexo por mensagem).
- `BaileysProvider` reconhece os 5 tipos de mídia reais do Baileys (achado: `mediaKey` chega como `Uint8Array`, não `string` — corrigido com conversão para base64 antes de cifrar via `Cipher`, reaproveitando a mesma instância já usada para `TenantCredential`).
- Nova porta `MediaDownloader` (mesmo papel de `OutboundMessageDispatcher`) permite a `services/conversations` alcançar um `WhatsAppProvider` sem cruzar bounded contexts — injetada em `ConversationsService` via um setter (`setMediaDownloader`), único caso desta classe, por causa da ordem de composição já documentada (`conversations` é montado antes de `registry` existir).
- Primeiro endpoint do projeto (API e BFF) a servir binário puro via streaming (`res.send(Buffer)`), nunca base64/JSON — `GET .../conversations/:conversationId/messages/:messageId/media`.
- `MessageBubble` no Dashboard exibe imagem/áudio/vídeo/documento/figurinha via o proxy, nunca a URL `.enc` crua do WhatsApp.
- `PromptBuilder` descreve mídia ao histórico da IA com um aviso factual entre colchetes (nenhum provider deste projeto é multimodal) — a IA nunca inventa o que a mídia mostra, só reconhece que ela existe.

**Testes novos desta rodada**: `BaileysProvider.test.ts` (+8), `PrismaMessageRepository.test.ts` (+3), `ConversationsService.test.ts` (+7), `WhatsAppMediaDownloader.test.ts` (novo, 2), `MessageBubble.test.tsx` (novo — gap pré-existente fechado, 10 casos), `PromptBuilder.test.ts` (+7).

**Protocolo de validação renegociado nesta rodada**: dado que o sandbox não roda `npm test`/`next build`/migrations reais de forma confiável, ficou combinado que o sandbox valida `tsc`/`eslint` a cada passo (100% limpo nesta rodada, fora os erros já esperados de Prisma Client desatualizado) e o fundador roda a validação real completa (migration + suíte jest + `next build` + teste funcional de enviar mídia de verdade pelo WhatsApp) antes do próximo bloco (F1.2) prosseguir.

**NOTA DE VERIFICAÇÃO**: `tsc --noEmit`/`eslint` confirmados limpos em TODOS os arquivos tocados/criados desta rodada (API e Dashboard), verificados incrementalmente a cada sub-bloco.

**Validação real (máquina do fundador)**: migration aplicada com sucesso; `npx prisma generate` falhou com `EPERM` (arquivo bloqueado no Windows — não é bug de código, fundador decidiu seguir em frente); `npm test` 1155/1157 (2 falhas em `BaileysProviderFactory.test.ts`, corrigidas — faltava o novo 6º argumento opcional `cipher` nas asserções); `npm run build` 100% verde, incluindo a rota nova de mídia. Bloco fechado.

---

## 32. Fase 1, Bloco F1.2 — Interpretação de mídia pela IA (visão/áudio via Gemini multimodal) — ✅ implementado, validação real pendente

**Contexto**: com F1.1 fechado, próximo item da `FASE_1_ANALISE_ESTRATEGICA.md`: a IA responder com base no conteúdo real de um áudio/imagem recebido, não só reconhecer que "algo foi enviado" (F1.1-6). Duas decisões com alternativas genuinamente equivalentes foram levadas ao fundador via `AskUserQuestion`, seguindo a própria regra da autonomia concedida — ver DECISIONS.md ADR #91 para o detalhe completo.

**Decisões do fundador**: (1) Gemini como único provider multimodal desta rodada (aceita `inline_data` nativamente, sem infraestrutura nova tipo Whisper) — Claude ignora `media` de propósito, degrada graciosamente via a descrição factual já existente do F1.1-6. (2) Conflito arquitetural descoberto em implementação — o worker de IA nunca pode tocar Baileys (ADR #54), mas precisa baixar mídia para a chamada multimodal — resolvido com uma rota HTTP interna nova entre os processos, protegida por segredo compartilhado, em vez de quebrar a fronteira da ADR #54 ou inflar a fila BullMQ com binários.

**Implementado**:

- `AiGenerationRequest.messages[].media?: { mimeType, data }` — extensão 100% aditiva/opcional do contrato de IA.
- `GeminiAiProvider` monta `inline_data` como parte adicional do turno; `ClaudeAiProvider` ignora `media` por completo (comentário explicativo, zero mudança de lógica).
- `PromptBuilder.build()` ganhou 4º parâmetro opcional `mediaByMessageId` — decide, mensagem a mensagem, se anexa o binário já baixado.
- `ConversationAiService` baixa via `MediaDownloader` (7º parâmetro opcional do construtor) só a mídia mais RECENTE do histórico, restrito a `image`/`audio` (não `video`/`document`/`sticker` nesta rodada), com teto de 10MB — controle deliberado de custo/latência.
- Novo padrão: rota interna processo-a-processo `POST /internal/media/download` (montada só quando `INTERNAL_API_SECRET` está configurado), protegida por `requireInternalSecret` (comparação em tempo constante, mesmo padrão de `HmacSha256ApiKeyHasher`). `HttpMediaDownloader` (nova implementação de `MediaDownloader`, usada só pelo worker) chama essa rota via `fetch` — nunca lança, degrada graciosamente.

**Testes novos**: `GeminiAiProvider.test.ts` (+1), `PromptBuilder.test.ts` (+4), `ConversationAiService.test.ts` (+7), `HttpMediaDownloader.test.ts` (novo, 4), `requireInternalSecret.test.ts` (novo, 4), `internalMediaRouter.test.ts` (novo, 5, via supertest).

**NOTA DE VERIFICAÇÃO**: `tsc --noEmit`/`eslint` confirmados limpos em todos os arquivos tocados/criados desta rodada. Sem migration (feature 100% em memória). Pendente: validação real na máquina do fundador (`npm test`, `next build`, configurar `INTERNAL_API_SECRET`/`INTERNAL_API_BASE_URL` no `.env` dos dois processos, teste funcional de enviar uma foto/áudio real pelo WhatsApp e confirmar que a resposta da IA reflete o conteúdo).

**Validação real (máquina do fundador)**: `npm test` 1182/1182 (1 falha de mock corrigida em `HttpMediaDownloader.test.ts`), `npm run build` verde. Teste funcional de visão/áudio bloqueado por cota do Gemini free tier (429 RESOURCE_EXHAUSTED, esgotada pelos próprios testes em sequência anteriores — não é bug de código); retry do `GeminiAiProvider` aumentado para 3 tentativas com backoff exponencial (2s/4s/8s) como melhoria colateral desta investigação. Bloco fechado do ponto de vista de código/testes automatizados; teste funcional de verdade (foto/áudio real) fica pendente para quando a cota resetar.

---

## 33. Fase 1, Bloco F1.3 — Envio de mídia pelo operador (paridade com WhatsApp Web) — ✅ implementado, validação real pendente

**Contexto**: com F1.1 (mídia recebida) e F1.2 (IA interpreta mídia) fechados, faltava o outro sentido: um atendente humano que assume uma conversa pela Dashboard só conseguia responder em texto — menos capacidade do que teria simplesmente usando o WhatsApp Web. Item aprovado da `FASE_1_ANALISE_ESTRATEGICA.md`. Mapeamento da cadeia completa de envio de texto confirmou que nenhuma camada (do `OutboundMessageCommand` até `sock.sendMessage`) suportava mídia.

**Decisões do fundador (via `AskUserQuestion`, seguindo a regra da autonomia concedida de interromper só para decisões arquiteturais com alternativas equivalentes)**: (1) envio de mídia é SÍNCRONO, fora da fila BullMQ — Redis não é feito para binários grandes, e o operador está esperando a resposta na tela; (2) upload sem multipart/`multer` (dependência nova não instala neste sandbox) — corpo bruto do arquivo + headers `x-media-*` para categoria/legenda/nome, mesma paridade funcional sem a dependência.

**Implementado**:

- Novo port `MediaSender` (`services/whatsapp/domain`) — simétrico a `MediaDownloader` mas deliberadamente separado (contratos de erro diferentes: leitura nunca lança, escrita precisa propagar falha). Implementado por `WhatsAppMediaSender`.
- `WhatsAppProvider.sendMediaMessage` + `BaileysProvider.sendMediaMessage`, sobre uma função pura `buildBaileysMediaContent()` que monta o payload certo por tipo (imagem/áudio/vídeo/documento) — testável isoladamente sem socket Baileys fake.
- `ConversationsService.sendAgentMediaMessage()` — mesmas pré-condições de `sendAgentMessage` (conversa em `human`, ownership), mas síncrono: confirma o envio antes de persistir a `Message`, devolve 200 com a mensagem criada (não 202 "enfileirado"). Teto de 16MB (`AgentMediaTooLargeError`, 413).
- Problema descoberto em implementação: mídia enviada pelo operador não tem referência real ao CDN do WhatsApp (só mídia recebida tem). Resolvido com `AgentMediaCache` — cache em memória, TTL de 1h, nunca persistido em disco (mesma filosofia do ADR #90) — só para a timeline reexibir o que o operador acabou de enviar.
- Rota `POST /:conversationId/media` (`express.raw()` só nessa rota, RBAC `message:send`). BFF replica o padrão de streaming binário já usado na leitura (F1.1). `MessageComposer` ganhou botão de anexo, preview do arquivo selecionado, remoção, e teto de tamanho do lado do cliente.

**Testes novos**: `BaileysProvider.test.ts` (+7), `SessionManager.test.ts` (+3), `WhatsAppMediaSender.test.ts` (novo, 2), `ConversationsService.test.ts` (+10), `AgentMediaCache.test.ts` (novo, 6), `conversationsIntegration.test.ts` (+8, via supertest), `MessageComposer.test.tsx` (+5, jsdom), `compositionRoot.test.ts` (+1).

**NOTA DE VERIFICAÇÃO**: `tsc --noEmit`/`eslint` confirmados limpos em todos os arquivos tocados/criados desta rodada (API e Dashboard), verificados incrementalmente a cada sub-bloco. Sem migration. Pendente: validação real na máquina do fundador (`npm test`, `next build`, teste funcional de verdade — anexar e enviar uma foto/áudio/documento reais pela Dashboard e confirmar a entrega no WhatsApp do contato).

---

## 34. Fase 1, Bloco F1.4 — Bug pós-F1.3 + remoção de instrumentação + painel de auditoria (F1.5) + analytics de negócio (F1.6) — ✅ implementado e validado

**Contexto**: sequência de entregas contínuas após F1.3 validado: (a) bug de bolhas de mídia enviada pelo operador aparecendo vazias — `PrismaMessageRepository.toDomain()` checava `mediaUrl && mediaKeyEncrypted` com truthy; `''` é falsy em JS; corrigido para `!= null`; (b) remoção de instrumentação temporária (`[OUTBOUND-DEBUG]` em `BaileysProvider`, `[STAGE-DEBUG]` em `AiReplyJobProcessor`/`GeminiAiProvider`); (c) F1.5 painel de auditoria na Dashboard — fiação de leitura para a trilha `AuditLog` que existia desde a M5 mas não tinha consumidor (novo `AuditLogService`, rota `GET .../audit-logs`, BFF, `AuditLogPanel.tsx`, item "Auditoria" na Sidebar com gate `manager+`); (d) F1.6 analytics de negócio — `pipelineFunnelCounts` (retrato por estágio, reaproveita índice Kanban), `escalationRateByPeriod` (série diária — % de conversas que escalaram), e `session-stability` (já implementada desde M4D, nunca renderizada, agora exibida em `SessionStabilityChart`).

**Validação real (máquina do fundador)**: `npm test` 1253/1253 verdes (163 suítes), `npm run build` verde após 1 correção de import não usado (`Input` em `AiProfilePanel.tsx`). F1.5 aprovado funcionalmente na Dashboard. Blocos F1.4-limpeza/F1.5/F1.6 fechados.

---

## 35. Fase 1, Bloco F1.4 (real) — Vínculo `AiInteraction` ↔ mensagem inbound + distinção "não sei" vs. "pediu humano" — ✅ implementado

**Contexto**: item oficial F1.4 da `FASE_1_ANALISE_ESTRATEGICA.md` — o campo `AiInteraction.messageId` existia na fila BullMQ mas nunca chegava ao repositório; e o marcador `[[ESCALAR_HUMANO]]` era único, sem distinguir "IA não sabe" de "cliente pediu atendente". Sem essa distinção, listar "perguntas não respondidas" seria impossível — pré-requisito da captura automática de lacunas (ADR #71).

**Implementado**: `escalationSignal.ts` ganhou dois marcadores (`[[ESCALAR_HUMANO:NAO_SEI]]`/`[[ESCALAR_HUMANO:PEDIU_ATENDENTE]]`); `AiInteractionRepository.record()` grava `messageId` em toda tentativa (não só no caminho feliz); novo campo `AiInteraction.escalationReason` (`ai_interactions.escalation_reason`, migration `20260801130000_add_ai_interaction_escalation_reason`); novo método `listUnansweredQuestions(tenantId, limit)` exposto via `GET .../ai-interactions/unanswered?limit=`. Ver DECISIONS.md ADR #95.

**Validação**: `npx jest` para os 4 arquivos de teste afetados — todos verdes no sandbox. `tsc --noEmit`/`eslint` limpos. Suíte completa e `next build` pendentes na máquina do fundador, junto da migration.

---

## 36. Fase 1, Bloco F1.7 — Vitórias rápidas de UI funcional (prévia de mensagem, "há N dias", toast de envio) — ✅ implementado

**Contexto**: três melhorias de baixo custo/alto impacto percebido: (1) prévia da última mensagem na lista de Conversas; (2) "há N dias" no card do Pipeline; (3) feedback inequívoco de envio no `MessageComposer`.

**Implementado**: campo denormalizado `WhatsAppConversation.lastMessagePreview`/`lastMessageAt` (migration `20260801140000_add_conversation_last_message_preview`), escrito em `PrismaMessageRepository.create()` via `$transaction` — todas as mensagens de qualquer direção/origem passam por esse ponto único. Nova função pura `buildMessagePreview()` (texto puro recortado; para mídia usa rótulo com emoji). `ConversationListItem.tsx` exibe a prévia. `PipelineCard.tsx` exibe `formatElapsedDays(stageUpdatedAt)`. `MessageComposer` ganhou toast de sucesso para texto ("Mensagem enviada") e mídia ("Arquivo enviado").

**Validação**: suíte de backend afetada e `formatters.test.ts` (23/23) verdes no sandbox. Testes jsdom novos validados por `tsc`/`eslint` + revisão manual. Suíte `dashboard-jsdom` completa e `next build` pendentes na máquina do fundador, junto da migration.

---

## 37. Revisão de UX do Pipeline — coluna "Não cliente" no Kanban + mensagens de outro dispositivo (fromMe) — ✅ implementado

**Contexto**: duas entregas no mesmo dia: (1) o fundador recusou o botão "Não é cliente" dentro da conversa (não escala operacionalmente) e pediu uma coluna "Não cliente" visível no Kanban; (2) mensagens enviadas pelo operador de outro dispositivo (WhatsApp mobile/web) nunca apareciam na Dashboard — `BaileysProvider` descartava todo `fromMe: true`.

**Implementado**: (1) `PIPELINE_COLUMN_ORDER` = 5 estágios do funil + `not_client` no fim; `groupConversationsByPipelineColumn` deriva a coluna do booleano `excludedFromPipeline`; drag-and-drop para `not_client` liga o flag, sair desliga. Zero mudança em `apps/api`. (2) Cache de IDs enviados (`sentMessageIds: Map<string, Timeout>`, TTL 60s) — ID no cache = eco do bot → descartar; ID fora do cache = mensagem de outro dispositivo → emitir evento com `direction: 'outbound'`. `MessageIngestionService` pula `incrementUnreadCount`/`maybeReactivateBot`/agenda de IA para mensagens outbound. Ver DECISIONS.md ADRs #96 e #97.

**Validação**: `tsc --noEmit`/`eslint` limpos (API e Dashboard). `MessageIngestionService.test.ts` 23/23 verde no sandbox. Suíte `dashboard-jsdom` e `next build` pendentes na máquina do fundador.

---

## 38. Fase 1, Bloco F1.8 — Horário de atendimento configurável no Cérebro da IA — ✅ implementado

**Contexto**: item oficial F1.8 da `FASE_1_ANALISE_ESTRATEGICA.md`. O "Cérebro da IA" não tinha conceito de disponibilidade temporal — mensagens recebidas às 23h num domingo eram tratadas igual a mensagens de segunda de manhã. PMEs com horários definidos precisam que a IA avise o cliente fora do expediente.

**Implementado**: 6 campos aditivos em `AiBusinessProfile` (migration `20260801150000_add_off_hours_to_ai_business_profile`): `offHoursEnabled` (default false), `offHoursMessage` (nullable), `workingHoursStart`/`workingHoursEnd` (HH:MM), `workingDays` (bitmask Int, default 62 = Seg–Sex), `timezone` (IANA, default "America/Sao_Paulo"). Domain: `workingHours.ts` — funções puras `isWithinWorkingHours`/`getOffHoursContext` sem dependência externa (só `Intl.DateTimeFormat`); timezone inválido retorna `true` (degradação graciosa). `PromptBuilder.build()` ganhou 5º parâmetro opcional `offHoursContext?`. UI: seção "Horário de atendimento" em `AiProfilePanel` (toggle, dias, horários, fuso, mensagem customizada). Port `AiBusinessProfileRepository.upsert` mudou de `content: string` para `AiProfileSaveData`. Ver DECISIONS.md ADR #98.

**Testes novos**: `workingHours.test.ts` (16 casos), `PromptBuilder.test.ts` (+3), `AiBusinessProfileService.test.ts` (+1), `PrismaAiBusinessProfileRepository.test.ts` (+3), `aiProfileRouter.test.ts` (+3), `ConversationAiService.test.ts` (+2), `AiProfilePanel.test.tsx` (+3). `tsc --noEmit`/`eslint` confirmados limpos em `apps/api` e `apps/dashboard`. Suíte completa e `next build` pendentes na máquina do fundador, junto da migration.

---

## 39. Correções pós-F1.8 — 3 falhas de testes pré-existentes reveladas pelo `npm test` — ✅ corrigido

**Contexto**: após F1.8 implementado, `npm test` na máquina do fundador revelou 4 falhas em 3 suítes — nenhuma introduzida por F1.8, todas pré-existentes mas não detectadas pelo sandbox:

1. **`formatters.test.ts`**: `PIPELINE_COLUMN_ORDER` tinha `not_client` primeiro (incorreto). Corrigido: `[...CONVERSATION_STAGE_ORDER, NOT_CLIENT_COLUMN]`.

2. **`BaileysProvider.test.ts`**: um teste esperava 2 eventos para sequência inbound+fromMe+inbound; após ADR #97, a mensagem `fromMe: true` sem ID no cache passa a ser emitida como `direction: 'outbound'` → o teste correto espera 3 eventos, com `events[1]` tendo `direction: 'outbound'`.

3. **`ConversationDetailPanel.test.tsx`** (2 falhas): `Object.defineProperty({ value: ... })` falha silenciosamente para `scrollHeight`/`clientHeight` no jsdom (getter-only no protótipo do `HTMLElement`). Corrigido reescrevendo `stubScrollMetrics` para usar `get:` com closures.

**Impacto**: zero mudança de comportamento de produto. `tsc --noEmit` limpo após as 3 correções. Pendente na máquina do fundador: `npm test` para confirmar 0 falhas.

**Correção de acompanhamento (2026-08-05)**: `npm test` na máquina do fundador confirmou 1404/1406 — as 3 correções acima seguraram, mas as MESMAS 2 falhas de `ConversationDetailPanel.test.tsx` persistiram. A correção do item 3 acima (reescrever `stubScrollMetrics`) resolveu um problema real do teste, mas expôs um SEGUNDO bug, mais profundo, na própria produção: o `useEffect` que registra `container.addEventListener('scroll', ...)` (`ConversationDetailPanel.tsx`, então nas linhas 90-102) tinha array de dependências `[]` — roda uma única vez, logo após o PRIMEIRO commit do componente. Como `useConversationDetail` começa com `loading: true` (só vira `false` após o 1º fetch resolver) e o componente renderiza um `<Skeleton/>` enquanto `loading` é `true` (sem a `<div ref={scrollContainerRef}>`), o efeito rodava com `scrollContainerRef.current === null` e nunca era reexecutado quando o container real aparecia — o listener de scroll nunca era anexado. Consequência: `nearBottomRef` ficava travado em `true` (valor inicial) para sempre, então (a) o botão "Ir para mensagens recentes" nunca aparecia e (b) o efeito de acompanhar mensagem nova sempre arrancava o scroll pro fim, mesmo com o operador lendo o histórico — o próprio bug que a correção de UX de 2026-08-01 (ver entrada acima, "Validação oficial da Fase 1") tentou eliminar, nunca de fato corrigido em produção. **Correção**: trocar as deps do efeito de `[]` para `[loading]` — como `loading` transiciona de `true` para `false` uma única vez por vida do componente montado, o efeito reroda exatamente quando o container passa a existir. `tsc --noEmit`/`eslint` confirmados limpos; `npx jest ConversationDetailPanel.test.tsx` confirmado 4/4 verde no sandbox.

---

## 40. Fase 1, Bloco F1.9 — Respostas rápidas (templates) para o atendente humano — ✅ implementado

**Contexto**: item oficial seguinte da Fase 1 (`FASE_1_ANALISE_ESTRATEGICA.md` §9/§10, F1.9) — uma lista simples e configurável de textos prontos que o atendente insere com um clique no `MessageComposer`. Roadmap marcava `ADR necessária: não`. Duas decisões de escopo confirmadas com o fundador via `AskUserQuestion` antes de codificar: (1) respostas **por sessão** (mesmo padrão do Cérebro da IA, ADR #82) — cada WhatsApp pode ter seu próprio conjunto; (2) gestão (criar/editar/remover) restrita a **Administrator/Owner** (mesmo nível de `ai_profile:update`) — qualquer papel a partir de Operator já pode ler/inserir no composer.

**Implementado**: novo bounded context `services/quickReplies` (domain/entities/`QuickReply`, domain/repositories/`QuickReplyRepository`, domain/errors/`QuickReplyNotFoundError`, application/`QuickReplyService`, infrastructure/repositories/`PrismaQuickReplyRepository`, presentation/`quickReplyRouter`+`quickReplyErrorHandler`, `compositionRoot.ts`) — espelha `services/analytics` (CRUD autocontido, sem Redis, montado nos DOIS ramos de `mountWhatsAppSessionsRoutes()` em `index.ts`, degradado e completo). Novo model `QuickReply` (`tenantId`, `sessionName`, `content`, índice composto `(tenantId, sessionName)`, sem `@@unique` — várias linhas por sessão), migration `20260805120000_add_quick_replies`. Duas permissões novas em `permissions.ts`: `quick_reply:read` (a partir de OPERATOR) e `quick_reply:manage` (a partir de ADMINISTRATOR). Rota `GET/POST/PUT/DELETE /api/tenants/:tenantId/sessions/:sessionName/quick-replies[/:id]`, RBAC por rota, `update`/`remove` via `updateMany`/`deleteMany` escopados por `(id, tenantId, sessionName)` — IDOR-safe por construção (nunca afeta linha de outro tenant/sessão). Frontend: `clientApi.ts`/`apiClient.ts` (`callQuickRepliesApi`, mesma base `sessions` de `callAiProfileApi`), BFF `pages/api/sessions/[sessionName]/quick-replies/{index,[id]}.ts` (DELETE responde via `.end()`, sem corpo — evita `res.json(undefined)`), hook `useQuickReplies` (compartilhado entre a tela de gestão e o composer — atualização otimista da lista local após create/update/remove), `components/QuickRepliesPanel.tsx` (lista + criar + editar inline + remover, mesma casca de `UserManagementPanel`/`AuditLogPanel`), nova página `pages/sessions/[sessionName]/quick-replies.tsx` (guardada por papel, mesmo padrão de `ai-profile.tsx`), novo item "Respostas Rápidas" em `SessionSidebar.tsx` (mesmo gate de Cérebro da IA). `MessageComposer.tsx` ganhou prop `sessionName` (repassado por `ConversationDetailPanel.tsx`) e um botão que abre um dropdown local (sem dependência Radix nova) com as respostas da sessão — clicar insere o texto no campo (acrescenta com espaço se já houver conteúdo digitado) e fecha o dropdown; fecha também ao clicar fora.

**Impacto**: zero mudança de contrato pré-existente. Testes novos: backend — `QuickReplyService.test.ts` (12 casos), `PrismaQuickReplyRepository.test.ts` (8 casos), `quickReplyRouter.test.ts` (18 casos, RBAC + IDOR entre sessões/tenants), `permissions.test.ts` (+1); frontend — `quickReplies.test.ts`/`quickRepliesId.test.ts` (BFF, 11 casos), `QuickRepliesPanel.test.tsx` (jsdom, 7 casos), `MessageComposer.test.tsx` (+5 casos do seletor), `SessionSidebar.test.tsx` (+1 gate). **Validado no sandbox**: `tsc --noEmit`/`eslint` limpos nos dois pacotes. Suíte completa executada com sucesso no sandbox: `apps/api` 999/999 testes (97 suítes), `apps/dashboard`+`dashboard-jsdom` 468/468 testes (77 suítes) — 0 falhas.

**Validação real (2026-08-05)**: migration `20260805120000_add_quick_replies` aplicada (`npx prisma migrate deploy`, via containers `postgres`/`redis` subidos pelo `docker compose up -d`) + `npx prisma generate` — os 5 erros esperados de `prisma.quickReply` desapareceram, `tsc --noEmit` 100% limpo, suíte `apps/api` re-executada 999/999. API (`:4000`) e Dashboard (`next dev`, `:3000`) subidos localmente e abertos no Chrome real do fundador (`.claude/launch.json` novo). **Testado e aprovado pelo fundador na tela real.**

---

## 41. Documentação retroativa (2026-08-08) — Tags por sessão (R4) e Resumo de conversa por IA (R5) — ✅ implementado, documentação corrigida

**Contexto**: as migrations `20260806120000_add_tags`/`20260806130000_add_conversation_ai_summary` entraram no repositório em 2026-08-06 sem nenhuma entrada aqui nem ADR — só um comentário no `schema.prisma`. A auditoria técnica pré-beta (2026-08-08) confirmou, lendo o código, que as duas features estão completas e testadas (não é código morto), e fechou o gap de documentação. Ver DECISIONS.md ADRs #100/#101 para o detalhe técnico completo.

**Tags**: catálogo por sessão (`WhatsAppTag`, 8 cores fixas) + atribuição N:N a conversas (`WhatsAppConversationTag`). Bounded context `services/tags/`, RBAC (`tag:read`/`tag:manage`), UI reaproveitada em 3 lugares (conversa, lista, Pipeline).

**Resumo de conversa**: gerado sob demanda (nunca automático), `ConversationSummaryService`/`SummaryPromptBuilder` dedicados, campos `aiSummary`/`aiSummaryUpdatedAt`/`aiSummaryMessageCount`. Endpoint `POST .../conversations/:id/summary`.

**Achado**: resumo e "Assumir conversa" existiam desacoplados — o pop-up único (pedido antigo do fundador) nunca foi implementado. Fechado no item seguinte (§42).

---

## 42. Fase 1, Bloco F1.10 — Estabilidade e preparação para o beta fechado — ✅ implementado

**Contexto**: auditoria técnica pré-beta (2026-08-08) identificou riscos P0 (concorrência do worker, ausência de rate limit de IA, `useConversationDetail` varrendo até 1000 conversas por poll) e um pedido de produto nunca fechado (pop-up de handoff), além de itens de estabilidade menores. Corrigidos numa única rodada disciplinada. Ver DECISIONS.md ADR #102 para o detalhe técnico completo de cada item.

**Implementado**:
- Worker `ai-reply`: `concurrency: 5` + `KeyedMutex` (serializa só dentro da mesma conversa).
- `AiRateLimiter`/`InMemorySlidingWindowAiRateLimiter`: 6 tentativas/60s por conversa, 30/60s por sessão; estourar sinaliza atenção humana (mesmo mecanismo já existente), nunca gera mensagem técnica ao cliente.
- `GET /conversations/:id` (API + BFF) — elimina a varredura de listagem que `useConversationDetail` fazia.
- `ConversationHandoffPopup` — pop-up de handoff humano (resumo + "Assumir atendimento"), reusa componentes/endpoints já existentes.
- Índice `(tenantId, sessionName, lastMessageAt)` (migration `20260808120000_add_conversation_last_message_index`).
- `AgentMediaCache` isolado por tenant (era teto global de 500, agora 200 por tenant).
- Upload de mídia no BFF com teto de 16MB aplicado durante o streaming.
- Validação de Content-Type por assinatura binária (`mediaMagicBytes.ts`).
- Teste de regressão LID sem `remoteJidAlt`; teste flaky `formatElapsedDays` corrigido.
- Dois testes de integração real (Postgres + Redis/BullMQ) — únicos da suíte a usar infraestrutura real, não Fakes.
- `GET /health/ready` — Postgres/Redis/profundidade da fila de IA.

**Testes**: 201/201 suítes, 1722/1722 testes verdes (monorepo completo). `tsc --noEmit`/`eslint` limpos em `apps/api` e `apps/dashboard`. Migration aplicada e validada contra Postgres real na mesma sessão (`npx prisma migrate deploy`).

**Pendências registradas**: valores do rate limit são ponto de partida (calibrar com uso real do beta); `KeyedMutex`/rate limiter em memória protegem só um processo — escalonamento horizontal do worker/API exigiria versão distribuída (Redis). Análise do prompt consultivo do Cérebro da IA (Fase H) é item separado, ainda não implementado nesta rodada — só analisado/proposto.

---

_Este documento deve ser atualizado ao final de cada item aprovado._
