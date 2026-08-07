# Coding Standards

> ⚠️ **DOCUMENTO SUPERADO (scaffolding da Milestone 0) — NÃO é fonte de verdade.**
> Decisão D20 (ADR #58) e D41/ADR #59: gerado no scaffolding inicial e descreve convenções/ferramentas que divergem do código real (ex.: aliases `@backend/*`/`@frontend/*`, `AppError` genérico, Winston, prefixo `I` em interfaces). As convenções realmente vigentes estão em **`CLAUDE.md` §8 e no código de `apps/api`/`apps/dashboard`**; decisões arquiteturais em **`DECISIONS.md` (ADRs)**. Mantido apenas por histórico; não orientar decisões por ele.

This guide defines the style, conventions, and best practices for all code written in the **WhatsApp Automation Platform**. It is enforced by the linting configuration (`.eslintrc.js`) and code reviews.

---

## 1. General Principles

- **Readability first** – code should be easy to understand for a new teammate.
- **Consistency** – follow the rules below without exception.
- **Safety** – avoid patterns that can introduce security or reliability issues (e.g., eval, mutable globals).
- **Performance awareness** – prefer lazy evaluation, avoid unnecessary allocations in hot paths.

---

## 2. Language‑Specific Rules (TypeScript)

| Rule                                                                               | Description                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Strict mode**                                                                    | `compilerOptions.strict = true` in `tsconfig.json`.                                                                                             |
| **No `any`**                                                                       | Use explicit types or `unknown`. `any` is allowed only in legacy shim files with a comment explaining why.                                      |
| **Prefer `const`**                                                                 | Use `const` for immutable bindings; `let` only when the variable truly changes.                                                                 |
| **Prefer functional components**                                                   | React components must be written as function components; no class components.                                                                   |
| **Never use `// @ts-ignore`** unless an exhaustive justification comment is added. |
| **Immutability**                                                                   | Objects passed to functions should be treated as immutable – use spread/`Object.assign` to create copies.                                       |
| **Async/await**                                                                    | All asynchronous code must use `async/await`; `Promise.then` is allowed only for top‑level fire‑and‑forget where errors are explicitly handled. |

---

## 3. Naming Conventions

- **Files**: `kebab-case.ts` or `kebab-case.tsx`. One default export per file when representing a component or service.
- **Folders**: plural nouns (`services/`, `controllers/`). Nested domains use kebab case (`user-management/`).
- **Variables / Functions**: `camelCase`.
- **Classes / React Components**: `PascalCase`.
- **Enums / Types**: `PascalCase` for the enum name, `UPPER_SNAKE_CASE` for members.
- **Constants**: `UPPER_SNAKE_CASE`.
- **Interfaces**: Prefix with `I` only when there is a concrete class with the same name; otherwise use descriptive names (`UserDto`).

---

## 4. File Structure & Order

```text
src/
├─ backend/
│   ├─ api/            # Controllers / routes
│   ├─ services/      # Business logic (use‑cases)
│   ├─ domain/         # Entities, value objects, interfaces
│   └─ infra/         # DB, queue, external API adapters
├─ frontend/
│   ├─ pages/         # Next.js pages
│   ├─ components/    # UI components (shadcn/ui based)
│   ├─ hooks/         # React hooks
│   └─ utils/         # Client‑side helpers
└─ shared/
    ├─ types/         # DTOs shared between client & server
    └─ validation/   # Zod schemas
```

Each folder contains an `index.ts` that re‑exports public members.

---

## 5. Imports & Aliases

- Use **path aliases** defined in `tsconfig.json`:
  - `@backend/*` → `src/backend/*`
  - `@frontend/*` → `src/frontend/*`
  - `@shared/*` → `src/shared/*`
- Order imports:
  1. Third‑party modules (`react`, `lodash`, etc.)
  2. Internal aliases (`@backend/...`)
  3. Relative imports (`../utils`)
- Separate groups with a blank line.

---

## 6. Error Handling

- All errors are **instances of `AppError`** (custom class) with a numeric `statusCode` and optional `metadata`.
- Throw errors, do **not** return error objects.
- Central Express error‑handling middleware formats errors as JSON `{ error: string, code: number }`.
- Do not expose stack traces in production.

---

## 7. Logging

- Use the **Winston** logger (`logger.info`, `logger.warn`, `logger.error`).
- Include a `requestId` (generated by middleware) in every log entry.
- Do not log sensitive data (phone numbers, personal messages) – mask them (`+55****1234`).

---

## 8. Testing Conventions

- Test files live alongside the source file with the suffix `.test.ts` or in the `tests/` directory mirroring the structure.
- Use **describe/it** blocks with clear, deterministic names.
- Mock external services (WhatsApp, Claude) using **nock** or **jest.mock**.
- Aim for **unit coverage >= 80%**, integration coverage for critical paths.

---

## 9. Documentation in Code

- **JSDoc** comments only when the _why_ is non‑obvious. Keep them to one sentence.
- Exported functions/classes must have a short description comment.
- Use `/** @type {import('...').Type} */` for complex type assertions when needed.

---

## 10. Commit Guidelines

- Follow **Conventional Commits** (see `CHANGELOG.md` generation script).
- Include a short subject line (<72 characters) and optional body.
- No trailing whitespace; run `git diff --check` before committing.

---

_Generated by Claude Code – your AI‑assisted coding companion._
