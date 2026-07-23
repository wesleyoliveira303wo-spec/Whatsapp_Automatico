# Architecture Overview

> ⚠️ **DOCUMENTO SUPERADO (scaffolding da Milestone 0) — NÃO é fonte de verdade.**
> Decisão D20 (ADR #58) e D41/ADR #59: este arquivo foi gerado no scaffolding inicial e descreve um sistema que **não corresponde ao implementado** (ex.: GraphQL/Apollo, JWT+RBAC, React Query/Zustand/shadcn, Winston, Prometheus/OpenTelemetry, Puppeteer, `Conversation.status` com 7 valores, entidades `Contact`/`Tag`/`Attachment` — nada disso existe no código real). As fontes de verdade vigentes são: **`CLAUDE.md`, `DECISIONS.md` (ADRs), `PROJECT_STATUS.md`, `MILESTONE_003_AI_AUTORESPONDER.md`, `MILESTONE_004_ANALYTICS_LEVANTAMENTO.md` e o código em `apps/api`/`apps/dashboard`**. Mantido no repositório apenas por histórico; não orientar decisões por ele.

This document provides a comprehensive description of the system architecture for the **WhatsApp Automation Platform**. It follows the **Clean Architecture** principles defined in `CLAUDE.md` and is the definitive reference for developers, reviewers, and auditors.

---

## 1. High‑level Diagram

```mermaid
graph LR
    subgraph Frontend [Next.js (React)]
        UI[UI Components]
        Client[API Client (GraphQL/REST)]
    end
    subgraph API_Gateway [Node.js Express Gateway]
        REST[REST Controllers]
        GraphQL[GraphQL Server]
        Auth[Auth Middleware]
        Rate[Rate Limiter]
    end
    subgraph Services
        WhatsApp[WhatsApp Service]
        IA[AI Service]
        Scheduler[Scheduler (BullMQ)]
        CRM[CRM Core Service]
        Analytics[Analytics Service]
    end
    subgraph Infra [Infrastructure]
        DB[(PostgreSQL)]
        Redis[(Redis)]
        Queue[(BullMQ)]
        Cache[(Redis Cache)]
        OT[OpenTelemetry]
    end
    UI --> Client --> REST & GraphQL --> Auth --> Rate --> WhatsApp
    Auth --> CRM
    CRM --> Scheduler
    Scheduler --> WhatsApp
    IA --> Scheduler
    CRM --> DB
    WhatsApp --> DB
    Analytics --> DB
    Queue --> Redis & Cache
    OT --> Services & Infra
```

---

## 2. Layered Structure (Clean Architecture)
| Layer | Responsibility | Typical Modules |
|-------|----------------|-------------------|
| **Presentation** (UI) | React components, pages, client‑side state. | `frontend/` – pages, components, hooks. |
| **Application** (Use‑cases) | Orchestrates business rules, calls domain services. | `backend/services/` – campaign orchestrator, lead manager. |
| **Domain** | Core business entities, interfaces, validation. | `src/shared/types/`, `src/shared/validation/` |
| **Infrastructure** | External adapters: DB, queue, external APIs (WhatsApp, Claude). | `backend/infra/` – Prisma, Redis client, HTTP wrappers. |

All dependencies point **inward**; outer layers may depend on inner ones, never the reverse.

---

## 3. Frontend
- **Framework**: Next.js (React) with TypeScript.
- **Styling**: Tailwind CSS + shadcn/ui component library.
- **State Management**: React Query for async data, Zustand for global UI state.
- **Routing**: File‑system based (pages) with SSR for SEO‑critical routes.
- **Authentication**: JWT access token stored in HttpOnly cookie; refresh flow handled by Next.js API routes.
- **Key Components**:
  - Dashboard (charts, KPI widgets).
  - Lead table with bulk actions.
  - Campaign builder (drag‑and‑drop template editor).
  - Chat view (real‑time messages via WebSocket).

---

## 4. Backend (API Gateway & Services)
### 4.1 API Gateway
- **Node.js v20 + Express** – lightweight, typed via TypeScript.
- **GraphQL** for flexible data fetching (Apollo Server) and **REST** for simple CRUD.
- **Middlewares**:
  - **Auth** (`authMiddleware.ts`) validates JWT, injects `req.tenantId`.
  - **Rate limiting** (express‑rate‑limit) per tenant.
  - **Error handling** centralised (`errorHandler.ts`).
  - **Observability** (OpenTelemetry instrumentation).

### 4.2 Services
| Service | Responsibility | External Dependencies |
|---------|----------------|---------------------------|
| **WhatsApp Service** | Handles QR login, inbound/outbound messaging, session state. | Puppeteer (WebSocket to WhatsApp Web) or future Cloud API. |
| **AI Service** | Wraps Claude API, caches embeddings, manages prompt templates. | Claude API (HTTPS), Redis cache. |
| **Scheduler** | BullMQ workers execute campaign jobs, retries, rate‑limited sends. | Redis (queue), DB (campaign state). |
| **CRM Service** | Core domain logic: lead lifecycle, campaign rules, conversion tracking. | DB, AI Service (auto‑qualification). |
| **Analytics Service** | Emits events to Prometheus, stores raw events for dashboards. | PostgreSQL (event store), Prometheus exporter. |
| **Auth Service** | JWT issuance, refresh, password hashing, optional 2FA. | PostgreSQL (users), bcrypt. |

---

## 5. Database (PostgreSQL + Prisma)
- **Schema** defined in `prisma/schema.prisma` (see `DATABASE.md`).
- **Multi‑tenant design**: every table contains a `tenantId` foreign key. Row‑level security policies enforce isolation.
- **Indexes** on high‑cardinality columns (`phone`, `status`, `createdAt`).
- **Encrypted columns** for personally identifiable information (PII) using `pgcrypto`.
- **Migrations** managed via Prisma Migrate, stored in `prisma/migrations/`.

---

## 6. Messaging Queue (BullMQ + Redis)
- **BullMQ** provides reliable job processing with retries, back‑off, and concurrency limits.
- **Queue Types**:
  - `campaign:send` – scheduled messages.
  - `ai:reply` – generate AI response for inbound message (Milestone 3, `ai-reply`).
  - `whatsapp:outbound` – outbound send commands from the AI worker to the API process (Milestone 3, `whatsapp-outbound` — see §6.1, ADR #54).
  - `analytics:track` – fire‑and‑forget event logging.
- **Workers** are stateless Node processes; scaling is achieved by increasing worker count in the Kubernetes deployment. **Exception**: the process that owns live WhatsApp sockets (`apps/api`) is not stateless with respect to those sockets — see §6.1.

### 6.1 Process Topology and Socket Ownership (Milestone 3, ADR #54)

Starting with Milestone 3, the backend is split into two process roles, both required to keep exactly one live Baileys socket per WhatsApp session:

```
┌───────────────────── apps/api (single owner of Baileys sockets) ─────────────────────┐
│  HTTP (Express)                                                                       │
│    └─► WhatsAppSessionService ─► WhatsAppConnectionRegistry (in-memory Map)          │
│                                        └─► SessionManager ─► BaileysProvider (socket) │
│                                                                       ▲                │
│  OutboundCommandConsumer (consumes "whatsapp-outbound") ─────────────┘                │
└───────────────────────────────────────▲────────────────────────────────────────────────┘
                                         │ BullMQ "whatsapp-outbound"
┌───────────────────────────────────────┴────────────────────────────────────────────────┐
│  apps/worker (AI processing, never touches sockets or the Registry)                    │
│    BullMQ Worker "ai-reply" ─► ConversationAiService ─► AiProvider (Claude/…)          │
│         └── on a validated reply: publishes to "whatsapp-outbound" only ──────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **`apps/api`** is the **only** process that instantiates `WhatsAppConnectionRegistry` and holds live Baileys sockets. It also runs `OutboundCommandConsumer`, an in-process BullMQ consumer of the `whatsapp-outbound` queue — this is the only path through which an automatically generated reply reaches `BaileysProvider.sendMessage()`.
- **`apps/worker`** never imports, instantiates, or depends on `WhatsAppConnectionRegistry`, `WhatsAppProvider`, or any concrete socket implementation. Its only way to request an outbound send is the port `OutboundMessageDispatcher`, implemented via the `whatsapp-outbound` queue.
- This separation exists because `WhatsAppConnectionRegistry` is an in-memory, per-process cache — a second process calling it directly would open a second Baileys socket for the same WhatsApp number. See `DECISIONS.md` ADR #54 for the full rationale and the alternatives considered (including the deferred distributed-lease approach in ADR #16, which this design composes with rather than replaces).
- Both `apps/api` and `apps/worker` share the same Redis-backed BullMQ instance; `ai-reply` flows API→worker (via the message-ingestion path) and `whatsapp-outbound` flows worker→API.

---

## 7. WhatsApp Integration
### 7.1 Current Implementation (QR Code)
- Puppeteer launches a headless Chrome instance.
- QR image is streamed to the frontend via WebSocket.
- Session cookies stored in Redis with a TTL; refreshed automatically.
- Incoming messages are captured via the WebSocket, parsed, and routed to the CRM service.

### 7.2 Future Migration Path
| Phase | Action |
|-------|--------|
| **Phase 1** | QR login with Puppeteer (M0).
| **Phase 2** | Abstract `WhatsAppProvider` interface.
| **Phase 3** | Implement `CloudAPIProvider` using WhatsApp Cloud API once business verification completed. |
| **Phase 4** | Seamless switch via DI container; no code changes in higher layers. |

---

## 8. AI Service (Claude Integration)
- **Prompt templates** live under `shared/promptTemplates/` and are version‑controlled.
- **Token usage monitoring** via `analytics:track` events (`tokensUsed`, `model`).
- **Caching**: Responses for identical prompts within a 5‑minute window are cached in Redis (key = hash(prompt+context)).
- **Safety**: System prompt includes guardrails; content moderation is performed on every generated message before sending to WhatsApp.

---

## 9. Observability & Monitoring
| Component | Metrics |
|-----------|---------|
| API Gateway | Request latency, error rate, auth failures. |
| Worker processes | Job success/failure, processing time, queue depth. |
| Database | Connection pool size, query latency, deadlocks. |
| Redis | Memory usage, hit/miss rate. |
| AI Service | Tokens per request, average latency, cost. |
| Frontend | Page load time, JS error rate. |

Metrics are exported via Prometheus client libraries and visualised in Grafana dashboards (`docs/diagrams/grafana-dashboard.png`).

---

## 10. Security Considerations
- **Transport security**: All external traffic forced over HTTPS (TLS 1.3). Nginx ingress terminates TLS.
- **Auth**: JWT signed with RS256; refresh tokens stored HttpOnly, SameSite=Strict.
- **Data at rest**: PostgreSQL column‑level encryption for PII; Redis data encrypted via `redis-cli --tls`.
- **Rate limiting** per tenant (100 req/s) + global flood protection.
- **Input validation**: Zod schemas for every API payload; sanitisation of HTML via DOMPurify on the client.
- **Dependency scanning**: GitHub Dependabot, Snyk CI jobs.
- **Secret management**: All secrets stored in Vault/Kubernetes secrets; never committed.

---

## 11. Deployment Model
| Environment | Containerization | Orchestration |
|------------|-------------------|--------------|
| **Local dev** | Docker Compose (Postgres, Redis, API, Frontend) | Docker Compose |
| **Staging / Prod** | Multi‑stage Docker images (builder + runtime) | Kubernetes (Helm chart `helm/whatsapp-automation/`) |
| **CI/CD** | GitHub Actions run lint, test, build, push images, Helm upgrade. |

---

## 12. Extensibility Guidelines
1. **Add a new service** – create an interface in `src/backend/domain/` and register implementation in the DI container (`src/backend/infra/container.ts`).
2. **Expose new API** – add a GraphQL resolver or REST controller; keep request validation separate from business logic.
3. **Add a new tenant‑specific feature** – guard with `tenantId` in service layer; write integration tests for at least two tenants.
4. **Swap AI provider** – implement new `AIProvider` adhering to `generateReply(context: ChatContext): Promise<string>`; no changes required elsewhere.

---

## 13. Decision Log
All architectural decisions are captured in `DECISIONS.md` with rationale, trade‑offs, and date. Refer to that file for historical context.

---

*Generated by Claude Code – your AI architect for the WhatsApp Automation Platform.*