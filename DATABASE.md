# Database Design

This document defines the relational data model, indexing strategy, and migration approach for the **WhatsApp Automation Platform**. All schemas are managed with **Prisma** and stored in `prisma/schema.prisma`.

---

## 1. Core Entities
| Table | Columns (type) | Description |
|-------|----------------|-------------|
| **User** | `id UUID PK`, `name String`, `email String @unique`, `passwordHash String`, `role Enum('admin','manager','agent','viewer')`, `tenantId UUID FK`, `createdAt DateTime @default(now())` | System users with RBAC.
| **Tenant** | `id UUID PK`, `name String @unique`, `plan Enum('free','pro','enterprise')`, `createdAt DateTime @default(now())` | Logical isolation for SaaS customers.
| **WhatsAppSession** | `id UUID PK`, `qrCode String?`, `status Enum('pending','connected','disconnected')`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`, `tenantId UUID FK` | Stores QR code and connection state per tenant.
| **Lead** | `id UUID PK`, `name String`, `phone String @unique`, `source String?`, `status Enum('new','contacted','qualified','lost')`, `createdAt DateTime @default(now())`, `tenantId UUID FK` | Prospect leads imported from CSV/Excel.
| **Campaign** | `id UUID PK`, `name String`, `templateId UUID FK`, `schedule DateTime?`, `status Enum('draft','scheduled','running','completed','failed')`, `ownerId UUID FK (User)`, `tenantId UUID FK`, `createdAt DateTime @default(now())` | Campaign definition and state.
| **MessageTemplate** | `id UUID PK`, `name String`, `content String`, `variables Json`, `tenantId UUID FK`, `createdAt DateTime @default(now())` | Templates used by campaigns and AI.
| **Conversation** | `id UUID PK`, `leadId UUID FK`, `sessionId UUID FK (WhatsAppSession)`, `startedAt DateTime @default(now())`, `endedAt DateTime?`, `tenantId UUID FK` | One chat session with a lead.
| **Message** | `id UUID PK`, `conversationId UUID FK`, `direction Enum('in','out')`, `content String`, `sentAt DateTime @default(now())`, `aiGenerated Boolean`, `tenantId UUID FK` | Individual messages in a conversation.
| **AnalyticsEvent** | `id UUID PK`, `type String`, `payload Json`, `timestamp DateTime @default(now())`, `tenantId UUID FK` | Generic events for dashboards.
| **AuditLog** | `id UUID PK`, `userId UUID FK`, `action String`, `metadata Json?`, `timestamp DateTime @default(now())`, `tenantId UUID FK` | Security/audit trail.

---

## 2. Multi‑Tenant Strategy
- Every table includes a **foreign key `tenantId`**.
- **Row‑Level Security (RLS)** policies are defined in PostgreSQL to enforce isolation at the DB level (only rows matching `current_setting('myapp.tenant_id')` are visible).
- The application sets `myapp.tenant_id` for each request after authentication.

---

## 3. Indexing Strategy
| Table | Index | Columns |
|-------|-------|---------|
| `User` | PK, Unique | `id`, `email` |
| `Tenant` | PK, Unique | `id`, `name` |
| `WhatsAppSession` | Composite | `tenantId`, `status` |
| `Lead` | Composite | `tenantId`, `phone` (unique), `status` |
| `Campaign` | Composite | `tenantId`, `status`, `schedule` |
| `Message` | Composite | `conversationId`, `sentAt` |
| `AnalyticsEvent` | Composite | `tenantId`, `type`, `timestamp` |
| `AuditLog` | Composite | `tenantId`, `userId`, `timestamp` |

All indexes use **B‑tree** (default). Consider **GIN** indexes for JSONB columns (`payload`, `variables`) if query patterns emerge.

---

## 4. Data Protection
- Columns containing **PII** (`phone`, `content` of messages) are encrypted using **PostgreSQL `pgcrypto`** functions (`pgp_sym_encrypt`, `pgp_sym_decrypt`).
- The encryption key is stored in the secrets manager and injected at runtime via environment variable `PG_CRYPTO_KEY`.
- Application layer never stores plaintext PII outside of the database.

---

## 5. Migration Process (Prisma)
1. **Create migration**:
   ```bash
   npx prisma migrate dev --name <description>
   ```
2. **Review** generated SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`.
3. **Commit** migration files; CI runs `prisma migrate deploy` against the staging database.
4. **Rollout** to production via GitHub Actions workflow `db-migrate.yml` (requires manual approval).

---

## 6. Backup & Recovery
- **Automated daily snapshots** of the PostgreSQL volume via Cloud provider (AWS RDS automated backups). Retention: 7 days.
- **Point‑in‑time recovery** enabled for up to 35 days.
- **Manual export** script (`scripts/backup-db.sh`) for on‑demand dumps; stored encrypted in S3.

---

## 7. Sample Queries (Prisma Client)
```ts
// Fetch leads for a tenant with status "new"
const leads = await prisma.lead.findMany({
  where: { tenantId: tenantId, status: 'new' },
  select: { id: true, name: true, phone: true },
});

// Record an outgoing AI‑generated message
await prisma.message.create({
  data: {
    conversationId,
    direction: 'out',
    content: generatedText,
    aiGenerated: true,
    tenantId,
  },
});
```

---

## 8. Future Extensions
- **Sharding** by `tenantId` once tenant count exceeds 5,000.
- **Read replicas** for analytics workloads.
- **Full‑text search** on messages using PostgreSQL `tsvector` for keyword filtering.

---

*Generated by Claude Code – the AI architect for the WhatsApp Automation Platform.*