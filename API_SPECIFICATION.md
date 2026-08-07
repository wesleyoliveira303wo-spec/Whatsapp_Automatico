# API Specification

The public API for the WhatsApp Automation Platform is defined using **OpenAPI 3.1**. This spec is the contract between the frontend, third‑party integrators, and the backend services. The file lives at the repository root for easy discovery.

---

## 1. Overview

- **Base URL**: `https://api.example.com/v1`
- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`). Tokens are short‑lived (15 minutes). Refresh token flow via `/auth/refresh`.
- **Content Types**: `application/json` for request/response bodies.
- **Error Model**: All error responses follow the schema `{ "error": string, "code": number, "details"?: any }`.

---

## 2. Security Schemes

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

All protected endpoints require `bearerAuth`.

---

## 3. Paths

### 3.1 Auth

| Method | Path            | Summary                                                     |
| ------ | --------------- | ----------------------------------------------------------- |
| `POST` | `/auth/login`   | Login with email/password, returns access & refresh tokens. |
| `POST` | `/auth/refresh` | Exchange refresh token for a new access token.              |
| `POST` | `/auth/logout`  | Invalidate refresh token.                                   |

### 3.2 Leads

| Method   | Path                                 | Summary                                                 |
| -------- | ------------------------------------ | ------------------------------------------------------- |
| `GET`    | `/tenants/{tenantId}/leads`          | List leads (supports pagination, filtering by status).  |
| `POST`   | `/tenants/{tenantId}/leads`          | Create a new lead (CSV import endpoint also available). |
| `GET`    | `/tenants/{tenantId}/leads/{leadId}` | Get lead details.                                       |
| `PATCH`  | `/tenants/{tenantId}/leads/{leadId}` | Update lead fields (status, notes).                     |
| `DELETE` | `/tenants/{tenantId}/leads/{leadId}` | Delete lead (GDPR right to be forgotten).               |

### 3.3 Campaigns

| Method   | Path                                             | Summary                                            |
| -------- | ------------------------------------------------ | -------------------------------------------------- |
| `GET`    | `/tenants/{tenantId}/campaigns`                  | List campaigns with status filter.                 |
| `POST`   | `/tenants/{tenantId}/campaigns`                  | Create a new campaign (select template, schedule). |
| `GET`    | `/tenants/{tenantId}/campaigns/{campaignId}`     | Retrieve campaign details.                         |
| `PATCH`  | `/tenants/{tenantId}/campaigns/{campaignId}`     | Update campaign (template, schedule, status).      |
| `POST`   | `/tenants/{tenantId}/campaigns/{campaignId}/run` | Manually trigger execution (for testing).          |
| `DELETE` | `/tenants/{tenantId}/campaigns/{campaignId}`     | Cancel and delete a campaign.                      |

### 3.4 Messages

| Method | Path                                                             | Summary                                       |
| ------ | ---------------------------------------------------------------- | --------------------------------------------- |
| `GET`  | `/tenants/{tenantId}/conversations/{conversationId}/messages`    | Paginated list of messages in a conversation. |
| `POST` | `/tenants/{tenantId}/conversations/{conversationId}/messages`    | Send a new outbound message (text only).      |
| `POST` | `/tenants/{tenantId}/conversations/{conversationId}/messages/ai` | Generate AI reply (calls Claude) and send it. |

### 3.5 WhatsApp Sessions

| Method   | Path                                   | Summary                                                   |
| -------- | -------------------------------------- | --------------------------------------------------------- |
| `GET`    | `/tenants/{tenantId}/whatsapp/session` | Retrieve current session status (QR code URL if pending). |
| `DELETE` | `/tenants/{tenantId}/whatsapp/session` | Terminate the session (forces re‑login).                  |

### 3.6 Analytics

| Method | Path                                   | Summary                                                                      |
| ------ | -------------------------------------- | ---------------------------------------------------------------------------- |
| `GET`  | `/tenants/{tenantId}/analytics/kpis`   | Return aggregated KPI JSON (conversion rate, messages sent, AI token usage). |
| `GET`  | `/tenants/{tenantId}/analytics/events` | List raw analytics events (supports time range filter).                      |

---

## 4. Schemas (selected)

```yaml
components:
  schemas:
    Lead:
      type: object
      required: [name, phone]
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        phone:
          type: string
          description: E.164 formatted phone number
        source:
          type: string
        status:
          type: string
          enum: [new, contacted, qualified, lost]
        createdAt:
          type: string
          format: date-time
        tenantId:
          type: string
          format: uuid
    Campaign:
      type: object
      required: [name, templateId]
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        templateId:
          type: string
          format: uuid
        schedule:
          type: string
          format: date-time
          nullable: true
        status:
          type: string
          enum: [draft, scheduled, running, completed, failed]
        ownerId:
          type: string
          format: uuid
        tenantId:
          type: string
          format: uuid
        createdAt:
          type: string
          format: date-time
    Message:
      type: object
      required: [direction, content]
      properties:
        id:
          type: string
          format: uuid
        conversationId:
          type: string
          format: uuid
        direction:
          type: string
          enum: [in, out]
        content:
          type: string
        sentAt:
          type: string
          format: date-time
        aiGenerated:
          type: boolean
        tenantId:
          type: string
          format: uuid
```

---

## 5. Pagination & Filtering Conventions

- **Query parameters**: `page` (1‑based), `size` (max 100), `sort` (field:asc|desc), `filter` (JSON string of field/value pairs).
- Example: `GET /tenants/123/leads?page=2&size=25&sort=createdAt:desc&filter={"status":"new"}`.

---

## 6. Versioning Policy

- **Major version** (`v1`, `v2`) only changes when breaking changes are introduced.
- **Minor/patch** updates are additive (new fields, endpoints) and are backward compatible.
- Deprecation headers (`Deprecation: true`) are sent for endpoints scheduled for removal at least 90 days in advance.

---

## 7. Documentation Generation

- The OpenAPI spec lives in `api/openapi.yaml`. The CI pipeline runs **swagger-cli** to validate and generates a static HTML viewer (`docs/api.html`).

---

_Generated by Claude Code – your AI architect for the WhatsApp Automation Platform._
