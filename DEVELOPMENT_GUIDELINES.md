# Development Guidelines

These guidelines describe **how** we work on the WhatsApp Automation Platform, from local setup to pull‑request workflow. They complement the high‑level processes in `CLAUDE.md` and the coding standards in `CODING_STANDARDS.md`.

---

## 1. Local Environment Setup
1. **Prerequisites**
   - Node.js **v20** (LTS) and npm **9**.
   - Docker Desktop (or Docker Engine) with Compose support.
   - pnpm (optional) – the repo scripts use npm.
   - Git (latest) – with `core.autocrlf=false` on Windows.
2. **Clone & Install**
   ```bash
   git clone <repo-url>
   cd Whatsapp-automatico
   npm ci   # installs exact versions from package-lock.json
   ```
3. **Environment variables**
   - Copy `.env.example` to `.env`.
   - Fill in required values (`DATABASE_URL`, `REDIS_URL`, `CLAUDE_API_KEY`).
4. **Start dependent services**
   ```bash
   docker compose up -d   # starts postgres & redis
   ```
5. **Run the app**
   ```bash
   npm run dev   # starts Next.js dev server (frontend) and API server
   ```
   - Frontend: http://localhost:3000
   - API: http://localhost:4000 (or via Next.js API routes)

---

## 2. Code Organization
- Follow the folder layout described in `ARCHITECTURE.md`.
- Keep **domain logic** in `src/backend/domain/`.
- **Infrastructure** (DB, queue, external APIs) lives under `src/backend/infra/`.
- Shared TypeScript types (`DTO`s, enums) are in `src/shared/types/`.
- UI components are under `src/frontend/components/`.
- Feature pages live in `src/frontend/pages/`.

---

## 3. Branching Model
| Branch | Purpose |
|--------|---------|
| `main` | Production‑ready state, protected, CI must pass. |
| `dev` | Integration branch; feature branches merge here after PR approval. |
| `feature/<name>` | Work on a new feature or improvement. |
| `bugfix/<name>` | Small bug fixes, often merged directly to `dev`. |
| `hotfix/<name>` | Emergency fix for production, branched from `main`. |

All branches must be created from `dev` (or `main` for hotfixes). Use **Conventional Commits** for commit messages (`feat:`, `fix:`, `docs:` etc.).

---

## 4. Pull Request Process
1. **Create a PR** targeting `dev` (or `main` for hotfixes).
2. **Title** must follow Conventional Commits format.
3. **Description** should include:
   - Summary of change.
   - Relevant `CLAUDE.md` sections (link with `#section-name`).
   - Checklist (see `/.claude/checklists/pr-template.md`).
4. **Run CI** – status must be *green* before review.
5. **Code Review** – at least one senior engineer approves, plus an automated `/code-review` run.
6. **Squash & merge** – a single commit is created on `dev` preserving the original messages in the PR description.
7. **Release** – when `dev` reaches the release milestone, a PR to `main` is opened, tagged, and deployed via GitHub Actions.

---

## 5. Testing Requirements
- **Unit tests**: Minimum 80% coverage (checked by `nyc` in CI).
- **Integration tests**: Use `supertest` against the Express server; run against an in‑memory SQLite DB (via Prisma) for speed.
- **E2E tests**: Playwright scenarios for the primary user flows (lead import → campaign → AI reply).
- **Performance tests**: Optional, use `k6` scripts for high‑load simulation before a major release.
- **Security tests**: Run OWASP ZAP scans on a staging deployment; failures block merging.

---

## 6. Linting & Formatting
- Run `npm run lint` before committing. The pre‑commit hook (Husky) runs `eslint --fix` automatically.
- `npm run format` applies Prettier; CI fails on unformatted files.

---

## 7. Dependency Management
- Use **npm** (lockfile) – never commit `node_modules`.
- **Dependabot** opens PRs for version upgrades; review and merge after passing CI.
- For major version upgrades, create an **upgrade branch**, run full integration tests, and update the `CHANGELOG.md`.

---

## 8. Secrets & Configuration
- Never store secrets in the repo. Use `.env` locally and **GitHub Secrets** for CI/CD.
- All secret accesses go through the `config/` module which validates presence via `zod-env`.
- Rotate API keys (Claude, Twilio, etc.) every 90 days; document rotation procedure in `SECURITY.md`.

---

## 9. Documentation Updates
- Any change that modifies a public API, data model, or architecture must be reflected in the appropriate markdown files (`API_SPECIFICATION.md`, `DATABASE.md`, `ARCHITECTURE.md`).
- The `README.md` should always contain a **Quick Start** section that works on a fresh clone.
- Use the `/docs` GitHub Action to validate internal links in markdown files.

---

## 10. Release Process
1. **Prepare release branch** from `dev` and bump version in `package.json` (semantic versioning).
2. Run **full test suite** (`npm run test:all`).
3. Generate **changelog** via `npm run changelog` (conventional‑commits parser).
4. Tag the commit (`git tag vX.Y.Z`) and push.
5. CI builds Docker images, pushes to the registry, and triggers Helm upgrade.
6. Post‑deployment smoke test (`/verify`) confirms health endpoints.

---

## 11. Communication & Knowledge Sharing
- Use the project **Slack channel** `#whatsapp-automation` for announcements, blockers, and design discussions.
- Record design decisions in `DECISIONS.md`; link from PRs when a decision is made.
- Weekly sync (30 min) to align on roadmap, blockers, and upcoming releases.

---

*Generated by Claude Code – your AI assistant for building robust, well‑documented software.*