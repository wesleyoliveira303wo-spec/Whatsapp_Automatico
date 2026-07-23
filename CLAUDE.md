# CLAUDE.md

---

# Idioma Oficial do Projeto

- O idioma oficial do projeto é **Português (Brasil)**.
- Toda comunicação com o usuário deve ocorrer em Português.
- O inglês deve ser usado apenas para nomes de tecnologias, termos reservados da linguagem, comandos de terminal e APIs.
- Não traduzir nomes de tecnologias, funções, classes, bibliotecas ou APIs.


## Índice

1. [Visão Geral do Projeto](#visão-geral-do-projeto)
2. [Objetivos Técnicos](#objetivos-técnicos)
3. [Papel do Claude](#papel-do-claude)
4. [Filosofia de Desenvolvimento](#filosofia-de-desenvolvimento)
5. [Arquitetura Geral](#arquitetura-geral)
6. [Stack Tecnológica](#stack-tecnológica)
7. [Estrutura de Pastas](#estrutura-de-pastas)
8. [Convenções de Código](#convenções-de-código)
9. [Design System](#design-system)
10. [Banco de Dados](#banco-de-dados)
11. [Roadmap](#roadmap)
12. [Regras para Desenvolvimento](#regras-para-desenvolvimento)
13. [Processo de Trabalho](#processo-de-trabalho)
14. [Checklist de Qualidade](#checklist-de-qualidade)
15. [Segurança](#segurança)
16. [Escalabilidade](#escalabilidade)
17. [Regras Permanentes](#regras-permanentes)
18. [Memória do Projeto](#memória-do-projeto)

---

## 1. Visão Geral do Projeto <a name="visão-geral-do-projeto"></a>

- **Objetivo:** Construir uma plataforma de automação inteligente para WhatsApp que vá além de um mero disparador de mensagens, oferecendo um **CRM inteligente** com IA.
- **Propósito:** Auxiliar pequenas e médias empresas a prospectar, atender e nutrir leads via WhatsApp de forma automatizada, porém com intervenção humana quando necessário.
- **Visão de Longo Prazo:** Evoluir de uma aplicação local para um **SaaS multi‑tenant**, suportando múltiplas empresas, números de WhatsApp, agentes de IA e integrações externas.
- **Filosofia do Projeto:** **Valor entregue primeiro**, **arquitetura evolutiva**, **documentação viva** e **qualidade como baseline**.
- **Público‑Alvo:** Startups, agências de marketing e times de vendas que já utilizam WhatsApp como canal principal de comunicação.
- **Principais Funcionalidades:**
  - Conexão via QR Code (WhatsApp Web API).
  - Gerenciamento de sessões múltiplas.
  - Importação de listas de leads (CSV/Excel).
  - Criação e agendamento de campanhas.
  - Mensagens personalizadas com templates.
  - Respostas automáticas usando IA (Claude, GPT, Gemini).
  - Escalonamento para atendimento humano.
  - Histórico completo de conversas.
  - Painel administrativo moderno.
  - Métricas e analytics em tempo real.
  - Banco de conhecimento para IA (FAQ, documentos).
  - Preparação para multi‑usuário e multi‑empresa.

---

## 2. Objetivos Técnicos <a name="objetivos-técnicos"></a>

| Característica | Descrição |
|----------------|-----------|
| **Escalabilidade** | Arquitetura modular, serviços desacoplados, fila de mensagens e possibilidade de múltiplas instâncias.
| **Modularidade** | Cada domínio (WhatsApp, IA, CRM, Analytics) em módulos independentes com interfaces bem definidas.
| **Baixo Acoplamento** | Injeção de dependências, contratos (interfaces) e eventos.
| **Tipagem Forte** | TypeScript no frontend e backend (Node + TS). Schemas de dados com Zod/Prisma.
| **Reutilização** | Componentes UI, serviços e utilitários compartilhados.
| **Arquitetura Limpa** | Camadas (UI, Application, Domain, Infra) separadas.
| **Documentação Contínua** | `README`, `CONTRIBUTING`, JSDoc + Typedoc, diagramas e CLAUDE.md como fonte de verdade.
| **Teste Automatizado** | Unit, integration, e2e (Jest, Testing Library, Playwright).
| **Observabilidade** | Logs estruturados, métricas (Prometheus), tracing (OpenTelemetry).
| **CI/CD** | GitHub Actions com lint, test, build e deploy.

---

## 3. Papel do Claude <a name="papel-do-claude"></a>

- **Não gerar código sem planejamento.** Sempre analisar, identificar impactos e propor um plano.
- **Pensar antes de implementar.** Avaliar requisitos, riscos, trade‑offs e alternativas.
- **Explicar decisões técnicas** com justificativas claras.
- **Sugerir melhorias** contínuas (performance, segurança, UX).
- **Identificar riscos** (bloqueios, dependências, compliance).
- **Evitar duplicação** de código ou lógica.
- **Manter arquitetura consistente** alinhada ao Clean Architecture.
- **Agir como Tech Lead experiente**, orientando boas‑práticas e garantindo qualidade.

---

## 4. Filosofia de Desenvolvimento <a name="filosofia-de-desenvolvimento"></a>

| Princípio | Aplicação Prática |
|-----------|-------------------|
| **Clean Architecture** | Camadas independentes; domínio não conhece frameworks.
| **SOLID** | Interfaces para Inversão de Controle (I), responsabilidade única (S), etc.
| **KISS** | Soluções simples, evitando sobre‑engenharia.
| **DRY** | Funções/utilitários reutilizáveis; evitar código repetido.
| **YAGNI** | Implementar apenas o que o MVP exige; adiar funcionalidades futuras.
| **Separation of Concerns** | UI, lógica de negócios e infraestrutura em diretórios distintos.
| **Domain‑Driven Design (DDD)** | Quando o domínio de CRM se tornar complexo, usar Bounded Contexts.
| **Clean Code** | Nomes expressivos, funções pequenas, comentários apenas quando o *porquê* não é óbvio.

---

## 5. Arquitetura Geral <a name="arquitetura-geral"></a>

```
[Frontend] <--REST/GraphQL--> [API Gateway] <--gRPC/Message Queue--> [Backend Services]
        |                                   |
        |                                   +--[IA Service] (Claude, outros)
        |                                   |
        |                                   +--[WhatsApp Service] (WebSocket + QR)
        |                                   |
        |                                   +--[Scheduler] (BullMQ / Agenda)
        |                                   |
        +--[Auth Service] (JWT, OAuth2)   +--[Analytics Service] (Prometheus, Grafana)

[Database] <-- Prisma ORM --> PostgreSQL
[Message Queue] <-- Redis --> BullMQ
[Cache] <-- Redis -->
```

- **Frontend:** Next.js (React) + Tailwind + shadcn/ui – SPA com SSR para SEO interno.
- **Backend (API Gateway):** Node.js + Express (type‑safe) expose GraphQL/REST.
- **Serviços:** Cada domínio como micro‑service leve (WhatsApp, IA, CRM, Scheduler, Analytics, Auth).
- **Fila:** Redis + BullMQ para jobs de disparo de mensagens, retries, e análises.
- **IA:** Wrapper service que escolhe provedor (Claude default) e permite troca futura.
- **WhatsApp:** Integração via **WhatsApp Web** (WebSocket) ou **WhatsApp Cloud API** (quando disponível).
- **Scheduler:** Agendamento de campanhas, reminders, e limpeza de dados.
- **Analytics:** Coleta de eventos, armazenamento em PostgreSQL + visualização via Grafana.
- **Future SaaS:** Multi‑tenant via *tenantId* nas tabelas, isolamento de dados e uso de sub‑domínios.

---

## 6. Stack Tecnológica <a name="stack-tecnológica"></a>

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| **Frontend** | Next.js, React, TypeScript, Tailwind CSS, shadcn/ui | SSR, performance, ecosistema React, UI consistente. |
| **Backend** | Node.js (v20), Express, TypeScript, Zod | Ecossistema JavaScript unificado, alta produtividade. |
| **ORM** | Prisma (TypeScript) | Tipo‑safety, migrations, auto‑generação de tipos. |
| **Banco** | PostgreSQL | Relacional, robusto, suporte a jsonb para IA context. |
| **Fila/Messaging** | Redis + BullMQ | Simples, em‑memória, escalável. |
| **Cache** | Redis | Cache de sessões, tokens, resultados de IA. |
| **IA** | Claude (via API), abstração para GPT / Gemini | Provê LLM avançado; camada de abstração permite troca. |
| **WhatsApp** | WhatsApp Web (puppeteer) *ou* WhatsApp Cloud API (REST) | QR Code imediato; futuro migração para API oficial. |
| **Auth** | JWT + Refresh Tokens, bcrypt, OIDC (future) | Segurança, extensível para SaaS. |
| **Observability** | Winston (logs), OpenTelemetry, Prometheus, Grafana | Visibilidade completa em produção. |
| **CI/CD** | GitHub Actions, Docker, Docker Compose | Pipelines reproduzíveis, containers para dev & prod. |
| **Testing** | Jest + Testing Library (unit), Playwright (e2e) | Cobertura completa. |
| **Lint/Format** | ESLint + Prettier (TS) | Consistência de código. |

---

## 7. Estrutura de Pastas <a name="estrutura-de-pastas"></a>

```
/ (raiz)
├─ .claude/                # memória e arquivos internos do Claude
│   └─ memory/              # arquivos de memória persistente
│
├─ src/                     # código fonte
│   ├─ frontend/            # app Next.js
│   │   ├─ components/       # UI reutilizável (shadcn/ui base)
│   │   ├─ pages/            # Rotas (SSR/SSG)
│   │   ├─ hooks/            # React hooks de domínio
│   │   ├─ styles/           # Tailwind config, globals
│   │   └─ utils/            # Helpers client‑side
│   │
│   ├─ backend/            # API Gateway & services
│   │   ├─ api/              # Controllers (REST/GraphQL)
│   │   ├─ services/         # Lógica de negócio (WhatsApp, IA, Scheduler)
│   │   ├─ infra/            # Infra abstractions (DB, Redis, Queue)
│   │   ├─ domain/           # Entidades e casos de uso (DDD)
│   │   └─ config/           # Configs (env, feature flags)
│   │
│   ├─ shared/              # Código compartilhado entre frontend & backend
│   │   ├─ types/            # Typescript types (DTOs, enums)
│   │   ├─ validation/       # Zod schemas
│   │   └─ constants/         # Valores estáticos
│   │
│   └─ scripts/             # Scripts de setup, migrations, CI helpers
│
├─ prisma/                  # Prisma schema + migrations
│   └─ schema.prisma
│
├─ docs/                    # Documentação (arquitetura, decisões, FAQ)
│   └─ diagrams/            # PlantUML / Mermaid files
│
├─ public/                  # Assets estáticos (logo, favicon)
│
├─ tests/                  # Testes (unit e integration)
│   ├─ unit/
│   └─ integration/
│
├─ .env.example            # Template de variáveis de ambiente
├─ .gitignore
├─ package.json
├─ tsconfig.json
├─ jest.config.ts
├─ tailwind.config.js
└─ README.md
```

- **Responsabilidades:** Cada camada tem responsabilidade única, evitando *cross‑talk* entre UI e infra.
- **Aliases:** `@frontend/*`, `@backend/*`, `@shared/*` configurados no `tsconfig.json` para imports limpos.

---

## 8. Convenções de Código <a name="convenções-de-código"></a>

- **Nomenclatura:** `camelCase` para variáveis/functions, `PascalCase` para classes/componentes, `snake_case` apenas para nomes de bancos.
- **Arquivos:** Extensões `.ts` (backend) e `.tsx` (frontend). Um único export default por arquivo.
- **Imports:** Ordem: React, libs externas, aliases internas, relativos. Linhas vazias entre grupos.
- **Exports:** Preferir named exports; default apenas para componentes React.
- **Aliases:** Definidos em `tsconfig.json` (`@frontend/*`, `@backend/*`, `@shared/*`).
- **Comentários:** Apenas *porquê*; evitar comentários óbvios.
- **Tratamento de Erros:** `try/catch` centralizado em middlewares; erros customizados (`AppError`).
- **Logs:** Winston com níveis (`info`, `warn`, `error`), correlacionados a requestId.
- **Lint/Prettier:** Configurações padrão do Airbnb + Prettier; rodar `npm run lint` antes de commit.
- **Commit Guidelines:** Conventional Commits (`feat:`, `fix:`, `docs:` etc.).

---

## 9. Design System <a name="design-system"></a>

| Aspecto | Regra |
|---------|-------|
| **Componentes** | Baseados em shadcn/ui; cada componente tem *variant* e *size* padronizados.
| **Responsividade** | Mobile‑first; breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px).
| **Acessibilidade** | ARIA attributes, foco visível, contraste ≥ 4.5:1 (WCAG AA).
| **Tema** | Sistema de tokens (core colors, radii, spacing) via Tailwind `theme.extend`.
| **Cores** | Primária: `#0A74DA` (Anthropic blue); secundária: `#0065FF`; neutrals: `gray-50`‑`gray-900`.
| **Tokens** | `spacing`: 0‑64 (multiples of 4). `borderRadius`: `sm`, `md`, `lg`.
| **Tipografia** | Font: Inter (system fallback). Tamanhos: `sm` 0.875rem, `base` 1rem, `lg` 1.125rem, `xl` 1.25rem.
| **Reutilização** | Cada UI pattern (button, card, modal) tem um *compound component*.

---

## 10. Banco de Dados <a name="banco-de-dados"></a>

### Modelo Inicial (ER)

- **User** (`id`, `name`, `email`, `passwordHash`, `role`, `tenantId`)
- **Tenant** (`id`, `name`, `plan`, `createdAt`)
- **WhatsAppSession** (`id`, `qrCode`, `status`, `createdAt`, `updatedAt`, `tenantId`)
- **Lead** (`id`, `name`, `phone`, `source`, `status`, `createdAt`, `tenantId`)
- **Campaign** (`id`, `name`, `templateId`, `schedule`, `status`, `ownerId`, `tenantId`)
- **MessageTemplate** (`id`, `name`, `content`, `variables`, `tenantId`)
- **Conversation** (`id`, `leadId`, `sessionId`, `startedAt`, `endedAt`)
- **Message** (`id`, `conversationId`, `direction` (`IN/OUT`), `content`, `sentAt`, `aiGenerated`)
- **AnalyticsEvent** (`id`, `type`, `payload`, `timestamp`, `tenantId`)
- **KnowledgeBase** (`id`, `title`, `content`, `embeddingVector`, `tenantId`)

### Estratégia de Crescimento
- **Multi‑tenant:** Cada tabela possui `tenantId` (FK) para isolamento.
- **Sharding futuro:** Partitionamento por `tenantId` quando número de tenants > 1000.
- **Indexes críticos:** `phone` (Lead), `status` (Campaign), `createdAt` (Message), `tenantId` + `id` (todos).
- **Migrations:** Prisma migrates, versionadas no Git.

---

## 11. Roadmap <a name="roadmap"></a>

| Milestone | Objetivo | Entregáveis | Critérios de Aceite | Testes | Status |
|-----------|----------|-------------|----------------------|--------|--------|
| **M0 – Setup Inicial** | Estrutura do monorepo, CI/CD básico | Repositório, scripts Docker, lint, tests unitários | `npm run lint` passa, pipeline CI roda | Unit tests 80% coverage | ✅ Concluído |
| **M1 – Conexão WhatsApp (QR)** | Implementar sessão via QR, receber mensagens | Serviço WhatsApp (Baileys), endpoints REST, reconexão resiliente | Mensagens recebidas são armazenadas no DB | Testes de integração (mock WhatsApp) | ✅ Concluído (Scheduler BullMQ e UI de QR migraram para o escopo do M2, ver abaixo) |
| **M2 – Dashboard de Gestão de Sessões WhatsApp** *(redefinido — ver DECISIONS.md ADR #52)* | Painel para operador conectar/gerenciar sessões WhatsApp: lista, detalhe, QR Code, histórico, tempo real | BFF (Next.js, cookie httpOnly), SSE via polling, UI completa (`apps/dashboard`) | Operador consegue conectar uma sessão via QR e acompanhar status em tempo real pelo navegador | 348/348 testes (47 suítes), `tsc`/`next build` | ✅ Concluído (Fases 1–4, ver PROJECT_STATUS.md §22, ADRs #48–#51) |
| **M3 – IA Autoresponder** | Respostas automáticas usando Claude | Service IA, prompts templates, fallback humano | 90% das respostas automáticas com acurácia > 80% (avaliado manual) | Testes mock IA, integração UI | 🔜 Em planejamento — ver `MILESTONE_003_AI_AUTORESPONDER.md` |
| **M4 – Dashboard & Analytics** | Painel administrativo + métricas de campanhas | UI de dashboard, eventos analytics, Grafana embed | Dados de campanha visualizados corretamente | Testes de visualização + snapshot | Pendente |
| **M5 – Multi‑tenant SaaS** | Isolamento de empresas, auth JWT, tenant middleware | Auth Service, tenant middleware, migrations | Usuário só vê dados do próprio tenant | Testes de autorização + carga (locust) | 🟡 Essencial concluído 2026-07-22 (auth+RBAC+multiusuário+UI, M5A–M5H-lite; pendências menores registradas na Memória §18) |
| **M6 – Deploy Production** | Docker compose + Helm charts, CI/CD prod | Helm charts, CI pipeline prod, blue/green deploy | Deploy sem downtime, rollback funciona | Smoke tests pós‑deploy | Pendente |

> **Nota sobre a redefinição do M2** (2026-07-09, ver DECISIONS.md ADR #52): o escopo original de M2 nesta tabela ("CRM Core" — CRUD de Leads/Campaign, scheduler BullMQ, envio de mensagens) nunca foi iniciado e **não foi descartado** — fica como item de backlog sem slot alocado no momento, a ser reposicionado após a M3 (faz mais sentido de produto ter o autoresponder de IA funcionando antes de construir campanhas em massa). O que ocupa o slot M2 hoje é o Dashboard de Gestão de Sessões WhatsApp, efetivamente especificado, aprovado e entregue sob esse rótulo ao longo do desenvolvimento. Ver `ROADMAP.md` para o mesmo ajuste refletido no roadmap detalhado (OKR-style).

---

## 12. Regras para Desenvolvimento <a name="regras-para-desenvolvimento"></a>

1. **Analisar primeiro** – entender requisito, impactos, dependências.
2. **Identificar impactos** – código, DB, UI, segurança, performance.
3. **Sugerir melhorias** – refatoração, otimizações ou alternativas.
4. **Implementar somente após aprovação** – plano acordado.
5. **Não codificar sem planejamento** – usar `EnterPlanMode` quando necessário.
6. **Revisar antes de commit** – lint, testes, documentação.

---

## 13. Processo de Trabalho <a name="processo-de-trabalho"></a>

```
Planejamento → Arquitetura → Discussão (Claude) → Implementação → Testes → Refatoração → Documentação → Commit (Conventional) → PR Review → Merge → Deploy
```

- Cada etapa tem *definition of done* (DoD) explícita.
- Pull Requests devem conter descrição, checklist e link ao CLAUDE.md sections relevantes.
- Revisões de código incluem checklist de qualidade e segurança.

---

## 14. Checklist de Qualidade <a name="checklist-de-qualidade"></a>

- [ ] Build compila sem erros.
- [ ] TypeScript sem `any` crítico.
- [ ] Lint (`npm run lint`) sem warnings.
- [ ] Cobertura de testes ≥ 80%.
- [ ] Componentes reutilizáveis e documentados.
- [ ] Documentação (README, CLAUDE.md) atualizada.
- [ ] Código livre de duplicação evidente.
- [ ] Segurança revisada (OWASP Top 10).
- [ ] Performance baseline (tempo de resposta < 200 ms API).

---

## 15. Segurança <a name="segurança"></a>

| Aspecto | Estratégia |
|----------|------------|
| **Auth** | JWT + Refresh, bcrypt, 2FA opcional, OIDC gateway futuro. |
| **Env vars** | `.env` não versionado; validação com `zod-env`. |
| **Criptografia** | TLS para todas as comunicações, dados sensíveis (tokens) encriptados no DB (pgcrypto). |
| **Sessões** | Armazenadas em Redis com TTL, rotacionadas a cada login. |
| **Validações** | Zod schemas nos inputs de API; sanitização de strings (DOMPurify no front). |
| **Rate limiting** | Express middleware (`express-rate-limit`) nas rotas críticas. |
| **Logging de segurança** | Auditoria de login/logout, tentativas falhas, acesso a IA. |

---

## 16. Escalabilidade <a name="escalabilidade"></a>

- **Multi‑user / Multi‑tenant** – `tenantId` nas tabelas, middleware que injeta contexto.
- **Múltiplos números WhatsApp** – Cada `WhatsAppSession` tem seu próprio container/worker.
- **Agentes de IA** – Pool de workers, cache de embeddings no Redis.
- **Campanhas simultâneas** – BullMQ com *concurrency* configurável; back‑pressure.
- **Horizontal scaling** – Docker Compose → Kubernetes; serviços stateless.
- **Observability** – métricas por tenant, alertas automáticos.

---

## 17. Regras Permanentes <a name="regras-permanentes"></a>

1. **Nunca remover funcionalidade sem justificativa documentada**.
2. **Código duplicado é proibição** – refatorar imediatamente.
3. **Documentação deve estar sempre atualizada** (README, CLAUDE.md, diagramas).
4. **Todas as decisões arquiteturais precisam de registro** em *Memória do Projeto*.
5. **Sempre explicar o *porquê* de cada escolha**.
6. **Pensar no crescimento**: design para multi‑tenant desde o início.
7. **Segurança primeiro** – validações, sanitização e rate‑limit.
8. **Testes são obrigatórios** – nenhum merge sem cobertura mínima.
9. **Feedback loop** – revisões de PR devem conter sugestões de melhoria.

---

## 18. Memória do Projeto <a name="memória-do-projeto"></a>

> **Esta seção será preenchida ao longo do tempo**
>
> - Decisões arquiteturais importantes
> - Mudanças de stack
> - Problemas críticos e soluções
> - Padrões adotados ou descartados
> - Lições aprendidas
>
> Cada entrada deverá seguir o padrão:
>
> ```markdown
> ### <Título da Decisão>
> **Data:** YYYY‑MM‑DD
> **Contexto:** (por que a decisão foi necessária)
> **Decisão:** (o que foi feito)
> **Impacto:** (benefícios e trade‑offs)
> ```

### Milestone 2 — Dashboard de Gestão de Sessões WhatsApp (BFF + SSE + UI)
**Data:** 2026-07-09
**Contexto:** O Dashboard (`apps/dashboard`) precisava de uma tela real para operadores conectarem/gerenciarem sessões WhatsApp — até então só existia o placeholder de Sidebar/Header da Milestone 0. A API key de longo prazo do tenant (Production Hardening) não podia ser exposta ao JS do browser.
**Decisão:** Next.js atua como Backend-for-Frontend — API key guardada só num cookie httpOnly cifrado no servidor; browser nunca fala com `apps/api` diretamente. Tempo real via SSE implementado como polling (~2s) do BFF sobre os endpoints REST já existentes, não push real de Domain. QR Code renderizado no cliente (`qrcode.react`) a partir da string crua que o Baileys gera. Histórico de transições de status persistido numa entidade separada (`WhatsAppSessionEvent`), sobrevivendo à remoção da sessão.
**Impacto:** Ver DECISIONS.md ADRs #48–#51 para o detalhe completo (Fases 1–4). Ver PROJECT_STATUS.md §22. Trade-off aceito: latência de 1-3s no tempo real (poll, não push) — evita expandir contratos do módulo WhatsApp além do necessário.

### Redefinição do Milestone 2 no Roadmap
**Data:** 2026-07-09
**Contexto:** O Roadmap original (§11 acima, `ROADMAP.md`) definia M2 como "CRM Core" (Leads/Campanhas) — escopo nunca iniciado. O que foi de fato entregue sob o rótulo "Milestone 2" nesta sessão foi o Dashboard de Gestão de Sessões WhatsApp.
**Decisão:** Redefinir M2 no Roadmap para refletir o que foi realmente entregue, em vez de renumerar tudo. "CRM Core" vira item de backlog sem slot alocado, a ser reposicionado após a M3.
**Impacto:** Documentação alinhada com a comunicação real (o que o usuário e o histórico do projeto já chamam de "M2"/"M3"). Nenhum código afetado. Ver DECISIONS.md ADR #52.

### Estabilização pós-Milestone-2: `npm run lint` estava quebrado desde a Milestone 0
**Data:** 2026-07-09
**Contexto:** Auditoria de estabilização (solicitada antes de iniciar a M3) encontrou que `eslint.config.js` (scaffold de 1º de julho, nunca exercitado) fazia o ESLint 8.57+ auto-preferir "flat config" inválido, quebrando `npm run lint` (raiz, `apps/api`, `apps/dashboard`) e o step "Lint" do `ci.yml` por completo, silenciosamente, desde antes do início da Milestone 1.
**Decisão:** Forçar ESLint de volta ao modo legado (`.eslintrc.js`) via `ESLINT_USE_FLAT_CONFIG=false`, usando `cross-env` para funcionar em Windows. Também corrigidos: duplicação de `isolatedModules` no `ts-jest`, 6 comentários `eslint-disable` mortos (regra de um plugin nunca instalado), e falta de `argsIgnorePattern: '^_'` na regra `no-unused-vars` (convenção que o código legado já seguia sem a regra reconhecer).
**Impacto:** `npm run lint` volta a funcionar; 0 problemas na árvore ativa (`apps/api`, `apps/dashboard`). Migração completa para ESLint 9/flat config fica registrada como item futuro, não decidida nesta rodada. Ver DECISIONS.md ADR #53.

### Milestone 5 — Auth, RBAC e Multiusuário (M5A–M5H-lite)
**Data:** 2026-07-22
**Contexto:** O Dashboard autenticava só com a API key do tenant (plano máquina) — sem conceito de pessoa, cargo ou trilha de responsabilidade.
**Decisão:** Bounded context `services/auth` completo: usuários com senha scrypt (zero dependência), access token HS256 curto + refresh token com rotação e detecção de reuso, RBAC fixo em código (5 cargos, catálogo `Permission` + `hasPermission` + régua `outranks`), trilha de auditoria append-only, gestão de usuários (UserManagementService, hierarquia estrita: só gerencia quem está estritamente abaixo; owner intocável; senha provisória com `must_change_password` + troca obrigatória). `authenticate` dois-planos (Bearer OU X-API-Key) nas rotas de conversas/sessões — API key preservada como plano máquina (ADR #45/#54 intactas). Rotas `/users` são human-only (ator identificável). BFF: cookie httpOnly guarda tokens de pessoa; renovação proativa do access token centralizada no `requireSession` (regrava cookie com par rotacionado); troca de senha reloga automaticamente. UI: login e-mail/senha (API key como fallback), `/change-password` com portão nas páginas protegidas, `/users` (RH) visível só para administrator/owner, Header identifica o logado. Rate limit em memória (janela fixa, 20/15min por IP) em login/refresh.
**Impacto:** Multiusuário funcional de ponta a ponta com compatibilidade total do fluxo antigo por API key. Pendências registradas (M5 completo): viewer de auditoria na UI, CSRF token explícito (mitigado por SameSite=Lax), lockout por conta (mitigado por rate limit por IP), rate limit compartilhado via Redis quando houver multi-instância. Migration nova: `must_change_password` (aditiva, default false). Suíte: 761+ testes.

### Milestone 6 (parcial) — Segundo provider de IA: Gemini (Google) para free tier
**Data:** 2026-07-22
**Contexto:** O autoresponder só tinha o `ClaudeAiProvider` (Anthropic, pago). Durante o primeiro teste ponta a ponta real, a conta da Anthropic estava sem crédito e toda resposta saía como `provider_error`. Para desenvolver/validar sem custo — e para viabilizar planos de menor custo no futuro SaaS — era preciso um provider com free tier. A arquitetura Ports & Adapters da M3 (port `AiProvider` + `AiProviderFactory`) já tinha sido desenhada exatamente para isso.
**Decisão:** Novo adapter `GeminiAiProvider` (Infrastructure) implementando o port `AiProvider` via **API REST `generateContent` do Google Generative Language (v1beta) com `fetch`** — deliberadamente SEM SDK (diferente do `ClaudeAiProvider`): zero dependência nova (mesma filosofia do scrypt/rate limiter), `fetch` injetável torna o teste trivial (sem `jest.mock` de módulo), e o endpoint é pequeno/estável. Duas diferenças de formato tratadas só neste adapter: papéis `user`/`model` (mapeia `assistant->model`) e chave no header `x-goog-api-key` (não no query `?key=`, evita vazar em logs). `AiProviderFactoryImpl` refatorada de construtor posicional para **options-object** `{ claude?, gemini? }` — cada provider só é registrado quando configurado; pedir um não configurado lança `AiProviderNotSupportedError` (mesmo erro de "não implementado"). Seleção via env **`AI_PROVIDER`** (default `claude`, compatibilidade total); o worker valida e exige só as credenciais do provider escolhido. Preços do Gemini adicionados em `AI_PRICING` (flash-lite/flash/pro) — no free tier o custo real é US$ 0, valores servem para estimar o tier pago.
**Impacto:** Trocar de provider é só `AI_PROVIDER=gemini` + `GEMINI_API_KEY`/`AI_GEMINI_MODEL` no `.env` — zero mudança em `ConversationAiService`/`PromptBuilder`/worker além do wiring. Blast radius da refatoração da factory: só `worker.ts` e o teste da factory. `'openai'` segue previsto no tipo, sem adapter (YAGNI). Testes novos: `GeminiAiProvider.test.ts` (9), factory reescrita + cobertura gemini, pricing +1. Estratégia de produto: Gemini free tier para dev/validação e planos básicos; Claude como upgrade de qualidade/plano premium — decisão invisível ao cliente (custo embutido na mensalidade), reversível por design.

### Base de Conhecimento (Nível 1) — "Cérebro da IA" por empresa (perfil de negócio no prompt)
**Data:** 2026-07-22
**Contexto:** No primeiro teste real ponta a ponta, a IA respondeu genérico e escalou para humano ao ser perguntada sobre agendamento — comportamento correto (anti-alucinação), mas sem valor de negócio: ela não conhecia a empresa. Faltava um jeito de cada cliente do SaaS "ensinar" a IA sobre seu negócio (quem é, o que vende, preços, horários). O `KnowledgeBase` planejado na §10 nunca foi criado no banco (era o Nível 2, RAG/embeddings). Este é o Nível 1: um blob de texto livre por tenant.
**Decisão:** Nova tabela DEDICADA `AiBusinessProfile` (1:1 com Tenant via `tenant_id @unique`), NÃO reusando o nome reservado `KnowledgeBase` (Nível 2). Migration aditiva/isolada (`20260722120000_add_ai_business_profile`). O texto é **anexado** ao `systemPrompt` base pelo `PromptBuilder` (3º param opcional `businessContext`), num bloco rotulado "# Informações da empresa" — nunca substitui o base, então as regras anti-alucinação/escalonamento seguem sempre ativas; contexto vazio/ausente = comportamento antigo (compatível). `ConversationAiService` ganhou dependência OPCIONAL `AiBusinessProfileRepository` (6º param) e busca o perfil por `tenantId` com **degradação graciosa** (try/catch → responde genérico se a leitura falhar; base auxiliar nunca derruba a resposta, mesmo racional de `calculateCostUsd`). REST: `GET`/`PUT /api/tenants/:tenantId/ai-profile`, RBAC POR ROTA (`ai_profile:read`/`ai_profile:update`, ambos só administrator/owner) — padrão do `conversationsRouter`, não `requirePermission` no mount. Teto de tamanho `MAX_PROFILE_CONTENT_LENGTH=20.000` (custo: o texto vira tokens a cada resposta). BFF proxy + página `/ai-profile` ("Cérebro da IA") com textarea, guardada por cargo (administrator/owner) + link na Sidebar. `GeminiAiProvider`/adapters não sabem que o perfil existe — a injeção é 100% no `PromptBuilder`.
**Impacto:** Cada empresa configura a própria IA por uma caixa de texto, sem código. Multi-tenant por construção (perfil por `tenantId`). Reversível: salvar vazio volta ao genérico. Nível 2 (RAG por embeddings, para catálogos grandes) fica para quando houver demanda real — o nome `KnowledgeBase` continua reservado. Testes novos: PromptBuilder (+3), ConversationAiService (+3), PrismaAiBusinessProfileRepository (3), AiBusinessProfileService (7), aiProfileRouter (11), permissions (+1), composition (+1), BFF proxy (5). NOTA DE VERIFICAÇÃO: `tsc` do `apps/api` acusa 2 erros em `PrismaAiBusinessProfileRepository` (`prisma.aiBusinessProfile` inexistente) ATÉ rodar `npx prisma generate` + `migrate dev` — limitação já conhecida de todo bloco que adiciona model; some após gerar o client.

### Atendimento humano pela Dashboard: responder + auto-escalonamento + notificação + tempo real (N2)
**Data:** 2026-07-23
**Contexto:** Depois do teste real, três pedidos: (1) responder o cliente PELA Dashboard quando o operador assume; (2) ser NOTIFICADO quando a IA passa o atendimento para um humano (evitar fila de espera); (3) a tela da conversa atualizar em tempo real (o operador tinha de dar F5 para ver a conversa da IA com o cliente). Descoberta-chave durante a análise: a IA dizer "vou encaminhar para um humano" era só TEXTO — nada mudava o estado; a conversa seguia em `bot` e a IA continuava respondendo. Sem um estado real de "aguardando humano", a notificação não teria o que observar.
**Decisão:**
- **Envio pelo operador:** `OutboundMessageCommand` generalizado de forma RETROCOMPATÍVEL — `aiInteractionId` virou opcional e ganhou `idempotencyKey` (UUID) para mensagens de humano; dispatcher usa `aiInteractionId ?? idempotencyKey` como `jobId`; consumer só faz `linkMessage` se houver `aiInteractionId`. Fluxo da IA INTOCADO (sempre passa `aiInteractionId`). Novo `ConversationsService.sendAgentMessage` (valida `human` + ownership, mesma régua de `resume`), rota `POST /conversations/:id/messages` (`message:send`), despacho pela MESMA fila outbound (ordem/socket únicos, ADR #54). `apps/api` passou a ter um produtor da fila `whatsapp-outbound` (antes só o worker produzia). Erro novo `ConversationNotHumanError` → 409. UI: `MessageComposer` na tela de detalhe, visível só quando `status='human'`.
- **Auto-escalonamento (marcador interno):** a IA inclui o marcador `ESCALATION_MARKER` (`[[ESCALAR_HUMANO]]`) quando decide passar para um humano (instrução no `systemPrompt` v1). `extractEscalation` (Domain, `services/ai/domain/escalationSignal.ts`) detecta e REMOVE o marcador (cliente nunca vê); `ConversationAiService` devolve `escalate` no resultado `success` com o `content` já limpo; `AiReplyJobProcessor`, após ENVIAR a mensagem de aviso, coloca a conversa em `human` SEM dono (`assignedToUserId: null`) → entra na fila de espera e a IA para de responder (`shouldAutoRespond` volta false). Comportamento escolhido: "IA avisa e silencia".
- **Notificação:** "aguardando humano" = `status='human'` E sem dono. `useWaitingForHuman` (na Sidebar, montada em toda página protegida) faz polling (~5s), mostra contador (badge vermelho ao lado de "Conversas") e, quando o número SOBE, toca um som (Web Audio, sem asset) + notificação nativa do navegador (`lib/notify.ts`); nunca alarma no 1º carregamento. Lista destaca as linhas aguardando (âmbar + selo "Aguardando atendente").
- **Tempo real (sobrepõe a decisão "SEM SSE" do M3/Bloco 6):** hook `usePollingRefresh` (pausa com a aba oculta, refaz ao voltar) ligado a `useMessagesTimeline`, `useAiInteractions` e `useConversationDetail` (este sem piscar "Carregando" nos polls e sem apagar a conversa em falha transitória). A tela da conversa se atualiza sozinha (~4s).
**Impacto:** Operador atende de ponta a ponta pela Dashboard; a IA entrega o bastão sozinha e o time é avisado na hora; nada de F5. Fluxo da IA e testes existentes preservados (mudança do outbound é aditiva). `ai_profile`/Gemini intactos. Testes novos/ajustados: OutboundCommandConsumer (+1), BullMqOutboundMessageDispatcher (+1), ConversationsService (+7 sendAgentMessage), escalationSignal (3), ConversationAiService (+1 escalate, +1 ajuste), AiReplyJobProcessor (+2), BFF messages proxy (5). Pendências: idempotência exactly-once do envio segue "at-least-once" (risco de MVP já documentado no OutboundCommandConsumer); notificação por e-mail e permissão de som dependem do navegador/gesto do usuário.

### Bug crítico de entrega: LID (@lid) — responder ao endereço de privacidade não entrega
**Data:** 2026-07-23
**Contexto:** Teste real com um NÚMERO NOVO: a IA gerava a resposta (aparecia na Dashboard, "Gerada por IA"), mas ela NÃO chegava no celular do cliente. Como o `OutboundCommandConsumer` só grava a `Message` DEPOIS de `sendMessage()` não lançar, o fato de a mensagem aparecer na Dashboard provava que o Baileys ACEITAVA o envio — mas não entregava. Restart completo da API não resolveu (descartou a hipótese de "socket zumbi"). O `contact_jid` da conversa era `254352879009802@lid` — formato LID (Linked ID, privacidade do WhatsApp para contas/números novos), não um telefone. `BaileysProvider.handleMessagesUpsert` guardava `key.remoteJid` CRU como `from`; responder ao `@lid` é aceito pelo Baileys mas cai no vazio.
**Decisão:** No `handleMessagesUpsert`, o endereço de resposta passou a ser `jidNormalizedUser(key.senderPn || remoteJid)`. `senderPn` (campo de `WAMessageKey` no Baileys 6.7.23 — a versão REAL instalada, `^6.7.9` resolveu para 6.7.23) traz o número real (`@s.whatsapp.net`) do remetente quando a mensagem vem de um LID; sem LID, é ausente e cai no `remoteJid` de sempre (comportamento inalterado). `jidNormalizedUser` remove sufixo de device/agente. Como a conversa é chaveada por `contactJid`, mensagens de um LID passam a criar/achar a conversa pelo PN (número real) — conversas antigas gravadas com `@lid` ficam órfãs (aceitável). Mock virtual de `@whiskeysockets/baileys` no teste ganhou `jidNormalizedUser` (minimalista) + 2 testes (LID→senderPn; strip de device).
**Impacto:** Envio volta a entregar para números no formato LID (cada vez mais comum, sobretudo contas novas). NÃO era o Gemini nem limite de free tier — a geração sempre funcionou; o problema era só o "envelope" do envio. Pendência: quando o WhatsApp NÃO fornece `senderPn` (ex.: privacidade total, comunidades), ainda cairíamos no `@lid` — mapear LID→PN via `signalRepository` do Baileys fica como evolução se aparecer esse caso. Testes: BaileysProvider 49/49.

---

*Este documento será a referência única para todo o time. Qualquer divergência deve ser discutida e registrada aqui.*

---
