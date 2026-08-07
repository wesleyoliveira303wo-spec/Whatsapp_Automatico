# Project Context

> ⚠️ **DOCUMENTO SUPERADO (scaffolding da Milestone 0) — NÃO é fonte de verdade.**
> Decisão D20 (ADR #58) e D41/ADR #59: gerado no scaffolding inicial, descreve premissas que divergem do sistema real (ex.: Puppeteer, JWT/RBAC, RLS no Postgres, métricas Prometheus). As fontes de verdade vigentes são: **`CLAUDE.md`, `DECISIONS.md` (ADRs), `PROJECT_STATUS.md`, `MILESTONE_003_AI_AUTORESPONDER.md`, `MILESTONE_004_ANALYTICS_LEVANTAMENTO.md` e o código em `apps/api`/`apps/dashboard`**. Mantido apenas por histórico; não orientar decisões por ele.

This document captures high‑level business and technical context that informs all decisions for the **WhatsApp Automation Platform**. It is intentionally concise; for deeper details see the corresponding sections in `CLAUDE.md` and the architecture diagrams.

---

## Business Drivers

| Driver                         | Description                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Lead generation efficiency** | Small/medium businesses need an automated way to prospect leads on WhatsApp without hiring a large sales team. |
| **Human‑in‑the‑loop**          | Automation must defer to a human agent when the conversation requires nuance or escalation.                    |
| **Scalable multi‑tenant SaaS** | The product must support many independent companies, each with isolated data and branding.                     |
| **AI‑enhanced interaction**    | Use Claude (or compatible LLM) to draft replies, qualify leads, and suggest next steps.                        |
| **Analytics & ROI**            | Provide real‑time metrics on campaign performance, conversion rates, and AI usage costs.                       |

---

## Stakeholders

| Role                          | Interests                                                              |
| ----------------------------- | ---------------------------------------------------------------------- |
| **Product Owner**             | Delivery timeline, market fit, revenue model.                          |
| **Engineering Lead (Claude)** | Clean architecture, testability, extensibility, security.              |
| **UX Designer**               | Consistent UI, accessibility, brand compliance.                        |
| **Sales / Customer Success**  | Ability to onboard new tenants quickly, minimal support load.          |
| **Compliance / Legal**        | Data privacy (GDPR/CCPA), secure storage of personal data, audit logs. |

---

## Constraints & Assumptions

- **Regulatory**: All personal data (phone numbers, messages) must be stored encrypted at rest.
- **WhatsApp API**: Initially rely on **WhatsApp Web** (QR login) because the Cloud API requires business verification. Future migration path is defined in the architecture.
- **Infrastructure**: Targeted for cloud‑native deployment on Kubernetes; local development uses Docker Compose.
- **Team Skillset**: Primarily JavaScript/TypeScript full‑stack engineers; occasional Go/Python for specialized services.
- **Budget**: Limited to free tier of cloud services for the MVP; costs must be monitored via the analytics service.

---

## Success Metrics (MVP)

| Metric                  | Target                                                        |
| ----------------------- | ------------------------------------------------------------- |
| **Lead conversion**     | ≥ 15% of contacted leads respond positively within 48h.       |
| **Automation coverage** | 70% of outbound messages generated automatically.             |
| **System uptime**       | 99.5% monthly availability (excluding scheduled maintenance). |
| **Response latency**    | API < 200 ms for standard CRUD operations.                    |
| **Security**            | Zero critical OWASP findings after a third‑party audit.       |

---

## Risk Register (Top 5)

| Risk                               | Impact                                        | Mitigation                                                       |
| ---------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| **WhatsApp Web stability**         | Service could be blocked by WhatsApp updates. | Design abstraction layer; plan migration to Cloud API.           |
| **LLM cost overruns**              | Excessive token usage could blow budget.      | Implement token caps and caching; monitor via analytics.         |
| **Data isolation leaks**           | Multi‑tenant data could be mixed.             | Enforce `tenantId` at DB and service layer, comprehensive tests. |
| **Regulatory non‑compliance**      | Fines, reputation loss.                       | End‑to‑end encryption, consent flow, audit logs.                 |
| **Scalability bottleneck (queue)** | High campaign volume could saturate BullMQ.   | Autoscaling workers, back‑pressure, rate‑limiting per tenant.    |

---

## Glossary

- **CRM** – Customer Relationship Management system.
- **LLM** – Large Language Model (Claude, GPT, Gemini, etc.).
- **BullMQ** – Queue library built on Redis for background jobs.
- **Tenant** – A logical grouping of data belonging to a single company.
- **Webhook** – HTTP callback used for inbound WhatsApp messages.

---

_Generated by Claude Code – the AI assistant for project scaffolding._
