---
name: stack
description: Technical stack details and rationale.
metadata:
  type: project
---

### Languages
- TypeScript (strict mode) – unified language for frontend and backend.
- SQL (PostgreSQL) – relational data with strong consistency.

### Frontend
- Next.js (React) – SSR, API routes, file‑based routing.
- Tailwind CSS – utility‑first styling.
- shadcn/ui – base component library.

### Backend
- Node.js v20 with Express – lightweight HTTP server.
- Apollo Server (GraphQL) – flexible data fetching.
- Prisma – type‑safe ORM and migration tool.
- BullMQ + Redis – resilient background job queue.

### AI
- Claude API – primary LLM provider, wrapper service for prompts, caching, safety.

### DevOps
- Docker + Docker Compose – local development environment.
- Helm charts – production deployment on Kubernetes.
- GitHub Actions – CI/CD pipeline (lint, test, build, deploy).
- Prometheus + Grafana – monitoring and alerting.
- Snyk/Dependabot – dependency security.

### Rationale
- TypeScript provides end‑to‑end type safety.
- Next.js gives fast iteration and SEO capabilities.
- PostgreSQL with RLS ensures tenant data isolation.
- BullMQ gives reliable job handling with retries.
- Claude offers state‑of‑the‑art LLM capabilities and aligns with Anthropic ecosystem.

### Usage
Reference this memory when evaluating technology choices, onboarding new contributors, or updating stack components.
