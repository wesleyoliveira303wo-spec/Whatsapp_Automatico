---
name: architecture
description: Summary of the system's architectural decisions and rationale.
metadata:
  type: project
---

### Overview
- Clean Architecture with four concentric layers.
- Frontend: Next.js (React) + Tailwind + shadcn/ui.
- Backend: Express + Apollo GraphQL, TypeScript.
- Data: PostgreSQL with Prisma, Redis for cache & queue (BullMQ).
- AI: Claude API wrapper with prompt templates and caching.
- WhatsApp: Puppeteer QR login now, abstracted behind `IWhatsAppProvider`.
- Deployment: Docker Compose for dev, Helm/K8s for prod.

### Rationale
- Modularity enables independent scaling of services (e.g., AI workers).
- Type safety across stack reduces runtime bugs.
- RLS on PostgreSQL enforces tenant isolation.
- Clean boundaries simplify testing and refactoring.

### Impact
- All new code must respect layer boundaries and use dependency injection.
- Documentation (API_SPECIFICATION, ARCHITECTURE) must be kept in sync.

### How to consult
Reference this memory when evaluating new service designs, data models, or integration points.
