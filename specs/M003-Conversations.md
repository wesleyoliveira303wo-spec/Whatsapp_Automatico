# Milestone 003 – Gerenciamento de Conversas (WhatsApp)

> ⚠️ **DOCUMENTO SUPERADO (scaffolding da Milestone 0) — NÃO é fonte de verdade.**
> Decisão D20 (ADR #58) e D41/ADR #59: esta spec descreve um domínio de conversas muito mais amplo do que o implementado (7 status, `Contact`/`Tag`/`Attachment`/`InternalNote`/`ConversationEvent`, webhooks, RLS) — corresponde ao **domínio legado congelado** (ADR #11), não ao que a Milestone 3 de fato entregou (`Conversation.status: 'bot'|'human'`, sem tags/anexos/webhooks). A fonte de verdade da Milestone 3 é **`MILESTONE_003_AI_AUTORESPONDER.md`, `DECISIONS.md` (ADRs #45–#58), `PROJECT_STATUS.md` e o código em `apps/api/src/services/conversations`**. Mantido apenas por histórico; não orientar decisões por ele.

---

## 🎯 Objetivo
Projetar o módulo central de **Conversa** que será a espinha dorsal da plataforma de automação WhatsApp. Todas as demais funcionalidades (Leads, IA, Campanhas, Analytics, UI) irão se basear nos dados e nos estados das conversas.

---

## ❓ Problema que resolve
- **Fragmentação de dados**: atualmente os eventos de mensagens, leads e IA são armazenados em tabelas distintas sem identidade única de conversa.
- **Visibilidade em tempo real**: o dashboard e a API não conseguem apresentar o histórico completo da interação com o contato.
- **Persistência e retomada**: sessões WhatsApp podem ser desconectadas; precisamos de um modelo que registre cada conversa para retomar a automação.
- **Escalabilidade**: sem um modelo de conversa, a lógica de IA e de campanhas não tem referência clara para aplicar regras de negócio.

---

## 👤 Fluxo do usuário
1. **Cliente abre a aplicação** (dashboard). 
2. **Seleciona uma conversa** ou a **lista de conversas** exibe as mais recentes. 
3. **Visualiza o histórico** de mensagens (texto, mídia, status). 
4. **Aciona ações** (marcar como resolvida, atribuir ao agente humano, disparar mensagem automática). 
5. **Recebe notificações** quando a conversa muda de estado (ex.: `awaiting_human`, `closed`). 
6. **Exporta ou cria relatórios** a partir das conversas filtradas por período, status ou tag.

---

## 🛠️ Fluxo técnico
1. **WhatsApp Provider** (Baileys) entrega eventos `messages.upsert`, `presence.update`, `chats.update`.
2. **Listener** no backend recebe o evento, identifica o **chatId** (número do telefone) e persiste ou atualiza a **Entidade Conversation**.
3. Cada mensagem recebida é transformada em **Message** vinculada à Conversation.
4. **Service Layer** (`ConversationService`) aplica regras de negócio (ex.: mudança de status, criação de Lead se não existir). 
5. **Event Bus** (Node EventEmitter ou broker como Redis Streams) dispara **Domain Events** (`ConversationCreated`, `MessageAdded`, `ConversationClosed`).
6. **Webhooks / SSE** enviam atualizações ao frontend (Dashboard) em tempo real.
7. **Persistência** via Prisma → PostgreSQL com tabelas `Conversation`, `Message`, `ConversationTag`.
8. **Scheduler** (BullMQ) pode agendar reenviamento de mensagens ou timeout de inatividade.

---

## 🏗️ Arquitetura
```
[WhatsApp Provider (Baileys)]
        │
        ▼
[Infrastructure Layer] – WhatsAppAdapter (listener) → emits domain events
        │
        ▼
[Application Layer] – ConversationService, MessageService
        │
        ▼
[Domain Layer] – Entidades Conversation, Message, Tag
        │
        ▼
[Infrastructure Layer – Persistence] – Prisma → PostgreSQL
        │
        ▼
[Presentation Layer] – Express Controllers ( /conversations/* )
        │
        ▼
[Frontend] – Next.js Dashboard (ConversationPage, MessageList, StatusCard)
```
- **Clean Architecture**: dependências fluem de fora para dentro; apenas a camada de aplicação conhece os casos de uso.
- **Event‑Driven**: eventos de domínio propagam mudanças para websockets/Webhooks e para a fila de jobs.

---

## 📦 Casos de uso
| ID | Nome | Descrição |
|----|------|-----------|
| CU‑C001 | Iniciar Conversa | Ao receber o primeiro `message.upsert` da API, cria uma nova entidade `Conversation` com status `open`. |
| CU‑C002 | Receber Mensagem | Persiste a mensagem vinculada à conversa; dispara evento `MessageAdded`. |
| CU‑C003 | Marcar Conversa como **Aguardando Agente** | Usuário do dashboard altera status → `awaiting_human`. |
| CU‑C004 | Encerrar Conversa | Usuário ou regra automática define status `closed`; dispara webhook de encerramento. |
| CU‑C005 | Recuperar Histórico | API `/conversations/:id` retorna conversa completa (mensagens, tags, status). |
| CU‑C006 | Listar Conversas | API `/conversations?status=open&tenantId=...` paginada, filtros por data, tag, agente. |
| CU‑C007 | Anexar Tag a Conversa | Permite categorizar (ex.: `lead`, `support`, `promo`). |
| CU‑C008 | Notificar Mudança de Estado | Webhook `/webhooks/conversation` enviado a sistemas externos (CRM, IA). |

---

## ⚠️ Casos de erro
| Código | Situação | Resposta | Ação corretiva |
|--------|----------|----------|----------------|
| 400 | `conversationId` não encontrado | `{ error: "Conversation not found" }` | Verificar ID ou criar nova conversa. |
| 409 | Conflito ao criar conversa já existente (mesmo número, status `open`) | `{ error: "Conversation already open" }` | Ignorar ou atualizar. |
| 422 | Payload de mensagem inválido (campo faltando) | `{ error: "Invalid message payload" }` | Corrigir payload. |
| 500 | Falha ao gravar no banco (ex.: deadlock) | `{ error: "Database error" }` | Retry com back‑off, monitorar. |
| 503 | Provider Baileys offline | `{ error: "WhatsApp provider unavailable" }` | Reencaminhar para fallback (fila de retry). |

---

## 📊 Fluxograma
```
Start → WhatsApp Provider emits event → Adapter receives →
   Is conversation existing? ──► Yes ──► Update Conversation (add Message) → Emit MessageAdded → Notify Frontend
   │                                 │
   No                               └─► Create Conversation → Emit ConversationCreated → Notify Frontend
```
*(Representado em BPMN / Mermaid em docs/diagrams/ConversationFlow.mmd)*

---

## 🗂️ Entidades
```ts
interface Contact {
  id: string;               // UUID
  tenantId: string;         // para multi‑tenant
  phoneNumber: string;      // número WhatsApp (E.164) – único por tenant
  name?: string;            // opcional, preenchido via integração ou lead
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Conversation {
  id: string;               // UUID
  tenantId: string;         // para multi‑tenant
  contactId: string;         // FK → Contact
  status: ConversationStatus;
  tags: string[];          // ex.: ['lead','support']
  createdAt: Date;
  updatedAt: Date;
  openedAt?: Date;
  closedAt?: Date;
  assignedTo?: string;      // userId do agente responsável
}

enum ConversationStatus {
  NEW = "new",
  ACTIVE = "active",
  WAITING_CUSTOMER = "waiting_customer",
  WAITING_AGENT = "waiting_agent",
  RESOLVED = "resolved",
  ARCHIVED = "archived",
  SPAM = "spam"
}

interface Message {
  id: string;               // UUID
  conversationId: string;    // FK → Conversation
  direction: 'in' | 'out'; // inbound/outbound
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'system' | 'location' | 'contact';
  content: string;           // texto ou URL de mídia
  mediaUrl?: string;        // opcional para mídias
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  attachments?: Attachment[]; // optional list of attachments
}

interface Attachment {
  id: string;               // UUID
  messageId: string;         // FK → Message
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact';
  url: string;               // localização segura (S3, CDN)
  mimeType: string;         // ex.: image/jpeg
  sizeBytes: number;
  metadata?: Record<string, any>; // ex.: dimensions, duration
}

interface InternalNote {
  id: string;               // UUID
  conversationId: string;    // FK → Conversation
  authorId: string;          // user ID
  content: string;           // texto livre
  createdAt: Date;
}


interface Message {
  id: string;               // UUID
  conversationId: string;    // FK → Conversation
  direction: 'in' | 'out'; // inbound/outbound
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'system';
  content: string;           // texto ou URL de mídia
  mediaUrl?: string;        // opcional para mídias
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read' | 'failed';
}
```

---

## 🔗 Relacionamentos
- **Conversation 1‑N Message** (uma conversa tem várias mensagens). 
- **Conversation N‑N Tag** (via tabela `ConversationTag`). 
- **Conversation 1‑1 Tenant** (via `tenantId`).

---

## 🌐 APIs
| Método | Endpoint | Descrição | Request Body | Response |
|--------|----------|-----------|--------------|----------|
| `POST` | `/conversations` | Cria conversa (caso uso externo). | `{ phoneNumber, tags? }` | `{ id, status, createdAt }` |
| `GET` | `/conversations/:id` | Obtém detalhes + mensagens. | – | `{ conversation, messages[] }` |
| `GET` | `/conversations` | Lista conversas (paginado, filtros). | query params `status`, `tag`, `page`, `size` | `{ data[], meta }` |
| `PATCH` | `/conversations/:id/status` | Altera status da conversa. | `{ status }` | `{ id, status, updatedAt }` |
| `POST` | `/conversations/:id/messages` | Envia mensagem (via provider). | `{ type, content, mediaUrl? }` | `{ messageId, status }` |
| `GET` | `/conversations/:id/tags` | Lista tags. | – | `{ tags[] }` |
| `POST` | `/conversations/:id/tags` | Adiciona tag. | `{ tag }` | `{ tags[] }` |
| `DELETE` | `/conversations/:id/tags/:tag` | Remove tag. | – | `{ tags[] }` |

---

## 📣 Eventos (Domain Events)
- `ConversationCreated` – payload `{ conversationId, phoneNumber, tenantId }`
- `MessageAdded` – payload `{ messageId, conversationId, direction, type }`
- `ConversationStatusChanged` – payload `{ conversationId, oldStatus, newStatus }`
- `ConversationClosed` – payload `{ conversationId, closedAt }`
- `ConversationTagAdded` / `ConversationTagRemoved`

---

## 🔔 Webhooks
- **/webhooks/conversation** (POST) – disparado para clientes externos (CRM, IA) ao mudar status ou ao receber nova mensagem.
- **/webhooks/message** – notifica quando mensagem chega ou é entregue.
- Payload segue padrão `{ event, data, timestamp }`.

---

## 💾 Banco de Dados (Prisma schema – resumo)
```prisma
model Conversation {
  id           String   @id @default(uuid())
  tenantId     String
  phoneNumber  String
  status       ConversationStatus @default(OPEN)
  tags         ConversationTag[]
  messages     Message[]
  openedAt     DateTime?
  closedAt     DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

enum ConversationStatus { OPEN AWAITING_HUMAN CLOSED PENDING }

model Message {
  id             String   @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  direction      MessageDirection
  type           MessageType
  content        String
  mediaUrl       String?
  timestamp      DateTime @default(now())
  status         MessageStatus @default(SENT)
}

enum MessageDirection { IN OUT }
enum MessageType { TEXT IMAGE VIDEO AUDIO DOCUMENT STICKER SYSTEM }
enum MessageStatus { SENT DELIVERED READ FAILED }

model ConversationTag {
  id             String @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  tag            String
}
```

---

## 📈 Estados da Conversa
| Estado | Significado |
|--------|-------------|
| `open` | Conversa iniciada, ainda não resolvida. |
| `awaiting_human` | Mensagem enviada ao bot, aguardando intervenção humana. |
| `pending` | Aguardando resposta do cliente (ex.: após disparo de campanha). |
| `closed` | Conversa finalizada, não receberá mais mensagens automatizadas. |

---

## 📩 Estados das Mensagens
| Estado | Quando ocorre |
|--------|----------------|
| `sent` | Mensagem enviada ao WhatsApp (API aceita). |
| `delivered` | Confirmação de entrega ao dispositivo. |
| `read` | Usuário leu a mensagem. |
| `failed` | Erro de envio (ex.: número bloqueado). |

---

## 📜 Regras de Negócio
1. **Criar conversa única por número** – se já existir conversa `open` ou `awaiting_human`, novas mensagens são associadas a ela.
2. **Transição de status** – só pode passar `open → awaiting_human → closed` ou `open → closed`. Não permite retrocesso (`closed → open`).
3. **Persistência de mídia** – URLs de mídia são armazenadas em `mediaUrl` e devem ser criptografadas em repouso.
4. **Tag automática** – ao criar conversa, se o número não existir em `Lead`, adiciona tag `prospect`. Se houver lead existente, adiciona `lead`. 
5. **Limite de retenção** – mensagens são mantidas 90 dias; após isso, são arquivadas (soft‑delete). 
6. **Multi‑tenant isolation** – todas as consultas filtram por `tenantId`; RLS no PostgreSQL impede cross‑tenant.
7. **Auditoria** – cada mudança de status gera registro em tabela `ConversationAudit` (não detalhada aqui). 

---

## ✅ Critérios de Aceite
- **API** deve expor todos os endpoints descritos acima, obedecendo aos contratos (JSON, códigos HTTP corretos). 
- **Banco**: tabela `Conversation` com índices em `tenantId`, `phoneNumber`, `status`. 
- **Eventos**: cada mudança de status em `Conversation` dispara evento `ConversationStatusChanged`. 
- **Webhooks**: enviados de forma assíncrona, com tentativa de retry (exponential back‑off) caso falhem. 
- **Performance**: leitura de conversa + últimas 100 mensagens deve responder < 200 ms em carga normal (≤ 10 000 conversas simultâneas). 
- **Segurança**: dados sensíveis (número, conteúdo de mídia) são armazenados criptografados; acesso via API restrito a usuários autenticados (JWT). 
- **Testes**: cobertura mínima 80 % (unit + integration) incluindo fluxos de criação, mensagem recebida, mudança de status, webhook disparado. 
- **Documentação**: OpenAPI spec atualizada, exemplos de payloads, diagramas (Mermaid) incluídos em `docs/`. 

---

## 🧪 Plano de Testes
1. **Unitários** – testes de `ConversationService` (criar, atualizar status, adicionar tags). 
2. **Integration** – teste end‑to‑end usando Supertest contra `/conversations` + banco de teste (SQLite em memória). 
3. **E2E** – simulação de eventos Baileys (mock) para garantir que `MessageAdded` cria conversa quando necessário. 
4. **Performance** – benchmark de listagem paginada (Jest + autocannon). 
5. **Segurança** – testes de autorização (acesso a outra tenant deve retornar 403). 
6. **Webhooks** – mock server que verifica payload e retry logic.

---

## 📈 Estratégia de Escalabilidade
- **Shard por tenant**: opcional futuro, mas atualmente índices `tenantId` + RLS garantem isolamento.
- **Read replica**: consultas de leitura (listagem de conversas) podem ser direcionadas a réplicas.
- **Cache**: última mensagem de cada conversa armazenada em Redis (TTL 5 min) para UI em tempo real.
- **Fila de eventos**: eventos de domínio publicados no Redis Streams → consumidores (analytics, IA) escalam independentemente.
- **Horizontal scaling**: API stateless, pode ser replicada atrás de um load balancer.

---

## 🌐 Estratégia Multi‑tenant
- **TenantId** presente em todas as tabelas (`Conversation`, `Message`, `ConversationTag`).
- **Row‑Level Security (RLS)** no PostgreSQL limita consultas ao `tenantId` do usuário JWT.
- **Banco compartilhado** com isolamento via RLS; migração futura para bases separadas por tenant se necessário.
- **Limite de recursos**: quotas por tenant (número máximo de conversas ativas) configuráveis.

---

## 🔐 Segurança
- **Criptografia at‑rest**: campos `phoneNumber`, `content`, `mediaUrl` são criptografados usando `pgcrypto` (chave gerenciada por Vault). 
- **Autenticação**: todas as rotas exigem JWT assinado por RSA‑256; claims incluem `tenantId` e `role`. 
- **Autorização**: políticas de RBAC (ex.: `admin` pode fechar conversas, `agent` pode apenas ler). 
- **Rate limiting**: middleware `express-rate-limit` restringe chamadas a 100/s por IP.
- **Validations**: uso de Zod para validar payloads de mensagem e status. 
- **Audit logs**: alterações de status são registradas em `ConversationAudit` (não detalhada aqui). 

---

## 🚫 Fora do Escopo
- Implementação de IA (chatbot) sobre mensagens.
- Envio massivo de mensagens (campaign). 
- Integração com CRM externo (exceto via webhook). 
- UI avançada de filtros complexos (fora do MVP). 
- Suporte a múltiplas contas WhatsApp simultâneas (poderá ser adicionado em Milestone 004). 

---

## 📦 Dependências
- **Backend**: Express, Prisma, Baileys, Zod, EventEmitter / BullMQ, jsonwebtoken. 
- **Banco**: PostgreSQL com pgcrypto. 
- **Cache**: Redis (para sessões WhatsApp e cache de última mensagem). 
- **Infra**: Docker, Docker‑Compose. 
- **Testes**: Jest, Supertest, ts‑jest. 
- **Docs**: Swagger/OpenAPI, Mermaid (para diagramas). 

---

## ✅ Checklist Final
- [ ] Objetivo definido ✅
- [ ] Problema que resolve descrito ✅
- [ ] Fluxo do usuário mapeado ✅
- [ ] Fluxo técnico detalhado ✅
- [ ] Arquitetura (camadas, eventos) especificada ✅
- [ ] Casos de uso listados ✅
- [ ] Casos de erro documentados ✅
- [ ] Fluxograma (texto) incluído ✅
- [ ] Entidades e relacionamentos modelados ✅
- [ ] APIs definidas (endpoints, payloads) ✅
- [ ] Eventos de domínio enumerados ✅
- [ ] Webhooks especificados ✅
- [ ] Modelo de banco (Prisma) descrito ✅
- [ ] Estados da conversa e das mensagens definidos ✅
- [ ] Regras de negócio claras ✅
- [ ] Critérios de aceite estabelecidos ✅
- [ ] Plano de testes criado ✅
- [ ] Estratégia de escalabilidade planejada ✅
- [ ] Estratégia multi‑tenant abordada ✅
- [ ] Segurança detalhada ✅
- [ ] Escopo excluído listado ✅
- [ ] Dependências identificadas ✅
- [ ] Checklist final concluído ✅

---

*Este documento será o guia para a implementação da Milestone 003 e servirá como fonte de verdade para desenvolvedores, QA e stakeholders.*

# Architecture Review

---

# Application Review

## Lista definitiva de casos de uso
### Conversation
- CreateConversation
- GetConversation
- ListConversations
- SearchConversations
- ArchiveConversation
- CloseConversation
- ChangeConversationStatus
- AssignConversation

### Message
- AddMessage
- UpdateMessageStatus
- DeleteMessage (optional, if business requires)

### Attachment
- AddAttachment
- RemoveAttachment

### Tag
- AddTag
- RemoveTag
- ListTags

### Notes
- AddInternalNote
- ListInternalNotes

### Timeline
- GetConversationTimeline

## Análise de necessidade
- Todos os casos de uso acima atendem aos requisitos da Milestone 003 (gerenciamento completo de conversas, mensagens, tags, notas e timeline).  
- **DeleteMessage** pode ser adiado, pois a regra de retenção de 90 dias já cobre exclusão lógica; somente será implementado se houver demanda de “hard delete”.
- **SearchConversations** pode ser implementado como extensão do ListConversations usando filtros avançados; pode ser adiado para a fase 2 se o escopo de busca simples for suficiente.

## Ordem sugerida de implementação
**Fase 1** – base funcional
1. CreateConversation
2. GetConversation
3. ListConversations
4. AddMessage
5. UpdateMessageStatus
6. ChangeConversationStatus
7. AssignConversation

**Fase 2** – enriquecimento
8. AddTag / RemoveTag / ListTags
9. AddInternalNote / ListInternalNotes
10. AddAttachment / RemoveAttachment

**Fase 3** – recursos avançados
11. SearchConversations (filtros avançados)
12. ArchiveConversation / CloseConversation (status específicos)
13. GetConversationTimeline

## Estrutura padrão para cada caso de uso
```
application/
  <UseCaseName>/
    <UseCaseName>UseCase.ts          // orquestração
    <UseCaseName>Input.ts            // DTO de entrada
    <UseCaseName>Output.ts           // DTO de saída
    <UseCaseName>.test.ts            // testes unitários (mocks de repositórios)
```
- Cada pasta deve conter **exatamente** esses quatro arquivos.
- Nenhum caso de uso pode depender de outro caso de uso.
- Todas as dependências são: **Domain entities / enums** e **Repository interfaces**.

## DTO padrão
```ts
export interface <UseCase>Input {
  // primitives only, ids are strings (UUID), dates are ISO strings if coming from outer layers
  // optional fields are marked with ?
}

export interface <UseCase>Output {
  // plain data needed by the caller – usually ids, status, timestamps, or domain‑specific payloads
}
```
- Utilizar tipos primitivos (string, number, boolean, Date) – nunca expor entidades de domínio nos DTOs.
- Quando houver enum, usar o enum exportado do domínio (ex.: `ConversationStatus`).

## Exceções padrão (camada de aplicação)
| Nome | Quando lançado |
|------|----------------|
| `ConversationNotFoundError` | Ao buscar uma conversa que não existe. |
| `InvalidConversationStateError` | Transição de status proibida (ex.: CLOSED → ACTIVE). |
| `TagAlreadyExistsError` | Ao tentar associar uma tag já presente na conversa. |
| `TagNotFoundError` | Ao remover uma tag que não está associada. |
| `AssignmentNotAllowedError` | Quando o agente não tem permissão ou a conversa já está atribuída a outro. |
| `MessageNotFoundError` | Busca de mensagem inexistente. |
| `AttachmentNotFoundError` | Busca de anexo inexistente. |
| `InternalNoteNotFoundError` | Busca de nota inexistente. |
- Todas herdam de `Error` e definem `name` correspondente.  Não usar `Error` genérico.

## Dependências permitidas
- **Domain**: entidades, enums, value‑objects.
- **Repository interfaces** do domínio (`ConversationRepository`, `MessageRepository`, `AttachmentRepository`, `TagRepository`, `ContactRepository`).
- **Application errors** (ex.: `ConversationNotFoundError`).
- **Utilitários internos** (ex.: geradores de UUID) **apenas** se forem puramente funcionais e não introduzirem dependência de infra.

## Itens adiados para futuras milestones
- **CQRS / Event‑Sourcing** completo – não necessário para o MVP de gerenciamento de conversas.
- **Hard delete de mensagens** – a política de retenção deixa as mensagens como soft‑delete.
- **SearchConversations** com motor de busca dedicado (Elastic/Typesense) – será introduzido quando o volume ultrapassar dezenas de milhões.
- **Channel abstraction** – já prevista na camada de domínio, mas sua aplicação será tratada nas próximas milestones de multi‑canal.
- **Workflow orchestration** (sagas) – futuro quando integração com IA e campanhas avançar.

## Checklist final da camada Application
- [ ] Lista completa de casos de uso definida e categorizada.
- [ ] Ordem de implementação planejada em fases.
- [ ] Estrutura de pastas padronizada (UseCase, Input, Output, test).
- [ ] DTOs seguem padrão único e usam apenas tipos primitivos.
- [ ] Exceções específicas criadas e nomeadas conforme convenção.
- [ ] Nenhum caso de uso depende de outro caso de uso.
- [ ] Todas as dependências limitadas ao domínio e interfaces de repositório.
- [ ] Itens que podem ser adiados estão claramente marcados.

---


---

# Domain Review

## 1. Entidades faltando
- **Channel (CommunicationChannel)**
  - *Por quê?*  Permite abstrair diferentes provedores (WhatsApp, Instagram, Messenger, Email etc.) sem espalhar `provider` logic nas entidades de domínio.  Faz parte da camada de **Domínio/Infraestrutura** como um **Value Object** ou **Entidade de Configuração** que mapeia `tenantId` + `channelType` → credenciais.
  - *Camada*: **Domain (Value Object/Entity) + Infrastructure (Adapter)**.
  - *Quando criar?*  Pode ser adiado para a milestone 004, pois o módulo de conversa ainda depende apenas de um único provedor, mas a presença de um esqueleto (`Channel` com `type` e `config` JSON) evita refatoração massiva futura.
- **Lead**
  - *Por quê?*  A ligação entre `Conversation` e `Contact` evoluirá para `Lead` quando houver qualificação.  Definir um **Lead** agora como **Aggregate Root** permite que a futura lógica de scoring e pipeline se ancore nele.
  - *Camada*: **Domain** (agregado).  Pode ser adicionado como **placeholder** (`status`, `source`) agora, mas sua implementação completa pode ser adiada para a milestone 005 (CRM).  No momento, incluímos apenas a referência opcional `leadId` dentro de `Conversation` no modelo Prisma.

## 2. Entidades desnecessárias
Nenhuma das entidades introduzidas (Contact, Attachment, InternalNote, ConversationEvent, Tag/ConversationTag/ContactTag) foi considerada superflua. Cada uma tem responsabilidade clara e prepara o sistema para indexação, auditoria e extensibilidade.

## 3. Aggregate Roots, Entities e Value Objects
- **Aggregate Roots**
  - `Contact` – raiz do domínio de pessoa/empresa; controla `phoneNumber`, `name`, `email`.
  - `Conversation` – raiz que agrupa `Message`, `Attachment`, `InternalNote`, `ConversationEvent` e referências a `Contact`/`Lead`.
  - `Tag` – raiz de taxonomia reutilizável.
- **Entities** (com identidade própria)
  - `Message`, `Attachment`, `InternalNote`, `ConversationEvent` (cada um tem UUID).
- **Value Objects**
  - `PhoneNumber` (E.164 string, validação separada).
  - `Channel` (type + config) – imutável após criação.

## 4. Responsabilidades (SRP)
- **Contact**: gerencia apenas dados de identificação do contato.
- **Conversation**: orquestra o ciclo de vida da conversa, mantém estado e relacionamentos.
- **Message**: representa um único registro de mensagem; seu status e metadados permanecem aqui.
- **Attachment**: armazena metadados de mídia, nada mais.
- **InternalNote**: nota interna de operador.
- **Tag/ConversationTag/ContactTag**: classificação/tagging.
- **ConversationEvent**: registro imutável de fatos – não contém lógica de negócio.
Nenhuma violação de SRP foi encontrada.

## 5. Relacionamentos
- `Contact 1‑N Conversation` – um contato pode ter várias conversas ao longo do tempo.
- `Conversation 1‑N Message`.
- `Message 1‑N Attachment` – permite múltiplas mídias por mensagem.
- `Conversation 1‑N InternalNote`.
- `Conversation 1‑N ConversationEvent`.
- `Conversation N‑N Tag` via `ConversationTag` (e similar para `Contact`).
- `Conversation 0‑1 Lead` (opcional) – futuro pipeline de CRM.
Todas as cardinalidades são corretas; chaves‑estrangeiras são opcionais onde necessário, evitando *cascading deletes* problemáticos.

## 6. Multi‑tenant
- Todos os agregados (`Contact`, `Conversation`, `Message`, `Attachment`, `Tag`, `ConversationEvent`) contêm `tenantId`.
- Índices compostos (`tenantId`, `phoneNumber`, `status`) já definidos.
- Não há dependência direta entre agregados de diferentes tenants; políticas RLS da camada de infraestrutura garantem isolamento.
- **Risco**: índice único global em `phoneNumber` poderia colidir entre tenants. Resolvemos usando índice composto (`tenantId`, `phoneNumber`).

## 7. Preparação para IA
- `ConversationEvent` permite replay de toda a história para treinamento de modelos.
- Enum de status (NEW, ACTIVE, WAITING_CUSTOMER, WAITING_AGENT, RESOLVED, ARCHIVED, SPAM) fornece sinais claros para classificadores.
- Metadados de `Attachment` (mime, size, dimensions) podem ser usados para extração de conteúdo (OCR, speech‑to‑text) antes do RAG.
- `assignedTo` e `Tags` facilitam roteamento a agentes ou modelos especializados.
- `ConversationEngine` consumirá esses eventos para acionar classificadores, gerar resumos e armazenar embeddings.

## 8. Preparação para CRM
- `Contact` → base para **Lead** e **Customer**; atributos adicionais (score, source) podem ser adicionados sem alterar a estrutura da conversa.
- `Conversation` possui `leadId` opcional, permitindo vincular conversas já qualificadas.
- **Tags** e **Status** suportam funil de vendas (ex.: tag `pipeline:qualified`).
- `InternalNote` e `Assignment` preparam a futura *task/agenda* (nota pode ser convertida em tarefa).
- `User` (já existente no DB) será usado para autoria de notas e atribuição.

## 9. Preparação para novos canais
- Introduzimos **Channel** como entidade opcional (ver ponto 1). A `Conversation` poderia, no futuro, referenciar `channelId` ao invés de assumir que o número vem do WhatsApp.
- Estrutura de `Message.type` já inclui valores genéricos (`system`), facilitando a extensão para outros tipos de mídia ou canais.
- A separação de `Contact` garante que o mesmo contato possa ter múltiplas conversas em canais diferentes.

## 10. Escalabilidade
- **Índices** adequados para buscas por `tenantId`, `status`, `createdAt` e `phoneNumber`.
- **Event Bus** baseado em Redis Streams permite partição por `tenantId`.
- **Cache** de última mensagem (Redis) já definido.
- **Potential bottlenecks**:
  - *Attachment storage*: grande volume de mídia pode sobrecarregar o bucket; recomenda‑se lifecycle policies e limpeza automática.
  - *ConversationEvent* volume: para milhões de mensagens, pode ser necessário *partitioning* ou retenção de eventos (arquivamento antigo).
  - *Full‑text search*: requer GIN index e pode precisar de serviço dedicado (Elastic, Typesense) quando a escala ultrapassar dezenas de milhões.

## 11. Event‑Driven
- **Eventos recomendados** (já presentes): `ConversationCreated`, `MessageAdded`, `MessageStatusUpdated`, `ConversationStatusChanged`, `ConversationClosed`, `TagAdded/Removed`, `InternalNoteAdded`, `AssignmentChanged`, `AttachmentAdded`.
- **Eventos internos** (não publicados): mudanças de timestamps internos, cálculo de métricas de performance – podem permanecer dentro do engine.
- Evitamos gerar eventos para *read‑only* queries; somente mutações de domínio.

## 12. CQRS
- No momento o volume de escrita/leitura não justifica a complexidade de um **CQRS** completo. O modelo atual (Prisma + read replicas) já permite separação de preocupações simples. Poderemos introduzir CQRS quando houver necessidade de *eventual consistency* entre um *write* store e um *search* store (ex.: Elastic) – adiado para etapas posteriores.

## 13. Event Sourcing
- Embora a `ConversationEvent` forneça uma linha do tempo, o modelo ainda persiste o estado atual na tabela `Conversation`. Isso reduz a complexidade de reconstrução e simplifica consultas. **Event Sourcing puro** pode ser considerado apenas se houver requisitos de *audit compliance* extremamente rígidos ou necessidade de *time‑travel* avançado – adiado.

## 14. Simplicidade
- Mantivemos a modelagem enxuta: apenas entidades necessárias para o domínio de conversa foram adicionadas.
- Evitamos *micro‑modelos* redundantes (ex.: `MessageAttachmentLink` separado) – tudo está encapsulado em `Attachment`.
- As enumerações de status são expressivas porém ainda limitadas a 7 valores, suficiente para o MVP.

---

### Melhorias aplicadas ao spec
- Substituição de `phoneNumber` por `contactId` em `Conversation`.
- Criação da entidade `Contact` e enum `ConversationStatus` completa.
- Modelagem completa de `Attachment`, `InternalNote`, `ConversationEvent` e sistema de Tags.
- Inclusão de campo `assignedTo` e `ConversationEvent` para auditoria.
- Atualização de regras de negócio e fluxo de estados.

### Decisões mantidas
- Estrutura de eventos já existente foi mantida e ampliada.
- Uso de `ConversationTag` e `ContactTag` para classificação continuou.
- Estratégia de busca baseada em índices e full‑text permanece.

### Decisões adiadas
- Implementação da entidade **Channel** (abstração de provedores) – adicionada como placeholder futuro.
- **Lead** como agregado completo – referenciado, mas será detalhado na milestone 005.
- **CQRS / Event Sourcing** completos – mantidos como evoluções futuras.

### Riscos identificados
- Volume de `ConversationEvent` pode crescer exponencialmente; monitorar e planejar arquivamento.
- Indexação de `metadata` (JSONB) pode exigir GIN indexes quando consultas avançadas surgirem.
- Dependência de armazenamento de mídia externa – garantir políticas de retenção e segurança.

### Recomendações futuras
1. **Implementar `Channel`** antes de suportar novos provedores de mensagens.
2. **Planejar sharding/partição** de tabelas `ConversationEvent` e `Message` quando a contagem ultrapassar dezenas de milhões.
3. **Avaliar necessidade de motor de busca** dedicado (Elastic/Typesense) para filtros avançados de conteúdo.
4. **Definir política de retenção** de eventos e mídia para controlar custos de armazenamento.
5. **Revisar ciclo de vida de `Tag`** – considerar hierarquia e taxonomia para pipelines de CRM.

---
