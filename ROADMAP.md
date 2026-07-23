# Roadmap

A clear, time‑boxed plan for delivering the WhatsApp Automation Platform. Milestones are expressed as **Objectives**, **Key Results**, and **Deliverables**.

---

## Milestone 0 – Foundations (0 weeks)
| Objective | Key Results | Deliverables |
|-----------|-------------|--------------|
| Set up repository & CI/CD | • Repository initialized with proper folder layout.\n• GitHub Actions CI runs lint, type‑check, tests. | `README.md`, `CLAUDE.md`, CI workflow, `package.json` |
| Establish documentation backbone | • All markdown docs listed in the project tree are created and populated. | Documentation files (this file, `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, …) |
| Define coding standards & tooling | • ESLint, Prettier, Husky pre‑commit hooks configured. | `.eslintrc.js`, `.prettierrc`, `husky.config.js` |

---
## Milestone 1 – WhatsApp Connectivity (4 weeks)
| Objective | Key Results | Deliverables |
|-----------|-------------|--------------|
| Implement QR‑code session via WhatsApp Web | • User can scan QR and establish a WebSocket session.\n• Incoming messages are received and persisted. | `backend/services/whatsapp/`, UI component for QR scanning |
| Design core data model | • Prisma schema for Users, Tenants, Leads, Sessions, Messages. | `prisma/schema.prisma` |
| Basic campaign scheduler | • BullMQ job can schedule a message send at a future time. | `backend/services/scheduler/` |

---
## Milestone 2 – WhatsApp Session Management Dashboard (redefined 2026-07-09 — see DECISIONS.md ADR #52) — ✅ DONE
| Objective | Key Results | Deliverables |
|-----------|-------------|--------------|
| BFF layer for the Dashboard | • Tenant API key never reaches browser JS (httpOnly encrypted cookie only). • All `apps/api` calls proxied server-side. | `apps/dashboard/lib/{cookieCipher,dashboardSession,apiClient}.ts`, `pages/api/*` |
| Session list + detail UI | • Operator can see all sessions, connect/reconnect/disconnect/remove, view QR code, view recent history. | `apps/dashboard/pages/{index,sessions/[sessionName]}.tsx` |
| Near-real-time updates | • UI reflects status changes within ~2-3s without manual refresh (SSE-over-polling). | `apps/dashboard/lib/sse.ts`, `hooks/useEventSource.ts` |

> **Redefinition note**: this slot originally described "Core CRM & Campaigns" (Leads/Campaigns CRUD, campaign execution pipeline, basic analytics). That work was **never started** and is **not discarded** — it becomes an unscheduled backlog item, most likely resurfacing after Milestone 3 (an AI autoresponder makes more product sense before building mass-campaign tooling). What now occupies the M2 slot is the WhatsApp Session Management Dashboard, which was the milestone actually specified, approved, and delivered under that label during development. Canonical source for this decision: `CLAUDE.md` §11 and `DECISIONS.md` ADR #52 (Portuguese, per this project's official language — see `CLAUDE.md` header). This file is kept in English for internal consistency with the rest of its content, but `CLAUDE.md`/`DECISIONS.md`/`PROJECT_STATUS.md` are the actual source of truth if anything here drifts again.

---
## Milestone 3 – AI Autoresponder (5 weeks)
| Objective | Key Results | Deliverables |
|-----------|-------------|--------------|
| Integration with Claude API | • Secure wrapper service that sends conversation context and receives a reply. | `backend/services/ai/` |
| Template‑based prompts | • System prompts for greeting, follow‑up, qualification. | `shared/promptTemplates/` |
| Human‑in‑the‑loop escalation | • UI for agent to take over a conversation. | `frontend/components/AgentTransfer.tsx` |

> **Note (2026-07-09, see `DECISIONS.md` ADR #54)**: detailed planning found that the originally-assumed worker topology (a separate `apps/worker` process calling the WhatsApp connectivity layer directly to send replies) would open a second Baileys socket per session — the connectivity layer (`WhatsAppConnectionRegistry`) is in-memory and owned exclusively by `apps/api`. Resolved architecturally before any Milestone 3 code: the worker never touches WhatsApp connectivity; outbound sends are dispatched through a new BullMQ queue (`whatsapp-outbound`) consumed only inside `apps/api`. This reorganizes the internal block breakdown of `MILESTONE_003_AI_AUTORESPONDER.md` (Bloco 4 now covers both the `ai-reply` and `whatsapp-outbound` queues) but does not change this Milestone's scope, deliverables, or timeline at the Roadmap level.

---
## Milestone 4 – Product Analytics per Tenant (redefined 2026-07-16 — see DECISIONS.md ADR #59) — DONE (ADR #60)
| Objective | Key Results | Deliverables |
|-----------|-------------|--------------|
| Read-only analytics derived from existing tables (D51) | AI usage/cost/tokens/latency per day; message flow; conversations — per tenant, computed at query time; no rollups/cache/jobs. | `apps/api/src/services/analytics/`, additive index migration |
| Analytics REST + BFF | `GET .../analytics/{ai-usage,messages,conversations,session-stability}` behind API key; thin BFF proxies. | `analyticsRouter`, `pages/api/analytics/*` |
| Analytics UI + first component-test infra | `/analytics` page (recharts), exact-decimal cost display; first jsdom/Testing Library setup (isolated Jest project). | `pages/analytics.tsx`, `tests-jsdom/`, `jest.config.js` |

> **Redefinition note**: the original M4 slot ("Dashboard & Observability" — Prometheus/OpenTelemetry/Grafana) mixed product analytics with OPERATIONAL observability. Decision D35/D42 (2026-07-16): M4 is product analytics per tenant, derived from existing data (read-only, D51); operational observability (metrics/tracing/Grafana) becomes an unscheduled backlog item for a future milestone. Canonical source: `DECISIONS.md` ADRs #59/#60 (Portuguese, per project language policy).

-----------|-------------|--------------|
| Admin dashboard | • Real‑time view of campaigns, lead status, message flow. | `frontend/pages/dashboard/*` |
| Metrics & tracing | • Prometheus metrics exported; OpenTelemetry tracing enabled. | `backend/observability/` |
| Grafana dashboards (starter) | • Pre‑built dashboards for API latency, queue depth, AI usage. | `docs/diagrams/grafana-dashboard.png` |

---
## Milestone 5 – Multi‑tenant SaaS Foundations (6 weeks)
| Objective | Key Results | Deliverables |
|-----------|-------------|--------------|
| Tenant isolation in DB | • `tenantId` added to all tables, middleware enforces scope. | Updated Prisma schema & middleware |
| Auth service with JWT & refresh tokens | • Sign‑up, login, role‑based access control. | `backend/services/auth/` |
| Deployment via Docker Compose & Helm | • Local dev stack with Docker Compose.\n• Helm chart for Kubernetes production. | `docker-compose.yml`, `helm/whatsapp-automation/` |

---
## Milestone 6 – Production Readiness (4 weeks)
| Objective | Key Results | Deliverables |
|-----------|-------------|--------------|
| Automated end‑to‑end tests (Playwright) | • Full coverage of lead import → campaign → AI reply. | `tests/e2e/` |
| Security hardening audit | • OWASP Top 10 checklist signed off. | `SECURITY.md` updated |
| Documentation freeze | • All docs reviewed, versioned, linked from `README.md`. | Final docs under `docs/` |
| Release v1.0 | • Tag `v1.0.0`, Docker images pushed to registry. | Release artifacts |

---

**Note:** Each milestone includes a *definition of done* (DoD) consisting of passing tests, code review approval, documentation update, and CI pass. The roadmap is flexible; priorities may shift based on stakeholder feedback.

---
*Generated by Claude Code – your AI architect.*
- [x] Milestone 001 – Foundation (Dashboard, API health, Docker setup) completed
