# Security Architecture and Practices

This document consolidates the security posture of the **WhatsApp Automation Platform**. It aligns with the security section of `CLAUDE.md` and serves as the reference for developers, auditors, and compliance teams.

---

## 1. Threat Model Overview
| Asset | Threat | Mitigation |
|-------|--------|------------|
| **User credentials** | Credential theft (phishing, DB breach) | Bcrypt hashing (cost factor 12), rate limited login, 2FA optional. |
| **WhatsApp session tokens** | Session hijacking | Store tokens in encrypted Redis with short TTL; rotate on each reconnection. |
| **Personal data (phone numbers, messages)** | Data leakage, GDPR/CCPA violation | Column‑level encryption (pgcrypto), mask data in logs, consent flow recorded. |
| **LLM API key** | Unauthorized usage, cost overrun | Store in vault/K8s secret, rotate quarterly, monitor usage via analytics. |
| **API endpoints** | Injection, XSS, CSRF | Input validation (Zod), sanitization (DOMPurify), CSRF tokens for state‑changing ops. |
| **Queue / Worker** | Job spoofing, replay attacks | BullMQ jobs contain signed payload with HMAC, verified by workers. |
| **Infrastructure** | Unauthorized access to containers, cloud resources | IAM least privilege, VPC isolation, security groups, regular patching. |

---

## 2. Authentication & Authorization
- **JWT (RS256)** signed with a 4096‑bit RSA key stored in a vault.
- **Access token** lifespan: 15 minutes. **Refresh token** (HttpOnly, SameSite=Strict) with 30‑day expiry.
- **Role‑Based Access Control (RBAC)**
  - `admin` – full access, tenant management.
  - `manager` – can create campaigns, view analytics.
  - `agent` – can handle chats, view assigned leads.
  - `viewer` – read‑only dashboards.
- Authorization checks are performed in the **Auth Middleware**; every request receives `req.tenantId` and `req.user`.

---

## 3. Data Protection
### 3.1 At Rest
- **PostgreSQL**: `pgcrypto` encrypts `phone`, `message.content`, `lead.email` using AES‑256.
- **Redis**: TLS‑enabled (`rediss://`), optional at‑rest encryption via `redis-cli --tls`.
- **Backups**: Encrypted snapshots stored in AWS S3 with bucket policies limiting access.

### 3.2 In Transit
- All HTTP traffic uses **HTTPS** (TLS 1.3). Nginx terminates TLS and forwards to internal services via private network.
- **WebSocket** connections (`socket.io`) are upgraded over WSS.
- **gRPC** (future) will use mTLS.

---

## 4. Input Validation & Sanitization
- **Zod** schemas for every API request body, query, and params.
- **Frontend**: Form inputs validated with `react-hook-form` + Zod; sanitised before sending.
- **Server side**: Additional validation on received data; any deviation results in `400 Bad Request`.
- **HTML content** (templates, chatbot replies) is sanitized with **DOMPurify** before persistence or rendering.

---

## 5. Rate Limiting & DoS Protection
- **Global limit**: 100 requests per second per IP, enforced by `express-rate-limit`.
- **Tenant‑specific limit**: 2000 requests per minute per tenant to prevent abuse.
- **Queue back‑pressure**: BullMQ respects concurrency limits; jobs rejected with 429 when over capacity.

---

## 6. Secrets Management
- **Vault/Kubernetes Secrets** hold keys (`CLAUDE_API_KEY`, JWT private key, DB passwords).
- CI pipelines retrieve secrets via the GitHub Actions `secrets` context; never printed.
- Local development uses a `.env` file **not** committed (gitignore). `dotenv-safe` validates required keys.

---

## 7. Auditing & Logging
- **Audit log table** (`audit_logs`) records security‑relevant events: login, password change, token refresh, data export, admin actions.
- **Log format**: JSON with fields `{timestamp, level, requestId, tenantId, userId, action, metadata}`.
- **Log retention**: 90 days in Elasticsearch; older logs archived to S3 Glacier.
- **Alerting**: Excessive failed login attempts (>5 in 5 min) trigger a Slack alert.

---

## 8. Dependency & Patch Management
- **Dependabot** opens PRs for known vulnerabilities.
- **Snyk** runs on every PR; fail the CI if a high‑severity issue is detected.
- Critical base images (Docker) are pinned and scanned with **Trivy** before builds.

---

## 9. Secure Development Lifecycle (SDL)
1. **Design review** – security checklist completed (`/.claude/checklists/security-design.md`).
2. **Implementation** – follow `CODING_STANDARDS.md` (no `eval`, no dynamic imports). Use TypeScript strict mode.
3. **Static analysis** – ESLint rules (`no-eval`, `no-implied-eval`).
4. **Dynamic testing** – OWASP ZAP automated scan on every staging deployment.
5. **Pen‑test** – quarterly third‑party assessment; findings recorded in `DECISIONS.md`.
6. **Incident response** – run‑book located in `docs/operations/incident-response.md`.

---

## 10. Compliance
- **GDPR**: Right to be forgotten – API `DELETE /leads/:id` triggers hard delete and log entry.
- **CCPA**: Opt‑out flag stored per lead; data processors respect it.
- **PCI DSS** – Not in scope (no payment data). If future payment integration added, a separate compliance audit will be required.

---

## 11. Third‑Party Services
| Service | Data handled | Security notes |
|--------|--------------|----------------|
| **Claude API** | Prompt text, generated replies (may contain personal data) | TLS, API key stored secret, usage logged. |
| **WhatsApp Web** (Puppeteer) | Session cookies, messages | Cookies stored encrypted, session isolated per tenant. |
| **Cloud Provider** (AWS) | DB, Redis, S3 | IAM roles with least privilege, VPC isolation. |

---

## 12. Incident Reporting
- Report any security incident to `security@company.com` immediately.
- Follow the incident response run‑book: contain → assess → remediate → post‑mortem.
- All incidents must be logged in the internal ticketing system (Jira) with severity classification.

---

*Generated by Claude Code – your AI security architect for the WhatsApp Automation Platform.*