# Menu "⋮" de Ações da Conversa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o botão isolado de "Atualizar" no cabeçalho da conversa por um menu "⋮" único com 8 ações: Atualizar, Marcar como não lida, Adicionar Etiqueta, Salvar Contato, Mudar estágio da pipeline, Ativar Não Cliente, Arquivar, Excluir.

**Architecture:** 3 endpoints novos no back-end (`unread`, `archive`, `DELETE`) seguindo exatamente o padrão já usado por `read`/`exclude-from-pipeline`/`escalate` (thin router → `ConversationsService` → `ConversationRepository`); 1 campo novo no schema (`archived`/`archivedAt`, mesmo padrão de `excludedFromPipeline`). No front-end, um componente novo (`ConversationHeaderMenu.tsx`) usa o `DropdownMenu` (Radix) já existente desde a correção do bug de Campanhas, e REAPROVEITA (não duplica) `ConversationTagPicker`/`SaveContactButton` já existentes — o segundo ganha uma prop de gatilho customizável, mudança mínima e retrocompatível.

**Tech Stack:** Express + Zod (API), Next.js API routes (proxy fino), React + Radix (`@radix-ui/react-dropdown-menu`, `@radix-ui/react-dialog`), Prisma/Postgres, Jest.

## Global Constraints

- Nunca alterar o comportamento de uma conversa que NÃO usa nenhuma ação nova — `archived`/`archivedAt` nascem `false`/`null`, `unreadCount`/`excludedFromPipeline` continuam exatamente como hoje para quem não usa os itens novos.
- "Excluir" é DEFINITIVO (hard delete de `WhatsAppConversation` + `WhatsAppMessage`s + `WhatsAppConversationTag`s vinculadas, via `onDelete: Cascade` já existente no schema) — sem lixeira, sem desfazer. Exige digitar o nome do contato exibido antes do botão de confirmar habilitar. Permissão `conversation:delete`, só ADMINISTRATOR+.
- "Ativar Não Cliente" reaproveita `setExcludedFromPipeline` (já existe) — NUNCA reintroduzir um toggle que "esconde sem lugar pra achar depois" (motivo original do ADR #96): o board de Pipeline já mostra a coluna "Não cliente" para toda conversa com `excludedFromPipeline: true`, então este item só é mais um ponto de entrada para um estado já visível/reversível.
- Os botões grandes existentes "Assumir conversa"/"Devolver ao bot" (`ConversationActions.tsx`) continuam FORA do menu, sem nenhuma mudança.
- O painel lateral de contexto (`ConversationContextPanel.tsx`) continua existindo exatamente como está — o menu é um atalho adicional, nunca uma substituição.

---

## Mapa de arquivos

**Schema/migration:**
- Modificar: `prisma/schema.prisma` (model `WhatsAppConversation`)
- Criar: `prisma/migrations/20260829140000_add_conversation_archived/migration.sql`

**Domain (`apps/api/src/services/conversations/domain/`):**
- Modificar: `entities/Conversation.ts` (campos `archived`/`archivedAt`)
- Modificar: `repositories/ConversationRepository.ts` (`FindAllByTenantOptions.archived`, métodos `markAsUnread`/`setArchived`/`deleteById`)
- Modificar: `apps/api/src/services/auth/domain/permissions.ts` (`conversation:delete`)

**Infrastructure:**
- Modificar: `apps/api/src/services/conversations/infrastructure/repositories/PrismaConversationRepository.ts`

**Application:**
- Modificar: `apps/api/src/services/conversations/application/ConversationsService.ts`

**Presentation (back-end):**
- Modificar: `apps/api/src/services/conversations/presentation/conversationsRouter.ts`

**Presentation (dashboard, proxy fino):**
- Criar: `apps/dashboard/pages/api/conversations/[conversationId]/unread.ts`
- Criar: `apps/dashboard/pages/api/conversations/[conversationId]/archive.ts`
- Modificar: `apps/dashboard/pages/api/conversations/[conversationId]/index.ts` (adiciona `DELETE`)
- Modificar: `apps/dashboard/pages/api/conversations/stream.ts` (repassa `archived`)

**Dashboard (client + UI):**
- Modificar: `apps/dashboard/lib/clientApi.ts` (3 funções novas + tipo `ConversationSummary` + `fetchConversations`/`FetchConversationsOptions`)
- Modificar: `apps/dashboard/hooks/useConversationsList.ts` (parâmetro `archived`)
- Modificar: `apps/dashboard/components/ConversationFilterTabs.tsx` (opção `'archived'`)
- Modificar: `apps/dashboard/components/ConversationInbox.tsx` (fiação do novo filtro)
- Modificar: `apps/dashboard/components/SaveContactButton.tsx` (prop `trigger` opcional)
- Criar: `apps/dashboard/components/ConversationHeaderMenu.tsx`
- Modificar: `apps/dashboard/components/ConversationDetailPanel.tsx` (troca o botão de atualizar pelo menu novo)

**Testes:**
- Modificar: `apps/api/tests/services/conversations/application/ConversationsService.test.ts`
- Modificar: `apps/api/tests/services/conversations/infrastructure/PrismaConversationRepository.test.ts` (ou arquivo equivalente já existente)
- Modificar: `apps/api/tests/services/conversations/presentation/conversationsRouter.test.ts`
- Criar: `apps/dashboard/tests-jsdom/components/ConversationHeaderMenu.test.tsx`
- Modificar: `apps/dashboard/tests-jsdom/components/ConversationDetailPanel.test.tsx` (se existir; senão, criar cobertura mínima da troca de botão)

---

### Task 1: Schema — campo `archived`/`archivedAt` + migration

**Files:**
- Modify: `prisma/schema.prisma` (model `WhatsAppConversation`, logo abaixo do campo `excludedFromPipeline`)
- Create: `prisma/migrations/20260829140000_add_conversation_archived/migration.sql`

**Interfaces:**
- Produces: coluna `archived` (Boolean, default false) + `archivedAt` (DateTime?) em `WhatsAppConversation` — consumidas pelas Tasks 2-3.

- [ ] **Step 1: Criar a migration**

```sql
-- Menu "⋮" da conversa (2026-08-29) — "Arquivar" some da lista principal
-- de Conversas sem apagar nada (histórico continua 100% acessível), mesmo
-- racional de `excluded_from_pipeline` (ADR #94): atributo ORTOGONAL, só
-- filtro, nunca exclusão de dado. `archived_at` acompanha, mesmo padrão de
-- `escalated_at`.
ALTER TABLE "whatsapp_conversations" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_conversations" ADD COLUMN "archived_at" TIMESTAMP(3);
```

- [ ] **Step 2: Adicionar o campo no schema Prisma**

Em `prisma/schema.prisma`, dentro de `model WhatsAppConversation`, logo abaixo do campo `excludedFromPipeline Boolean @default(false) @map("excluded_from_pipeline")`:

```prisma
  /// Menu "⋮" da conversa (2026-08-29) — "Arquivar" some da lista principal
  /// de Conversas (filtro `archived: false` por padrão na listagem geral),
  /// SEM apagar nada — histórico de mensagens continua 100% acessível, só
  /// sai da tela padrão (mesmo racional ORTOGONAL de `excludedFromPipeline`
  /// acima, mas para outro propósito: aquele é sobre RELEVÂNCIA COMERCIAL,
  /// este é sobre RUÍDO NA CAIXA DE ENTRADA). Reversível a qualquer momento
  /// (desarquivar). `false`/`null` por padrão — toda conversa nasce visível.
  archived   Boolean   @default(false)
  /// Quando `archived` foi definido `true` pela última vez — `null` quando
  /// `archived: false` (mesmo padrão de `escalatedAt`: o timestamp só existe
  /// enquanto o estado que ele descreve está ativo).
  archivedAt DateTime? @map("archived_at")
```

- [ ] **Step 3: Aplicar a migration e regenerar o client Prisma**

Run: `npx prisma migrate deploy && npx prisma generate`

Expected: migration `20260829140000_add_conversation_archived` aplicada sem erro; `npx tsc --noEmit -p apps/api` continua limpo.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260829140000_add_conversation_archived
git commit -m "feat(conversations): add archived/archivedAt columns"
```

---

### Task 2: Domain — entidade + porta do repositório + permissão nova

**Files:**
- Modify: `apps/api/src/services/conversations/domain/entities/Conversation.ts`
- Modify: `apps/api/src/services/conversations/domain/repositories/ConversationRepository.ts`
- Modify: `apps/api/src/services/auth/domain/permissions.ts`

**Interfaces:**
- Consumes: coluna `archived`/`archivedAt` (Task 1).
- Produces: `Conversation.archived: boolean` / `.archivedAt?: Date`; `FindAllByTenantOptions.archived?: boolean`; `ConversationRepository.markAsUnread(tenantId, conversationId): Promise<Conversation | undefined>`; `.setArchived(tenantId, conversationId, archived: boolean): Promise<Conversation | undefined>`; `.deleteById(tenantId, conversationId): Promise<boolean>`; permissão `'conversation:delete'` — usados pelas Tasks 3-4.

- [ ] **Step 1: Adicionar os campos na entidade `Conversation`**

Em `apps/api/src/services/conversations/domain/entities/Conversation.ts`, dentro de `interface Conversation`, logo abaixo de `excludedFromPipeline: boolean;`:

```typescript
  /**
   * Menu "⋮" da conversa (2026-08-29) — `true` = fora da lista principal de
   * Conversas (filtro padrão), sem apagar nada. Reversível. `false` por
   * padrão — toda conversa nasce visível.
   */
  archived: boolean;
  /** Quando `archived` foi definido `true` pela última vez — `undefined` quando `archived: false`. */
  archivedAt?: Date;
```

- [ ] **Step 2: Adicionar o filtro em `FindAllByTenantOptions`**

Em `apps/api/src/services/conversations/domain/repositories/ConversationRepository.ts`, dentro de `interface FindAllByTenantOptions`, logo abaixo de `excludedFromPipeline?: boolean;`:

```typescript
  /**
   * Menu "⋮" da conversa (2026-08-29) — quando `false` (default do
   * consumidor padrão, a inbox geral), filtra fora as conversas com
   * `archived: true`. `true` = só as arquivadas (aba "Arquivadas").
   * Diferente de `excludedFromPipeline` (que é opt-in/sem filtro por
   * padrão): aqui o CHAMADOR (`ConversationsService.listConversations`)
   * sempre passa um valor explícito, nunca `undefined` — não existe hoje
   * nenhum consumidor que precise ver arquivadas e não-arquivadas juntas
   * numa mesma lista.
   */
  archived: boolean;
```

- [ ] **Step 3: Adicionar os 3 métodos novos na porta `ConversationRepository`**

No mesmo arquivo, dentro de `interface ConversationRepository`, logo abaixo do método `markAsRead`:

```typescript
  /**
   * Menu "⋮" da conversa (2026-08-29) — marca manualmente como não lida
   * (`unreadCount: 1`, suficiente para o indicador visual acender; não é
   * uma contagem real de mensagens não vistas, é uma marcação do operador
   * — mesmo espírito de "marcar e-mail como não lido"). `undefined` se a
   * conversa não existir/não pertencer ao tenant.
   */
  markAsUnread(tenantId: string, conversationId: string): Promise<Conversation | undefined>;
```

Logo abaixo do método `setExcludedFromPipeline`:

```typescript
  /**
   * Menu "⋮" da conversa (2026-08-29) — grava `archived`/`archivedAt` juntos
   * (`true` + `now()`, ou `false` + `null`). `undefined` se a conversa não
   * existir/não pertencer ao tenant.
   */
  setArchived(
    tenantId: string,
    conversationId: string,
    archived: boolean,
  ): Promise<Conversation | undefined>;

  /**
   * Menu "⋮" da conversa (2026-08-29) — remove a conversa DEFINITIVAMENTE.
   * `WhatsAppMessage`/`WhatsAppConversationTag` vinculadas somem junto via
   * `onDelete: Cascade` já existente no schema (confirmado: `prisma/schema.prisma`,
   * modelos `WhatsAppMessage`/`WhatsAppConversationTag`, campo `conversation`).
   * `CampaignRecipient.conversationId` (sem FK, acoplamento fraco de
   * propósito) fica como referência solta — aceitável, mesmo padrão já
   * documentado ali. Devolve `true` se algo foi apagado, `false` se a
   * conversa não existia/não pertencia ao tenant.
   */
  deleteById(tenantId: string, conversationId: string): Promise<boolean>;
```

- [ ] **Step 4: Adicionar a permissão `conversation:delete`**

Em `apps/api/src/services/auth/domain/permissions.ts`:

No union type `Permission`, logo abaixo de `| 'conversation:reassign'`:

```typescript
  /**
   * Menu "⋮" da conversa (2026-08-29) — excluir uma conversa é IRREVERSÍVEL
   * (apaga histórico de mensagens de verdade, diferente de `archived`, que
   * só esconde). Mesmo nível de risco de `campaign:manage` (uma ação errada
   * atinge um dado que não volta) — reservada a ADMINISTRATOR+, não
   * `message:send` (operator+, usado pelas outras ações desta tela, todas
   * reversíveis).
   */
  | 'conversation:delete'
```

Dentro de `const ADMINISTRATOR`, logo abaixo de `'campaign:manage',`:

```typescript
  // Menu "⋮" da conversa (2026-08-29) — excluir é IRREVERSÍVEL, mesmo nível
  // de risco de campaign:manage acima.
  'conversation:delete',
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit -p apps/api`

Expected: erros esperados NESTE PONTO — `PrismaConversationRepository` ainda não implementa os 3 métodos novos nem o campo `archived` na entidade (a interface exige, a classe ainda não tem). Isso é esperado; a Task 3 resolve. Confirme que os únicos erros são exatamente esses (arquivo `PrismaConversationRepository.ts`, "Property 'archived' is missing"/"Property 'markAsUnread' is missing" etc.) — nenhum erro em nenhum outro arquivo.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/conversations/domain apps/api/src/services/auth/domain/permissions.ts
git commit -m "feat(conversations): add archived field, new repository methods, and conversation:delete permission to domain layer"
```

---

### Task 3: Infrastructure — `PrismaConversationRepository`

**Files:**
- Modify: `apps/api/src/services/conversations/infrastructure/repositories/PrismaConversationRepository.ts`

**Interfaces:**
- Consumes: `FindAllByTenantOptions.archived`, `ConversationRepository.markAsUnread`/`.setArchived`/`.deleteById` (Task 2).
- Produces: implementação completa — usada pela Task 4 (`ConversationsService`).

- [ ] **Step 1: Ler o arquivo real primeiro**

Leia `apps/api/src/services/conversations/infrastructure/repositories/PrismaConversationRepository.ts` por completo antes de editar — este passo é sobre reproduzir EXATAMENTE os padrões já usados (não inventar um estilo novo).

- [ ] **Step 2: Adicionar `archived`/`archivedAt` no mapeamento**

No `interface` de linha (a interface de tipo intermediário entre a linha crua do Prisma e o `toDomain`, contendo hoje `excludedFromPipeline: boolean;` na linha ~73), adicionar logo abaixo:

```typescript
  archived: boolean;
  archivedAt: Date | null;
```

Na função `toDomain` (ou equivalente — o método/função que constrói o objeto `Conversation` a partir da linha crua, na linha ~133 onde hoje tem `excludedFromPipeline: row.excludedFromPipeline,`), adicionar logo abaixo:

```typescript
      archived: row.archived,
      archivedAt: row.archivedAt ?? undefined,
```

- [ ] **Step 3: Adicionar o filtro `archived` em `findAllByTenant`**

Na linha ~318 (`const { status, limit, cursor, sessionName, needsHumanAttention, excludedFromPipeline } = options;`), adicionar `archived` à desestruturação:

```typescript
    const { status, limit, cursor, sessionName, needsHumanAttention, excludedFromPipeline, archived } =
      options;
```

No `where` (linha ~332, logo abaixo de `...(excludedFromPipeline !== undefined ? { excludedFromPipeline } : {}),`):

```typescript
        // Menu "⋮" da conversa (2026-08-29) — diferente de excludedFromPipeline,
        // este filtro é SEMPRE aplicado (o chamador sempre passa um boolean
        // explícito, ver docstring da option).
        archived,
```

- [ ] **Step 4: Implementar `markAsUnread`**

Logo abaixo do método `markAsRead` existente, seguindo o MESMO padrão (preserva `updatedAt` — marcar como não lida manualmente não deve bumpar a posição da conversa na fila ordenada por atividade):

```typescript
  async markAsUnread(tenantId: string, conversationId: string): Promise<Conversation | undefined> {
    const current = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { updatedAt: true },
    });
    if (!current) {
      return undefined;
    }

    const result = await this.prisma.whatsAppConversation.updateMany({
      where: { id: conversationId, tenantId },
      data: { unreadCount: 1, updatedAt: current.updatedAt },
    });

    if (result.count === 0) {
      return undefined;
    }

    return this.findById(conversationId);
  }
```

- [ ] **Step 5: Implementar `setArchived`**

Logo abaixo do método `setExcludedFromPipeline` existente, seguindo o MESMO padrão:

```typescript
  async setArchived(
    tenantId: string,
    conversationId: string,
    archived: boolean,
  ): Promise<Conversation | undefined> {
    const result = await this.prisma.whatsAppConversation.updateMany({
      where: { id: conversationId, tenantId },
      data: { archived, archivedAt: archived ? new Date() : null },
    });

    if (result.count === 0) {
      return undefined;
    }

    return this.findById(conversationId);
  }
```

- [ ] **Step 6: Implementar `deleteById`**

Em qualquer ponto do final da classe (mesmo padrão de `PrismaCampaignRepository.deleteById`, já existente no projeto para outra entidade — mesma ideia, `deleteMany` + checar `count`):

```typescript
  async deleteById(tenantId: string, conversationId: string): Promise<boolean> {
    const result = await this.prisma.whatsAppConversation.deleteMany({
      where: { id: conversationId, tenantId },
    });
    return result.count > 0;
  }
```

- [ ] **Step 7: Verificar tipos**

Run: `npx tsc --noEmit -p apps/api`

Expected: limpo — nenhum erro em `PrismaConversationRepository.ts` nem em nenhum outro arquivo (a Task 2 já confirmou que os erros anteriores eram só aqui).

- [ ] **Step 8: Rodar os testes já existentes do repositório**

Run: `npx jest --testPathPattern "conversations" 2>&1 | tail -40`

Expected: nenhuma regressão nos testes já existentes de `findAllByTenant`/`markAsRead`/`setExcludedFromPipeline` (os testes novos ficam para a Task 8).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/conversations/infrastructure/repositories/PrismaConversationRepository.ts
git commit -m "feat(conversations): implement archived filter, markAsUnread, setArchived, deleteById in PrismaConversationRepository"
```

---

### Task 4: Application — `ConversationsService`

**Files:**
- Modify: `apps/api/src/services/conversations/application/ConversationsService.ts`
- Test: `apps/api/tests/services/conversations/application/ConversationsService.test.ts`

**Interfaces:**
- Consumes: `ConversationRepository.markAsUnread`/`.setArchived`/`.deleteById` (Task 3).
- Produces: `ConversationsService.markAsUnread(tenantId, conversationId): Promise<Conversation>`; `.setArchived(tenantId, conversationId, archived, actor?, meta?): Promise<Conversation>`; `.deleteConversation(tenantId, conversationId, actor?, meta?): Promise<void>` — usados pela Task 5 (router).

- [ ] **Step 1: Ler o arquivo real primeiro**

Leia `apps/api/src/services/conversations/application/ConversationsService.ts` por completo — em particular os métodos `markAsRead` (linha ~563) e `setExcludedFromPipeline` (linha ~625) e o método privado `audit` (linha ~395), para reproduzir exatamente a assinatura de `ConversationActor`/`ConversationActionMeta` já usada.

- [ ] **Step 2: Escrever o teste que falha (markAsUnread)**

Em `apps/api/tests/services/conversations/application/ConversationsService.test.ts`, seguindo o padrão dos testes de `markAsRead` já existentes no arquivo (mesmo `FakeConversationRepository`/`tenantId` de setup já usados):

```typescript
  it('markAsUnread: marca a conversa como não lida (unreadCount > 0)', async () => {
    const { service, repository, tenantId } = setUp();
    const conversationId = repository.seedConversation({ tenantId, unreadCount: 0 });

    const result = await service.markAsUnread(tenantId, conversationId);

    expect(result.unreadCount).toBeGreaterThan(0);
  });

  it('markAsUnread: conversa inexistente lança ConversationNotFoundError', async () => {
    const { service, tenantId } = setUp();

    await expect(service.markAsUnread(tenantId, 'conversa-inexistente')).rejects.toBeInstanceOf(
      ConversationNotFoundError,
    );
  });
```

> Ajustar `setUp()`/`repository.seedConversation` para os nomes exatos já usados no arquivo real — seguir o padrão dos testes vizinhos de `markAsRead`.

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx jest --testPathPattern "ConversationsService" -t "markAsUnread"`

Expected: FAIL — `service.markAsUnread` não existe.

- [ ] **Step 4: Implementar `markAsUnread`**

Logo abaixo do método `markAsRead` existente:

```typescript
  /**
   * Menu "⋮" da conversa (2026-08-29) — marca manualmente como não lida.
   * Sem `ConversationActor`/auditoria (mesmo racional de `markAsRead`: é uma
   * ação de leitura/visualização do dia a dia, não uma mudança de negócio).
   */
  async markAsUnread(tenantId: string, conversationId: string): Promise<Conversation> {
    await this.assertTenantExists(tenantId);
    const updated = await this.conversationRepository.markAsUnread(tenantId, conversationId);
    if (!updated) {
      throw new ConversationNotFoundError(conversationId);
    }
    return updated;
  }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx jest --testPathPattern "ConversationsService" -t "markAsUnread"`

Expected: PASS.

- [ ] **Step 6: Escrever o teste que falha (setArchived)**

```typescript
  it('setArchived: arquiva a conversa e grava archivedAt', async () => {
    const { service, tenantId } = setUp();
    const conversationId = repository.seedConversation({ tenantId, archived: false });

    const result = await service.setArchived(tenantId, conversationId, true);

    expect(result.archived).toBe(true);
    expect(result.archivedAt).toBeDefined();
  });

  it('setArchived: desarquivar limpa archivedAt', async () => {
    const { service, tenantId } = setUp();
    const conversationId = repository.seedConversation({
      tenantId,
      archived: true,
      archivedAt: new Date(),
    });

    const result = await service.setArchived(tenantId, conversationId, false);

    expect(result.archived).toBe(false);
    expect(result.archivedAt).toBeUndefined();
  });
```

- [ ] **Step 7: Rodar e confirmar que falha, depois implementar**

Run: `npx jest --testPathPattern "ConversationsService" -t "setArchived"` → FAIL.

Implementar, logo abaixo de `setExcludedFromPipeline`:

```typescript
  /**
   * Menu "⋮" da conversa (2026-08-29) — arquiva/desarquiva (some/reaparece
   * na lista principal de Conversas, sem apagar nada). Mesmo padrão de
   * `setExcludedFromPipeline`: com `ConversationActor`/auditoria, porque é
   * uma decisão operacional explícita, não uma ação de leitura passiva.
   */
  async setArchived(
    tenantId: string,
    conversationId: string,
    archived: boolean,
    actor: ConversationActor = { canResumeAny: true },
    meta: ConversationActionMeta = {},
  ): Promise<Conversation> {
    await this.assertTenantExists(tenantId);
    const updated = await this.conversationRepository.setArchived(
      tenantId,
      conversationId,
      archived,
    );
    if (!updated) {
      throw new ConversationNotFoundError(conversationId);
    }
    await this.audit(
      tenantId,
      actor.userId,
      archived ? 'conversation.archived' : 'conversation.unarchived',
      conversationId,
      meta,
    );
    return updated;
  }
```

Rodar de novo: PASS.

- [ ] **Step 8: Escrever o teste que falha (deleteConversation)**

```typescript
  it('deleteConversation: remove a conversa de verdade', async () => {
    const { service, repository, tenantId } = setUp();
    const conversationId = repository.seedConversation({ tenantId });

    await service.deleteConversation(tenantId, conversationId);

    await expect(service.getConversation(tenantId, conversationId)).rejects.toBeInstanceOf(
      ConversationNotFoundError,
    );
  });

  it('deleteConversation: conversa inexistente lança ConversationNotFoundError', async () => {
    const { service, tenantId } = setUp();

    await expect(
      service.deleteConversation(tenantId, 'conversa-inexistente'),
    ).rejects.toBeInstanceOf(ConversationNotFoundError);
  });
```

> Confirme o nome exato do método já existente que busca uma conversa por id (usado aqui como `getConversation`) lendo o arquivo real — ajuste se o nome for outro.

- [ ] **Step 9: Rodar e confirmar que falha, depois implementar**

Run: `npx jest --testPathPattern "ConversationsService" -t "deleteConversation"` → FAIL.

Implementar (em qualquer ponto da classe):

```typescript
  /**
   * Menu "⋮" da conversa (2026-08-29) — exclusão DEFINITIVA. Auditoria
   * ANTES de apagar (senão o registro de auditoria referenciaria uma
   * conversa que já não existe mais mid-operação — ordem deliberada,
   * diferente dos outros métodos, que auditam depois do sucesso).
   */
  async deleteConversation(
    tenantId: string,
    conversationId: string,
    actor: ConversationActor = { canResumeAny: true },
    meta: ConversationActionMeta = {},
  ): Promise<void> {
    await this.assertTenantExists(tenantId);
    await this.audit(tenantId, actor.userId, 'conversation.deleted', conversationId, meta);
    const deleted = await this.conversationRepository.deleteById(tenantId, conversationId);
    if (!deleted) {
      throw new ConversationNotFoundError(conversationId);
    }
  }
```

Rodar de novo: PASS.

- [ ] **Step 10: Rodar o arquivo de teste inteiro**

Run: `npx jest --testPathPattern "ConversationsService"`

Expected: todos os testes passando, incluindo os 6 novos.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/services/conversations/application/ConversationsService.ts apps/api/tests/services/conversations/application/ConversationsService.test.ts
git commit -m "feat(conversations): add markAsUnread, setArchived, deleteConversation to ConversationsService"
```

---

### Task 5: Presentation (back-end) — 3 rotas novas + filtro `archived` na listagem

**Files:**
- Modify: `apps/api/src/services/conversations/presentation/conversationsRouter.ts`
- Test: `apps/api/tests/services/conversations/presentation/conversationsRouter.test.ts`

**Interfaces:**
- Consumes: `ConversationsService.markAsUnread`/`.setArchived`/`.deleteConversation` (Task 4).
- Produces: `POST /:conversationId/unread`, `POST /:conversationId/archive`, `DELETE /:conversationId`, `GET /?archived=true|false` — usados pela Task 6 (proxies do dashboard).

- [ ] **Step 1: Ler o arquivo real primeiro**

Leia `apps/api/src/services/conversations/presentation/conversationsRouter.ts` por completo — em particular as rotas `/:conversationId/read` (linha ~381) e `/:conversationId/exclude-from-pipeline` (linha ~435), e o schema `listConversationsQuerySchema` (linha ~57), para reproduzir exatamente o estilo.

- [ ] **Step 2: Escrever os testes que falham**

Em `apps/api/tests/services/conversations/presentation/conversationsRouter.test.ts`, seguindo o padrão dos testes de `POST .../read`/`POST .../exclude-from-pipeline` já existentes:

```typescript
  it('POST /:conversationId/unread marca como não lida', async () => {
    const conversationId = seedConversation({ unreadCount: 0 });

    const response = await request(app)
      .post(`/api/tenants/${tenantId}/conversations/${conversationId}/unread`)
      .send();

    expect(response.status).toBe(200);
    expect(response.body.unreadCount).toBeGreaterThan(0);
  });

  it('POST /:conversationId/archive arquiva/desarquiva conforme o corpo', async () => {
    const conversationId = seedConversation({ archived: false });

    const archiveResponse = await request(app)
      .post(`/api/tenants/${tenantId}/conversations/${conversationId}/archive`)
      .send({ archived: true });
    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.archived).toBe(true);

    const unarchiveResponse = await request(app)
      .post(`/api/tenants/${tenantId}/conversations/${conversationId}/archive`)
      .send({ archived: false });
    expect(unarchiveResponse.status).toBe(200);
    expect(unarchiveResponse.body.archived).toBe(false);
  });

  it('POST /:conversationId/archive rejeita corpo sem "archived" booleano', async () => {
    const conversationId = seedConversation({});

    const response = await request(app)
      .post(`/api/tenants/${tenantId}/conversations/${conversationId}/archive`)
      .send({});

    expect(response.status).toBe(400);
  });

  it('DELETE /:conversationId remove a conversa', async () => {
    const conversationId = seedConversation({});

    const response = await request(app).delete(
      `/api/tenants/${tenantId}/conversations/${conversationId}`,
    );

    expect(response.status).toBe(204);
  });

  it('DELETE /:conversationId em conversa inexistente devolve 404', async () => {
    const response = await request(app).delete(
      `/api/tenants/${tenantId}/conversations/conversa-inexistente`,
    );

    expect(response.status).toBe(404);
  });

  it('GET /?archived=true lista só as arquivadas', async () => {
    const archivedId = seedConversation({ archived: true });
    seedConversation({ archived: false });

    const response = await request(app)
      .get(`/api/tenants/${tenantId}/conversations`)
      .query({ archived: 'true' });

    expect(response.status).toBe(200);
    const ids = response.body.conversations.map((c: { id: string }) => c.id);
    expect(ids).toContain(archivedId);
    expect(ids).toHaveLength(1);
  });

  it('GET / sem "archived" na query filtra archived:false por padrão', async () => {
    seedConversation({ archived: true });
    const visibleId = seedConversation({ archived: false });

    const response = await request(app).get(`/api/tenants/${tenantId}/conversations`);

    const ids = response.body.conversations.map((c: { id: string }) => c.id);
    expect(ids).toContain(visibleId);
    expect(ids).toHaveLength(1);
  });
```

> Ajustar `seedConversation`/`app`/`tenantId` para os identificadores exatos já usados no `beforeEach` deste arquivo — seguir o padrão dos testes vizinhos de `exclude-from-pipeline`.

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx jest --testPathPattern "conversationsRouter" -t "unread|archive|DELETE"`

Expected: FAIL — rotas 404, filtro `archived` não aplicado.

- [ ] **Step 4: Adicionar o schema do corpo de `/archive`**

Logo abaixo de `setExcludedFromPipelineBodySchema`:

```typescript
/** Corpo do `POST .../archive` — Menu "⋮" da conversa (2026-08-29). */
const setArchivedBodySchema = z.object({
  archived: z.boolean(),
});
```

- [ ] **Step 5: Adicionar `archived` em `listConversationsQuerySchema`**

Logo abaixo de `excludedFromPipeline` no schema (linha ~83-86):

```typescript
  /**
   * Menu "⋮" da conversa (2026-08-29) — `?archived=true` lista só as
   * arquivadas; ausente/`false` (default) lista só as NÃO arquivadas —
   * diferente de `excludedFromPipeline`, aqui SEMPRE há um valor efetivo
   * (nunca "sem filtro"), porque a inbox geral nunca deveria misturar
   * conversas arquivadas com não-arquivadas na mesma lista.
   */
  archived: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((value) => value === 'true'),
```

- [ ] **Step 6: Repassar `archived` no handler `GET /`**

Encontre o handler `router.get('/', ...)` (linha ~166) e adicione `archived: query.archived` na chamada a `conversationsService.listConversations` (ou o nome exato do método usado ali — confirme lendo o handler completo antes de editar).

- [ ] **Step 7: Adicionar as 3 rotas novas**

Logo abaixo da rota `/:conversationId/read` (antes de `/:conversationId/stage`):

```typescript
  router.post(
    '/:conversationId/unread',
    // Menu "⋮" da conversa (2026-08-29) — mesma permissão de marcar como
    // lida: quem já pode VER a conversa pode marcá-la como não lida.
    requirePermission('conversation:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      const conversation = await conversationsService.markAsUnread(
        params.tenantId,
        params.conversationId,
      );
      res.status(200).json(conversation);
    }),
  );
```

Logo abaixo da rota `/:conversationId/exclude-from-pipeline` (antes de `/:conversationId/save-contact`):

```typescript
  router.post(
    '/:conversationId/archive',
    // Menu "⋮" da conversa (2026-08-29) — mesma permissão de mover um card
    // no Pipeline/marcar exclude-from-pipeline (`message:send`): ação
    // operacional do dia a dia, reversível, qualquer operador pode.
    requirePermission('message:send'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;
      const body = validateOrRespond(setArchivedBodySchema, req.body, res);
      if (!body) return;

      const conversation = await conversationsService.setArchived(
        params.tenantId,
        params.conversationId,
        body.archived,
        toActor(req),
        toMeta(req),
      );
      res.status(200).json(conversation);
    }),
  );

  router.delete(
    '/:conversationId',
    // Menu "⋮" da conversa (2026-08-29) — exclusão é IRREVERSÍVEL, permissão
    // própria e mais restrita (`conversation:delete`, ADMINISTRATOR+), nunca
    // `message:send` (usado pelas ações reversíveis desta mesma tela).
    requirePermission('conversation:delete'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(
        tenantIdParamSchema.merge(conversationIdParamSchema),
        req.params,
        res,
      );
      if (!params) return;

      await conversationsService.deleteConversation(
        params.tenantId,
        params.conversationId,
        toActor(req),
        toMeta(req),
      );
      res.status(204).send();
    }),
  );
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npx jest --testPathPattern "conversationsRouter"`

Expected: PASS — todos os testes do arquivo, incluindo os 7 novos.

- [ ] **Step 9: Verificar tipos**

Run: `npx tsc --noEmit -p apps/api`

Expected: limpo.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/services/conversations/presentation/conversationsRouter.ts apps/api/tests/services/conversations/presentation/conversationsRouter.test.ts
git commit -m "feat(conversations): add unread/archive/delete routes and archived filter to GET /"
```

---

### Task 6: Dashboard — proxies fininos + filtro `archived` na stream

**Files:**
- Create: `apps/dashboard/pages/api/conversations/[conversationId]/unread.ts`
- Create: `apps/dashboard/pages/api/conversations/[conversationId]/archive.ts`
- Modify: `apps/dashboard/pages/api/conversations/[conversationId]/index.ts`
- Modify: `apps/dashboard/pages/api/conversations/stream.ts`

**Interfaces:**
- Consumes: `POST .../unread`, `POST .../archive`, `DELETE .../:conversationId`, `GET /?archived=` (Task 5).
- Produces: `POST /api/conversations/:id/unread`, `POST /api/conversations/:id/archive`, `DELETE /api/conversations/:id` (dashboard, mesmo formato) — usados pela Task 7 (`clientApi.ts`).

- [ ] **Step 1: Ler `read.ts` e `exclude-from-pipeline.ts` primeiro**

Leia `apps/dashboard/pages/api/conversations/[conversationId]/read.ts` e `.../exclude-from-pipeline.ts` por completo — são o molde exato dos 2 arquivos novos.

- [ ] **Step 2: Criar `unread.ts`**

Copiando `read.ts` linha por linha, só trocando o nome da rota:

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy (Menu "⋮" da conversa, 2026-08-29) para `POST /:conversationId/unread`
 * — marca manualmente como não lida. Mesmo padrão de `read.ts`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const conversationId = requireStringParam(req.query.conversationId, 'conversationId', res);
  if (!conversationId) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status, body } = await callConversationsApi(
    session,
    `/${encodeURIComponent(conversationId)}/unread`,
    {
      method: 'POST',
    },
  );
  res.status(status).json(body);
}
```

- [ ] **Step 3: Criar `archive.ts`**

Copiando `exclude-from-pipeline.ts` linha por linha:

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callConversationsApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy (Menu "⋮" da conversa, 2026-08-29) para `POST /:conversationId/archive`
 * — arquiva/desarquiva. Mesmo padrão de `exclude-from-pipeline.ts`: encaminha
 * o corpo tal como recebido, RBAC/validação são impostos pela API.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const conversationId = requireStringParam(req.query.conversationId, 'conversationId', res);
  if (!conversationId) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status, body } = await callConversationsApi(
    session,
    `/${encodeURIComponent(conversationId)}/archive`,
    {
      method: 'POST',
      body: req.body,
    },
  );
  res.status(status).json(body);
}
```

- [ ] **Step 4: Adicionar `DELETE` em `index.ts`**

Em `apps/dashboard/pages/api/conversations/[conversationId]/index.ts`, trocar:

```typescript
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status, body } = await callConversationsApi(
    session,
    `/${encodeURIComponent(conversationId)}`,
  );
  res.status(status).json(body);
```

por:

```typescript
  if (req.method === 'DELETE') {
    const { status } = await callConversationsApi(
      session,
      `/${encodeURIComponent(conversationId)}`,
      { method: 'DELETE' },
    );
    res.status(status).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, DELETE');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status, body } = await callConversationsApi(
    session,
    `/${encodeURIComponent(conversationId)}`,
  );
  res.status(status).json(body);
```

E atualizar o comentário do topo do arquivo para mencionar as duas rotas (`GET`/`DELETE`).

- [ ] **Step 5: Repassar `archived` em `stream.ts`**

Leia `apps/dashboard/pages/api/conversations/stream.ts` por completo. Ao lado de onde `needsHumanAttention` é lido da query (linha ~39-40) e repassado (linha ~44), adicionar o mesmo tratamento para `archived`:

```typescript
  const archived =
    typeof req.query.archived === 'string' ? req.query.archived : undefined;
```

E incluir `archived` no objeto `query` repassado (mesma linha onde `needsHumanAttention` já está incluído).

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit -p apps/dashboard`

Expected: limpo.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/pages/api/conversations
git commit -m "feat(conversations): add unread/archive/delete dashboard proxies and archived passthrough in stream"
```

---

### Task 7: `clientApi.ts` — funções novas + tipos

**Files:**
- Modify: `apps/dashboard/lib/clientApi.ts`

**Interfaces:**
- Consumes: `POST /api/conversations/:id/unread`, `.../archive`, `DELETE /api/conversations/:id` (Task 6).
- Produces: `markConversationAsUnread(conversationId): Promise<ConversationSummary>`; `archiveConversation(conversationId, archived: boolean): Promise<ConversationSummary>`; `deleteConversation(conversationId): Promise<void>` — usados pela Task 10 (`ConversationHeaderMenu.tsx`).

- [ ] **Step 1: Ler o arquivo real primeiro**

Leia a seção de Conversas de `apps/dashboard/lib/clientApi.ts` (funções `markConversationAsRead`, `setConversationExcludedFromPipeline`, `deleteContact`, e a `interface ConversationSummary`) por completo.

- [ ] **Step 2: Adicionar `archived`/`archivedAt` em `ConversationSummary`**

Localize `interface ConversationSummary` e adicione, no mesmo estilo do campo `excludedFromPipeline` já existente:

```typescript
  archived: boolean;
  archivedAt?: string;
```

- [ ] **Step 3: Adicionar `archived` em `FetchConversationsOptions`**

Localize a interface de opções de `fetchConversations` (contém `excludedFromPipeline?: boolean;`) e adicione:

```typescript
  archived?: boolean;
```

E em `fetchConversations`, logo abaixo de `if (options.excludedFromPipeline !== undefined) ...`:

```typescript
  if (options.archived !== undefined) params.set('archived', String(options.archived));
```

- [ ] **Step 4: Adicionar as 3 funções novas**

Logo abaixo de `markConversationAsRead`:

```typescript
/** Menu "⋮" da conversa (2026-08-29) — marca manualmente como não lida (oposto de `markConversationAsRead`). */
export function markConversationAsUnread(conversationId: string): Promise<ConversationSummary> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/unread`, {
    method: 'POST',
  });
}
```

Logo abaixo de `setConversationExcludedFromPipeline`:

```typescript
/** Menu "⋮" da conversa (2026-08-29) — arquiva (some da lista principal) ou desarquiva, sem apagar nada. */
export function archiveConversation(
  conversationId: string,
  archived: boolean,
): Promise<ConversationSummary> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/archive`, {
    method: 'POST',
    body: JSON.stringify({ archived }),
  });
}
```

Em qualquer ponto da seção de Conversas (próximo às outras, por organização):

```typescript
/** Menu "⋮" da conversa (2026-08-29) — exclusão DEFINITIVA. Sem desfazer. */
export async function deleteConversation(conversationId: string): Promise<void> {
  await request(`/api/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit -p apps/dashboard`

Expected: limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/lib/clientApi.ts
git commit -m "feat(conversations): add markConversationAsUnread, archiveConversation, deleteConversation client functions"
```

---

### Task 8: Filtro "Arquivadas" na lista de Conversas

**Files:**
- Modify: `apps/dashboard/components/ConversationFilterTabs.tsx`
- Modify: `apps/dashboard/hooks/useConversationsList.ts`
- Modify: `apps/dashboard/components/ConversationInbox.tsx`
- Test: `apps/dashboard/tests-jsdom/components/ConversationInbox.test.tsx` (se existir; senão pular este arquivo de teste, cobertura fica só no manual/E2E desta rodada)

**Interfaces:**
- Consumes: `archived` em `fetchConversations`/stream (Tasks 6-7).
- Produces: opção `'archived'` em `ConversationFilterValue` — consumido só dentro deste Task.

- [ ] **Step 1: Adicionar a opção no tipo e na lista de abas**

Em `apps/dashboard/components/ConversationFilterTabs.tsx`, mudar:

```typescript
export type ConversationFilterValue = 'all' | 'unread' | 'waiting' | 'bot' | 'human';
```

para:

```typescript
export type ConversationFilterValue = 'all' | 'unread' | 'waiting' | 'bot' | 'human' | 'archived';
```

E adicionar `{ label: 'Arquivadas', value: 'archived' }` ao array `OPTIONS` (leia o array completo primeiro para manter o mesmo formato dos objetos vizinhos).

- [ ] **Step 2: Adicionar o parâmetro `archived` em `useConversationsList`**

Leia `apps/dashboard/hooks/useConversationsList.ts` por completo primeiro. Mudar a assinatura:

```typescript
export function useConversationsList(
  status?: ConversationStatus,
  sessionName?: string,
  needsHumanAttention?: boolean,
  archived?: boolean,
): UseConversationsListResult {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (sessionName) query.set('sessionName', sessionName);
  if (needsHumanAttention) query.set('needsHumanAttention', 'true');
  if (archived !== undefined) query.set('archived', String(archived));
```

- [ ] **Step 3: Conectar o filtro em `ConversationInbox.tsx`**

Leia `apps/dashboard/components/ConversationInbox.tsx` por completo primeiro. Ao lado de `const needsHumanAttentionParam = filter === 'waiting' ? true : undefined;` (linha ~73), adicionar:

```typescript
  const archivedParam = filter === 'archived' ? true : filter === 'all' ? false : undefined;
```

> Note a diferença de `needsHumanAttentionParam`: quando `filter === 'all'`, `archivedParam` precisa ser `false` explícito (nunca `undefined`) — a Task 5 tornou `archived` sempre obrigatório do lado da API (nunca "sem filtro"), então TODO filtro que não seja explicitamente "Arquivadas" precisa mandar `false`. Ajuste os outros valores de `filter` (`'unread'`, `'bot'`, `'human'`) para também caírem em `false` (não em `undefined`) — só `filter === 'archived'` manda `true`.

E passar `archivedParam` para `useConversationsList` na chamada existente (linha ~84):

```typescript
  } = useConversationsList(statusParam, sessionName, needsHumanAttentionParam, archivedParam);
```

- [ ] **Step 4: Verificar tipos e rodar os testes existentes**

Run: `npx tsc --noEmit -p apps/dashboard`
Run: `npx jest --testPathPattern "ConversationInbox|ConversationFilterTabs"`

Expected: ambos limpos, nenhuma regressão.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/ConversationFilterTabs.tsx apps/dashboard/hooks/useConversationsList.ts apps/dashboard/components/ConversationInbox.tsx
git commit -m "feat(conversations): add Arquivadas filter tab to the conversations inbox"
```

---

### Task 9: `SaveContactButton` — gatilho customizável

**Files:**
- Modify: `apps/dashboard/components/SaveContactButton.tsx`
- Test: `apps/dashboard/tests-jsdom/components/SaveContactButton.test.tsx` (se existir)

**Interfaces:**
- Produces: prop opcional `trigger?: React.ReactNode` em `SaveContactButtonProps` — consumido pela Task 10 (`ConversationHeaderMenu.tsx`). Retrocompatível: sem a prop, comportamento idêntico ao de hoje.

- [ ] **Step 1: Escrever o teste que falha**

No arquivo de teste existente de `SaveContactButton` (ou criar um novo se não existir, seguindo o padrão dos testes de componente já usados no projeto — `render`/`screen`/`fireEvent` do Testing Library):

```typescript
  it('com prop "trigger", renderiza o gatilho customizado em vez do ícone padrão', () => {
    render(
      <SaveContactButton
        conversation={buildConversation()}
        onUpdated={() => {}}
        trigger={<button type="button">Abrir salvar contato</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Abrir salvar contato' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar contato' })).not.toBeInTheDocument();
  });

  it('sem prop "trigger", continua mostrando o ícone padrão (retrocompatibilidade)', () => {
    render(<SaveContactButton conversation={buildConversation()} onUpdated={() => {}} />);

    expect(screen.getByRole('button', { name: 'Salvar contato' })).toBeInTheDocument();
  });
```

> `buildConversation()` — use o helper de fixture já usado pelos outros testes deste componente/arquivo vizinho; se não existir, construa um objeto `ConversationSummary` mínimo válido (com `contactJid` que não termine em `@lid`, para `canDeriveContact` ser `true`).

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --testPathPattern "SaveContactButton" -t "trigger"`

Expected: FAIL — a prop `trigger` não existe ainda.

- [ ] **Step 3: Implementar**

Em `SaveContactButton.tsx`, adicionar a prop e usá-la condicionalmente:

```typescript
interface SaveContactButtonProps {
  conversation: ConversationSummary;
  onUpdated: (conversation: ConversationSummary) => void;
  /**
   * Menu "⋮" da conversa (2026-08-29) — gatilho customizado (ex.: um item de
   * menu) para abrir o MESMO diálogo de "Salvar contato", em vez do ícone
   * padrão do painel de contexto. `undefined` = comportamento de sempre.
   */
  trigger?: React.ReactNode;
}
```

E no JSX de retorno, trocar:

```typescript
      <button
        type="button"
        aria-label="Salvar contato"
        title="Salvar contato"
        onClick={() => handleOpenChange(true)}
        className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
```

por:

```typescript
      {trigger ? (
        <span onClick={() => handleOpenChange(true)}>{trigger}</span>
      ) : (
        <button
          type="button"
          aria-label="Salvar contato"
          title="Salvar contato"
          onClick={() => handleOpenChange(true)}
          className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx jest --testPathPattern "SaveContactButton"`

Expected: PASS — todos os testes, incluindo os 2 novos.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/SaveContactButton.tsx apps/dashboard/tests-jsdom/components/SaveContactButton.test.tsx
git commit -m "feat(conversations): add optional custom trigger to SaveContactButton"
```

---

### Task 10: `ConversationHeaderMenu.tsx` — o menu "⋮" em si

**Files:**
- Create: `apps/dashboard/components/ConversationHeaderMenu.tsx`
- Test: `apps/dashboard/tests-jsdom/components/ConversationHeaderMenu.test.tsx`

**Interfaces:**
- Consumes: `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem` (`@/components/ui/dropdown-menu`, já existe); `ConversationTagPicker` (já existe); `SaveContactButton` com prop `trigger` (Task 9); `markConversationAsUnread`/`archiveConversation`/`deleteConversation` (Task 7); `updateConversationStage`/`setConversationExcludedFromPipeline` (já existem).
- Produces: `<ConversationHeaderMenu conversation sessionName onUpdated onRefresh />` — consumido pela Task 11 (`ConversationDetailPanel.tsx`).

- [ ] **Step 1: Ler os arquivos-molde primeiro**

Leia `apps/dashboard/components/ui/dropdown-menu.tsx` (a API do componente), `apps/dashboard/components/CampaignsPanel.tsx` (trecho do menu "⋮" de linha, já usa `DropdownMenu`/`asChild` corretamente) e `apps/dashboard/components/CampaignDetailPanel.tsx` (padrão de `Dialog` de confirmação por ação) antes de escrever este componente — o objetivo é reproduzir os MESMOS padrões, não inventar um novo.

- [ ] **Step 2: Escrever o teste que falha (estrutura básica + Atualizar + Marcar como não lida)**

Em `apps/dashboard/tests-jsdom/components/ConversationHeaderMenu.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConversationHeaderMenu from '@/components/ConversationHeaderMenu';
import * as clientApi from '@/lib/clientApi';
import type { ConversationSummary } from '@/lib/clientApi';

jest.mock('@/lib/clientApi');

function buildConversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'conv-1',
    sessionName: 'sessao-1',
    contactJid: '5521999999999@s.whatsapp.net',
    contactName: 'Cliente Teste',
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    excludedFromPipeline: false,
    archived: false,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as ConversationSummary;
}

describe('ConversationHeaderMenu', () => {
  it('abre o menu e mostra os 8 itens esperados', () => {
    render(
      <ConversationHeaderMenu
        conversation={buildConversation()}
        sessionName="sessao-1"
        onUpdated={() => {}}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));

    expect(screen.getByRole('menuitem', { name: 'Atualizar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Marcar como não lida' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Adicionar Etiqueta' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Salvar Contato' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Mudar estágio da pipeline' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Ativar Não Cliente' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Arquivar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toBeInTheDocument();
  });

  it('"Atualizar" chama onRefresh, sem abrir diálogo nenhum', () => {
    const onRefresh = jest.fn();
    render(
      <ConversationHeaderMenu
        conversation={buildConversation()}
        sessionName="sessao-1"
        onUpdated={() => {}}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Atualizar' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('"Marcar como não lida" chama a API e propaga a conversa atualizada', async () => {
    const onUpdated = jest.fn();
    const updated = buildConversation({ unreadCount: 1 });
    (clientApi.markConversationAsUnread as jest.Mock).mockResolvedValue(updated);

    render(
      <ConversationHeaderMenu
        conversation={buildConversation()}
        sessionName="sessao-1"
        onUpdated={onUpdated}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Marcar como não lida' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx jest --testPathPattern "ConversationHeaderMenu"`

Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar a estrutura básica (Atualizar + Marcar como não lida)**

Criar `apps/dashboard/components/ConversationHeaderMenu.tsx`:

```typescript
import { useState } from 'react';
import { useRouter } from 'next/router';
import {
  RefreshCw,
  MailOpen,
  Tag,
  UserPlus,
  Kanban,
  BotOff,
  Archive,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ConversationTagPicker from './ConversationTagPicker';
import SaveContactButton from './SaveContactButton';
import { toast } from '@/components/ui/use-toast';
import {
  markConversationAsUnread,
  archiveConversation,
  deleteConversation,
  ClientApiError,
  type ConversationSummary,
} from '@/lib/clientApi';

interface ConversationHeaderMenuProps {
  conversation: ConversationSummary;
  sessionName: string;
  onUpdated: (conversation: ConversationSummary) => void;
  onRefresh: () => void;
}

/**
 * Menu "⋮" do cabeçalho da conversa (2026-08-29) — substitui o antigo botão
 * isolado de "Atualizar" (`RefreshCw`). Consolida ações que hoje já existem
 * espalhadas (`ConversationTagPicker`/`SaveContactButton` no painel lateral;
 * `updateConversationStage`/`setConversationExcludedFromPipeline` só
 * acessíveis arrastando o card no board de Pipeline) + 3 ações novas
 * (marcar como não lida, arquivar, excluir).
 *
 * "Ativar Não Cliente" reaproveita `setConversationExcludedFromPipeline` —
 * o ADR #96 (que removeu um toggle equivalente daqui) não se aplica mais:
 * o estado resultante (`excludedFromPipeline: true`) já é visível/reversível
 * na coluna "Não cliente" do board de Pipeline, este item só é mais um ponto
 * de entrada para o MESMO estado, nunca "esconde sem lugar pra achar depois".
 */
export default function ConversationHeaderMenu({
  conversation,
  sessionName,
  onUpdated,
  onRefresh,
}: ConversationHeaderMenuProps): JSX.Element {
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleMarkUnread(): Promise<void> {
    setPending(true);
    try {
      const updated = await markConversationAsUnread(conversation.id);
      onUpdated(updated);
      toast({ variant: 'success', title: 'Marcada como não lida' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Não foi possível marcar como não lida',
        description: 'Tente novamente.',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Mais ações"
            disabled={pending}
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <button type="button" className="gap-2" onClick={onRefresh}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Atualizar
            </button>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button type="button" className="gap-2" onClick={() => void handleMarkUnread()}>
              <MailOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Marcar como não lida
            </button>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button type="button" className="gap-2" onClick={() => setTagDialogOpen(true)}>
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              Adicionar Etiqueta
            </button>
          </DropdownMenuItem>
          <SaveContactButton
            conversation={conversation}
            onUpdated={onUpdated}
            trigger={
              <DropdownMenuItem asChild>
                <span className="flex w-full cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] outline-none transition-colors focus:bg-muted">
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Salvar Contato
                </span>
              </DropdownMenuItem>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Etiquetas</DialogTitle>
            <DialogDescription>Adicione ou remova etiquetas desta conversa.</DialogDescription>
          </DialogHeader>
          <ConversationTagPicker
            sessionName={sessionName}
            conversationId={conversation.id}
            tags={conversation.tags}
            onChange={(tags) => onUpdated({ ...conversation, tags })}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
```

> **Atenção (mesma preocupação já resolvida em `CampaignsPanel.tsx`):** `SaveContactButton` com `trigger` sendo um `<DropdownMenuItem asChild><span>...</span></DropdownMenuItem>` funciona porque `SaveContactButton` envolve o `trigger` recebido num `<span onClick={...}>` (Task 9) — o clique ainda abre o Dialog interno do `SaveContactButton`, o `asChild` do `DropdownMenuItem` só precisa de UM elemento filho válido (o `<span>` já cumpre isso). Se ao rodar os testes isso não fechar o menu corretamente ou o clique não disparar, ajuste substituindo o `<span>` por um `<button type="button">` dentro do item (mesmo texto/ícone) — mais alinhado ao padrão dos outros itens — e teste de novo antes de prosseguir.

- [ ] **Step 5: Rodar e confirmar que os 3 primeiros testes passam**

Run: `npx jest --testPathPattern "ConversationHeaderMenu"`

Expected: os 3 testes do Step 2 passando (os itens "Mudar estágio da pipeline"/"Ativar Não Cliente"/"Arquivar"/"Excluir" ainda vão falhar por não existirem — normal, próximos passos adicionam).

- [ ] **Step 6: Escrever os testes que faltam (estágio, não-cliente, arquivar, excluir)**

Adicionar ao mesmo arquivo de teste:

```typescript
  it('"Mudar estágio da pipeline" mostra os 5 estágios e chama a API ao escolher um', async () => {
    const onUpdated = jest.fn();
    const updated = buildConversation({ stage: 'contacted' });
    (clientApi.updateConversationStage as jest.Mock).mockResolvedValue(updated);

    render(
      <ConversationHeaderMenu
        conversation={buildConversation()}
        sessionName="sessao-1"
        onUpdated={onUpdated}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Mudar estágio da pipeline' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Contatado' }));

    await waitFor(() =>
      expect(clientApi.updateConversationStage).toHaveBeenCalledWith('conv-1', 'contacted'),
    );
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });

  it('"Ativar Não Cliente" pede confirmação, explica o efeito, e chama a API ao confirmar', async () => {
    const onUpdated = jest.fn();
    const updated = buildConversation({ excludedFromPipeline: true });
    (clientApi.setConversationExcludedFromPipeline as jest.Mock).mockResolvedValue(updated);

    render(
      <ConversationHeaderMenu
        conversation={buildConversation()}
        sessionName="sessao-1"
        onUpdated={onUpdated}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ativar Não Cliente' }));

    expect(screen.getByText(/coluna "Não cliente" do Pipeline/i)).toBeInTheDocument();
    expect(clientApi.setConversationExcludedFromPipeline).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(clientApi.setConversationExcludedFromPipeline).toHaveBeenCalledWith('conv-1', true),
    );
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });

  it('"Arquivar" pede confirmação e chama a API ao confirmar', async () => {
    const onUpdated = jest.fn();
    const updated = buildConversation({ archived: true });
    (clientApi.archiveConversation as jest.Mock).mockResolvedValue(updated);

    render(
      <ConversationHeaderMenu
        conversation={buildConversation()}
        sessionName="sessao-1"
        onUpdated={onUpdated}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Arquivar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(clientApi.archiveConversation).toHaveBeenCalledWith('conv-1', true),
    );
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });

  it('"Excluir": botão de confirmar fica desabilitado até digitar o nome do contato', () => {
    render(
      <ConversationHeaderMenu
        conversation={buildConversation({ contactName: 'Cliente Teste' })}
        sessionName="sessao-1"
        onUpdated={() => {}}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));

    const confirmButton = screen.getByRole('button', { name: 'Excluir definitivamente' });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/digite.*Cliente Teste/i), {
      target: { value: 'Cliente Teste' },
    });
    expect(confirmButton).not.toBeDisabled();
  });

  it('"Excluir" confirmado: chama a API e redireciona para a lista de conversas', async () => {
    const push = jest.fn();
    jest.spyOn(require('next/router'), 'useRouter').mockReturnValue({ push });
    (clientApi.deleteConversation as jest.Mock).mockResolvedValue(undefined);

    render(
      <ConversationHeaderMenu
        conversation={buildConversation({ contactName: 'Cliente Teste' })}
        sessionName="sessao-1"
        onUpdated={() => {}}
        onRefresh={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    fireEvent.change(screen.getByLabelText(/digite.*Cliente Teste/i), {
      target: { value: 'Cliente Teste' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir definitivamente' }));

    await waitFor(() => expect(clientApi.deleteConversation).toHaveBeenCalledWith('conv-1'));
    expect(push).toHaveBeenCalledWith(`/sessions/${encodeURIComponent('sessao-1')}/conversations`);
  });
```

> Ajuste o mock de `next/router` para o padrão já usado em outros testes de componente deste projeto que navegam programaticamente (procure um exemplo existente com `jest.mock('next/router', ...)` antes de escrever este mock do zero).

- [ ] **Step 7: Rodar e confirmar que falham**

Run: `npx jest --testPathPattern "ConversationHeaderMenu"`

Expected: os novos testes FAIL (submenu de estágio, diálogos de não-cliente/arquivar/excluir ainda não existem).

- [ ] **Step 8: Implementar os 4 itens restantes**

Adicionar ao componente (dentro do `DropdownMenuContent`, depois do item "Salvar Contato", e os `Dialog`s correspondentes depois do `Dialog` de tags já existente):

```typescript
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <DropdownMenuItem
                asChild
                onSelect={(event) => event.preventDefault()}
              >
                <button type="button" className="gap-2">
                  <Kanban className="h-3.5 w-3.5" aria-hidden="true" />
                  Mudar estágio da pipeline
                </button>
              </DropdownMenuItem>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              {STAGE_OPTIONS.map(({ value, label }) => (
                <DropdownMenuItem key={value} asChild>
                  <button type="button" onClick={() => void handleUpdateStage(value)}>
                    {label}
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenuItem asChild>
            <button type="button" className="gap-2" onClick={() => setNotClientDialogOpen(true)}>
              <BotOff className="h-3.5 w-3.5" aria-hidden="true" />
              Ativar Não Cliente
            </button>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button type="button" className="gap-2" onClick={() => setArchiveDialogOpen(true)}>
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              Arquivar
            </button>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button
              type="button"
              className="gap-2 text-destructive focus:bg-destructive/10"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Excluir
            </button>
          </DropdownMenuItem>
```

Adicionar as constantes/estado/handlers no topo do componente:

```typescript
const STAGE_OPTIONS: { value: 'new' | 'contacted' | 'negotiating' | 'closed_won' | 'closed_lost'; label: string }[] = [
  { value: 'new', label: 'Novo' },
  { value: 'contacted', label: 'Contatado' },
  { value: 'negotiating', label: 'Negociando' },
  { value: 'closed_won', label: 'Ganho' },
  { value: 'closed_lost', label: 'Perdido' },
];
```

```typescript
  const router = useRouter();
  const [notClientDialogOpen, setNotClientDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const contactDisplayName = conversation.savedContactName ?? conversation.contactName ?? conversation.contactJid;

  async function handleUpdateStage(
    stage: 'new' | 'contacted' | 'negotiating' | 'closed_won' | 'closed_lost',
  ): Promise<void> {
    setPending(true);
    try {
      const updated = await updateConversationStage(conversation.id, stage);
      onUpdated(updated);
      toast({ variant: 'success', title: 'Estágio atualizado' });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível mudar o estágio' });
    } finally {
      setPending(false);
    }
  }

  async function handleConfirmNotClient(): Promise<void> {
    setPending(true);
    try {
      const updated = await setConversationExcludedFromPipeline(conversation.id, true);
      onUpdated(updated);
      setNotClientDialogOpen(false);
      toast({ variant: 'success', title: 'Marcada como Não Cliente' });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível marcar como Não Cliente' });
    } finally {
      setPending(false);
    }
  }

  async function handleConfirmArchive(): Promise<void> {
    setPending(true);
    try {
      const updated = await archiveConversation(conversation.id, true);
      onUpdated(updated);
      setArchiveDialogOpen(false);
      toast({ variant: 'success', title: 'Conversa arquivada' });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível arquivar' });
    } finally {
      setPending(false);
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    setPending(true);
    try {
      await deleteConversation(conversation.id);
      toast({ variant: 'success', title: 'Conversa excluída' });
      await router.push(`/sessions/${encodeURIComponent(sessionName)}/conversations`);
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível excluir' });
      setPending(false);
    }
  }
```

E os 3 `Dialog`s novos (depois do `Dialog` de tags):

```typescript
      <Dialog open={notClientDialogOpen} onOpenChange={setNotClientDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como Não Cliente?</DialogTitle>
            <DialogDescription>
              A IA para de responder automaticamente e a conversa é movida para a coluna "Não
              cliente" do Pipeline — nunca some, você acha ela lá quando quiser reverter.
            </DialogDescription>
          </DialogHeader>
          <Button type="button" disabled={pending} onClick={() => void handleConfirmNotClient()}>
            Confirmar
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arquivar esta conversa?</DialogTitle>
            <DialogDescription>
              Some da lista principal de Conversas, mas nada é apagado — pode ser encontrada de
              volta no filtro "Arquivadas" a qualquer momento.
            </DialogDescription>
          </DialogHeader>
          <Button type="button" disabled={pending} onClick={() => void handleConfirmArchive()}>
            Confirmar
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeleteConfirmText('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir esta conversa?</DialogTitle>
            <DialogDescription>
              Ação DEFINITIVA — apaga o histórico de mensagens de verdade, sem desfazer. Para
              confirmar, digite o nome exibido "{contactDisplayName}".
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="delete-confirm-text" className="sr-only">
            {`Digite "${contactDisplayName}" para confirmar`}
          </label>
          <input
            id="delete-confirm-text"
            value={deleteConfirmText}
            onChange={(event) => setDeleteConfirmText(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button
            type="button"
            variant="destructive"
            disabled={pending || deleteConfirmText !== contactDisplayName}
            onClick={() => void handleConfirmDelete()}
          >
            Excluir definitivamente
          </Button>
        </DialogContent>
      </Dialog>
```

E os imports novos no topo: `useRouter` (`next/router`), `updateConversationStage`, `setConversationExcludedFromPipeline` (de `@/lib/clientApi`).

> O submenu de estágio usa `<DropdownMenu>` ANINHADO (um `DropdownMenu` dentro de um `DropdownMenuItem` do menu externo) — o `onSelect={(event) => event.preventDefault()}` no item externo evita que selecionar o item de abertura feche o menu inteiro antes do submenu abrir. Se isso não funcionar como esperado ao rodar os testes (o Radix pode exigir um componente `DropdownMenuSub` dedicado em vez de aninhar dois `DropdownMenu` independentes), troque para a API de submenu nativa do Radix (`DropdownMenuPrimitive.Sub`/`SubTrigger`/`SubContent`) — adicione esses 3 exports em `components/ui/dropdown-menu.tsx` (mesmo padrão de wrapper já usado para `Content`/`Item`) antes de usá-los aqui.

- [ ] **Step 9: Rodar e confirmar que todos os testes passam**

Run: `npx jest --testPathPattern "ConversationHeaderMenu"`

Expected: PASS — todos os testes do arquivo.

- [ ] **Step 10: Verificar tipos**

Run: `npx tsc --noEmit -p apps/dashboard`

Expected: limpo.

- [ ] **Step 11: Commit**

```bash
git add apps/dashboard/components/ConversationHeaderMenu.tsx apps/dashboard/tests-jsdom/components/ConversationHeaderMenu.test.tsx
git commit -m "feat(conversations): add ConversationHeaderMenu with 8 actions"
```

---

### Task 11: Integrar no `ConversationDetailPanel.tsx`

**Files:**
- Modify: `apps/dashboard/components/ConversationDetailPanel.tsx`
- Test: `apps/dashboard/tests-jsdom/components/ConversationDetailPanel.test.tsx` (se existir; senão, criar cobertura mínima)

**Interfaces:**
- Consumes: `ConversationHeaderMenu` (Task 10).

- [ ] **Step 1: Escrever o teste que falha**

Se já existir um arquivo de teste para `ConversationDetailPanel.tsx`, adicionar:

```typescript
  it('cabeçalho mostra o menu "⋮" no lugar do antigo botão de atualizar isolado', () => {
    // ... setup já existente do arquivo (mocks de hooks, render) ...
    expect(screen.getByRole('button', { name: 'Mais ações' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar conversa' })).not.toBeInTheDocument();
  });
```

Se NÃO existir arquivo de teste para este componente ainda, pule este Step (não é obrigatório criar cobertura nova de um componente grande e já não testado nesta rodada — fora do escopo do plano) e vá direto para o Step 2.

- [ ] **Step 2: Trocar o botão pelo menu novo**

Em `apps/dashboard/components/ConversationDetailPanel.tsx`, adicionar o import:

```typescript
import ConversationHeaderMenu from './ConversationHeaderMenu';
```

E trocar:

```typescript
        <button
          type="button"
          title="Atualizar"
          aria-label="Atualizar conversa"
          onClick={refresh}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
```

por:

```typescript
        <ConversationHeaderMenu
          conversation={conversation}
          sessionName={sessionName}
          onUpdated={applyUpdate}
          onRefresh={refresh}
        />
```

E remover o import agora não usado (`RefreshCw`, se não for usado em mais nenhum lugar do arquivo — confirme com uma busca antes de remover).

- [ ] **Step 3: Rodar os testes (se existirem) e o `tsc`**

Run: `npx jest --testPathPattern "ConversationDetailPanel"` (se o arquivo existir) — Expected: PASS.
Run: `npx tsc --noEmit -p apps/dashboard` — Expected: limpo.
Run: `cd apps/dashboard && ESLINT_USE_FLAT_CONFIG=false npx eslint components/ConversationDetailPanel.tsx components/ConversationHeaderMenu.tsx --ext .ts,.tsx` — Expected: limpo (nenhum import não usado).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/components/ConversationDetailPanel.tsx apps/dashboard/tests-jsdom/components/ConversationDetailPanel.test.tsx
git commit -m "feat(conversations): wire ConversationHeaderMenu into ConversationDetailPanel header"
```

---

### Task 12: Verificação final

**Files:**
- Nenhum arquivo novo — só verificação.

- [ ] **Step 1: Suíte completa**

Run: `npx jest --testPathPattern "api"` e `npx jest --testPathPattern "dashboard"`

Expected: nenhuma regressão fora dos arquivos tocados por este plano (as 2 falhas pré-existentes já conhecidas, `ConversationAiService.test.ts` e `AiProfilePanel.test.tsx`, continuam sendo as únicas, se ainda existirem).

- [ ] **Step 2: `tsc`/`eslint` no projeto inteiro**

Run: `npx tsc --noEmit -p apps/api && npx tsc --noEmit -p apps/dashboard`
Run: `cd apps/api && npx eslint src/services/conversations src/services/auth/domain/permissions.ts --ext .ts`
Run: `cd apps/dashboard && ESLINT_USE_FLAT_CONFIG=false npx eslint components/ConversationHeaderMenu.tsx components/ConversationDetailPanel.tsx components/SaveContactButton.tsx components/ConversationInbox.tsx components/ConversationFilterTabs.tsx hooks/useConversationsList.ts lib/clientApi.ts --ext .ts,.tsx`

Expected: tudo limpo.

- [ ] **Step 3: Verificação manual no navegador**

Rebuild + restart dos containers `api`/`dashboard`, abrir uma conversa qualquer na Dashboard, clicar no menu "⋮" e conferir visualmente: os 8 itens aparecem, "Atualizar" funciona, "Marcar como não lida" acende o indicador na lista ao lado, "Adicionar Etiqueta" abre o mesmo seletor de sempre, "Salvar Contato" abre o mesmo diálogo de sempre, "Mudar estágio" mostra o submenu de 5 estágios, "Ativar Não Cliente" explica o efeito antes de confirmar e a conversa aparece na coluna certa do Pipeline depois, "Arquivar" some a conversa da lista (e ela aparece no filtro "Arquivadas"), "Excluir" só habilita o botão depois do nome certo digitado e some a conversa de vez depois de confirmar.

- [ ] **Step 4: Reportar ao usuário**

Resumir o que foi implementado, os testes que passaram, terminar com "Sem commit [do merge final] — aguardando sua autorização", mesmo padrão do resto da sessão.
