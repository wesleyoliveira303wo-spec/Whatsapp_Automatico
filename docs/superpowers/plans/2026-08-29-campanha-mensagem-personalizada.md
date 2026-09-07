# Campanha com Mensagem Personalizada por Lead — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

> ## ✅ STATUS: IMPLEMENTADO E VERIFICADO — 2026-09-05
>
> Este plano **já foi executado**. Verificação feita em 2026-09-05 contra o
> código em produção:
>
> - **Arquivos novos (11/11 presentes):** migration
>   `20260829130000_add_campaign_recipient_personalized_message`,
>   `EnrichedLead.ts`, `parseEnrichedLeadsCsv.ts`, `pickMessageVariation.ts`,
>   `buildLeadMessagePrompt.ts`, `LeadMessageGenerationUnavailableError.ts`,
>   `GenerateLeadMessagesService.ts` + os 4 arquivos de teste.
> - **Modificações (15/15 aplicadas):** `personalizedMessage` no schema/entidade/
>   port/`recipientSources`/`CampaignService`/`PrismaCampaignRepository`/
>   `CampaignSendJobProcessor`/`compositionRoot`; endpoint
>   `POST .../campaigns/leads/generate-messages` montado em `campaignsRouter.ts`;
>   `LeadMessageGenerationUnavailableError` (503) tratado em
>   `campaignsErrorHandler.ts`; `summaryAiProvider` injetado em `index.ts`.
> - **Migration aplicada** ao Postgres local (tabela `_prisma_migrations`).
> - **`tsc --noEmit` limpo** para `apps/api`.
> - **174 testes verdes** nas 7 suítes do bounded context de campanhas.
>
> As caixas `- [x]` abaixo foram marcadas em bloco nesta verificação — não
> durante a execução original (a sessão que rodou o plano não as marcou).
> **Fora de escopo e NÃO feito:** tela de revisão na Dashboard, pipeline de
> enriquecimento automático, provider de IA por tenant (ver seção final).
>
> Mantido no repositório como registro de decisão arquitetural — o "porquê"
> de `personalizedMessage` ser uma coluna em `CampaignRecipient` e não uma
> entidade separada.

---

**Goal:** Permitir que uma campanha do motor existente (`services/campaigns`) envie um texto DIFERENTE por destinatário — gerado por IA a partir de uma planilha de leads enriquecidos (dor principal, gatilho de prova social, tom, ganchos de abertura, CTA) — sem perder nenhuma das proteções já testadas do motor (ritmo/jitter, janela de horário, disjuntor de segurança, supressão por opt-out/conversa ativa/recontato).

**Architecture:** Adiciona uma coluna opcional `personalizedMessage` em `CampaignRecipient` que, quando presente, substitui `Campaign.messageTemplate` só para aquele destinatário — a campanha continua sendo UMA só, com N destinatários, então todo o motor de ritmo/disjuntor funciona sem nenhuma mudança (o índice de `computeSendDelayMs` continua contando os N destinatários da mesma campanha, não campanhas separadas). A geração do texto é uma etapa NOVA, ANTES da criação da campanha: um serviço de aplicação (`GenerateLeadMessagesService`) recebe leads já enriquecidos (mesmo formato usado manualmente em `leads-prospeccao-google-maps/`), escolhe deterministicamente (função pura, sem IA) um gancho de abertura e um "esqueleto" estrutural por lead — para garantir a variação real exigida pelo playbook sem depender de o modelo "lembrar" de variar — e só então chama a IA (reaproveitando o port `AiProvider` já existente) para escrever o texto final daquele esqueleto. O resultado (rascunhos) NUNCA é persistido sozinho — o operador aprova e manda os textos junto com `phoneRecipients` na criação da campanha, exatamente como já acontece hoje com `messageTemplate`.

**Tech Stack:** TypeScript, Express, Prisma/Postgres, Zod, Jest — mesmo stack de `services/campaigns` e `services/ai` já existentes. Reaproveita o port `AiProvider` (`services/ai/domain/providers/AiProvider.ts`) — nenhum SDK novo.

## Global Constraints

- Nunca alterar o comportamento de uma campanha SEM `personalizedMessage` — todo destinatário sem esse campo continua recebendo `messageTemplate`, byte a byte como hoje (nenhuma regressão no fluxo síncrono existente).
- Mensagem 1 gerada pela IA NUNCA contém oferta/CTA de venda — sempre termina em pergunta aberta ou reticências (Seção 5 do playbook).
- Nunca inventar dado: se um lead não tem `googleRating`/`reviewCount` (ex.: `reviewCount === 0`), a mensagem gerada NUNCA cita nota ou quantidade de avaliações.
- Nunca usar a frase literal "vocês não têm site" (ou equivalente) — sempre reformular como oportunidade/curiosidade.
- Escopo desta rodada é só a API (schema + serviço de geração + endpoints). A tela de revisão visual na Dashboard fica **fora de escopo** — o formato CSV/JSON de leads enriquecidos já documentado em `leads-prospeccao-google-maps/PLAYBOOK_IA_WHATSAPP.md` é o contrato de entrada; revisão humana acontece fora do produto por ora (planilha), igual ao que já foi validado manualmente nesta mesma sessão.
- Todo código novo em português nos comentários/nomes de domínio que já são em português (`messageTemplate`, `personalizedMessage` ficam em inglês por seguirem o campo `messageTemplate` já existente, que é em inglês) — seguir exatamente a mistura idiomática já usada no arquivo que cada task edita.

---

## Mapa de arquivos

**Migration:**
- Criar: `prisma/migrations/20260829130000_add_campaign_recipient_personalized_message/migration.sql`
- Modificar: `prisma/schema.prisma` (model `CampaignRecipient`)

**Domain (`apps/api/src/services/campaigns/domain/`):**
- Modificar: `entities/Campaign.ts` (campo novo em `CampaignRecipient`)
- Modificar: `repositories/CampaignRepository.ts` (campo novo em `CampaignRecipientDraft`)
- Modificar: `policies/recipientSources.ts` (campo novo em `RawPhoneRecipient`)
- Criar: `entities/EnrichedLead.ts`
- Criar: `policies/parseEnrichedLeadsCsv.ts`
- Criar: `policies/pickMessageVariation.ts`
- Criar: `policies/buildLeadMessagePrompt.ts`
- Criar: `errors/LeadMessageGenerationUnavailableError.ts`

**Application:**
- Modificar: `apps/api/src/services/campaigns/application/CampaignService.ts` (repassar `personalizedMessage`)
- Criar: `apps/api/src/services/campaigns/application/GenerateLeadMessagesService.ts`

**Infrastructure:**
- Modificar: `apps/api/src/services/campaigns/infrastructure/repositories/PrismaCampaignRepository.ts`
- Modificar: `apps/api/src/services/campaigns/infrastructure/CampaignSendJobProcessor.ts`
- Modificar: `apps/api/src/services/campaigns/compositionRoot.ts`

**Presentation:**
- Modificar: `apps/api/src/services/campaigns/presentation/campaignsRouter.ts`
- Modificar: `apps/api/src/services/campaigns/presentation/campaignsErrorHandler.ts`

**index.ts:**
- Modificar: `apps/api/src/index.ts` (injeta `summaryAiProvider` já existente no novo serviço)

**Tests:**
- Criar: `apps/api/tests/services/campaigns/domain/parseEnrichedLeadsCsv.test.ts`
- Criar: `apps/api/tests/services/campaigns/domain/pickMessageVariation.test.ts`
- Criar: `apps/api/tests/services/campaigns/domain/buildLeadMessagePrompt.test.ts`
- Criar: `apps/api/tests/services/campaigns/application/GenerateLeadMessagesService.test.ts`
- Modificar: `apps/api/tests/services/campaigns/application/CampaignService.test.ts`
- Modificar: `apps/api/tests/services/campaigns/infrastructure/CampaignSendJobProcessor.test.ts`
- Modificar: `apps/api/tests/services/campaigns/presentation/campaignsRouter.test.ts`
- Modificar: `apps/api/tests/services/campaigns/infrastructure/FakeCampaignRepository.ts`

---

### Task 1: Migration + schema + entidade de domínio (`personalizedMessage`)

**Files:**
- Create: `prisma/migrations/20260829130000_add_campaign_recipient_personalized_message/migration.sql`
- Modify: `prisma/schema.prisma:434-443` (model `CampaignRecipient`)
- Modify: `apps/api/src/services/campaigns/domain/entities/Campaign.ts:68-105` (interface `CampaignRecipient`)

**Interfaces:**
- Produces: `CampaignRecipient.personalizedMessage?: string` — usado pelas Tasks 2-5.

- [x] **Step 1: Criar a migration**

```sql
-- Campanha com mensagem personalizada por lead (2026-08-29): quando
-- presente, este texto substitui `Campaign.messageTemplate` só para este
-- destinatário — ver docstring de `CampaignSendJobProcessor.process`.
ALTER TABLE "campaign_recipients" ADD COLUMN "personalized_message" TEXT;
```

Salvar em `prisma/migrations/20260829130000_add_campaign_recipient_personalized_message/migration.sql`.

- [x] **Step 2: Adicionar o campo no schema Prisma**

Em `prisma/schema.prisma`, dentro de `model CampaignRecipient`, logo abaixo do campo `name`:

```prisma
  /// Fase de Prospecção IA (2026-08-29) — quando presente, substitui
  /// `Campaign.messageTemplate` SÓ para este destinatário (ver
  /// `CampaignSendJobProcessor.process`). Gerado por
  /// `GenerateLeadMessagesService` a partir de um lead enriquecido
  /// (dor/gatilho/tom/ganchos/CTA) — nunca escrito à mão pelo operador.
  personalizedMessage String? @db.Text @map("personalized_message")
```

- [x] **Step 3: Aplicar a migration e regenerar o client Prisma**

Run: `docker compose exec -T api npx prisma migrate deploy && docker compose exec -T api npx prisma generate`

Expected: migration `20260829130000_add_campaign_recipient_personalized_message` aplicada sem erro; `npx tsc --noEmit -p apps/api` continua limpo (o client Prisma agora conhece a coluna).

- [x] **Step 4: Adicionar o campo na entidade de domínio**

Em `apps/api/src/services/campaigns/domain/entities/Campaign.ts`, dentro de `interface CampaignRecipient`, logo abaixo de `name?: string;`:

```typescript
  /**
   * Fase de Prospecção IA (2026-08-29) — quando presente, o envio real
   * (`CampaignSendJobProcessor`) usa ESTE texto em vez de
   * `Campaign.messageTemplate` para este destinatário. `undefined` =
   * comportamento de sempre (usa o template da campanha).
   */
  personalizedMessage?: string;
```

- [x] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260829130000_add_campaign_recipient_personalized_message apps/api/src/services/campaigns/domain/entities/Campaign.ts
git commit -m "feat(campaigns): add personalizedMessage column to CampaignRecipient"
```

---

### Task 2: Repositório — `CampaignRecipientDraft` + Prisma read/write

**Files:**
- Modify: `apps/api/src/services/campaigns/domain/repositories/CampaignRepository.ts:28-34`
- Modify: `apps/api/src/services/campaigns/infrastructure/repositories/PrismaCampaignRepository.ts:136-151,192-213,342-362`
- Test: `apps/api/tests/services/campaigns/infrastructure/FakeCampaignRepository.ts` (ajustar o fake, sem arquivo de teste próprio — a cobertura vem das Tasks 4 e 6)

**Interfaces:**
- Consumes: `CampaignRecipient.personalizedMessage?: string` (Task 1).
- Produces: `CampaignRecipientDraft.personalizedMessage?: string` — usado pela Task 4 (`CampaignService.createCampaign`).

- [x] **Step 1: Adicionar o campo em `CampaignRecipientDraft`**

Em `apps/api/src/services/campaigns/domain/repositories/CampaignRepository.ts`, dentro de `interface CampaignRecipientDraft`:

```typescript
export interface CampaignRecipientDraft {
  contactId?: string;
  phoneE164?: string;
  name?: string;
  /** Fase de Prospecção IA (2026-08-29) — ver `CampaignRecipient.personalizedMessage`. */
  personalizedMessage?: string;
  status: 'pending' | 'skipped';
  skipReason?: string;
}
```

- [x] **Step 2: Ler o campo em `PrismaCampaignRepository`**

Em `PrismaCampaignRepository.ts`, adicionar ao `interface CampaignRecipientRow` (logo abaixo de `name: string | null;`):

```typescript
  personalizedMessage: string | null;
```

Em `recipientToDomain`, adicionar ao objeto devolvido (logo abaixo de `name: row.name ?? undefined,`):

```typescript
    personalizedMessage: row.personalizedMessage ?? undefined,
```

- [x] **Step 3: Persistir o campo em `createRecipients`**

Em `PrismaCampaignRepository.createRecipients`, dentro do `data: recipients.map(...)`, adicionar (logo abaixo de `name: recipient.name ?? null,`):

```typescript
        personalizedMessage: recipient.personalizedMessage ?? null,
```

- [x] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit -p apps/api`

Expected: sem erros (o Prisma Client já foi regenerado na Task 1, `campaignRecipient.createMany`/`findMany`/`findFirst` sem `select` explícito já devolvem a coluna nova automaticamente).

- [x] **Step 5: Commit**

```bash
git add apps/api/src/services/campaigns/domain/repositories/CampaignRepository.ts apps/api/src/services/campaigns/infrastructure/repositories/PrismaCampaignRepository.ts
git commit -m "feat(campaigns): thread personalizedMessage through CampaignRepository"
```

---

### Task 3: `CampaignSendJobProcessor` usa `personalizedMessage` quando presente

**Files:**
- Modify: `apps/api/src/services/campaigns/infrastructure/CampaignSendJobProcessor.ts:104-110`
- Test: `apps/api/tests/services/campaigns/infrastructure/CampaignSendJobProcessor.test.ts`

**Interfaces:**
- Consumes: `CampaignRecipient.personalizedMessage?: string` (Task 1).

- [x] **Step 1: Escrever o teste que falha**

Em `apps/api/tests/services/campaigns/infrastructure/CampaignSendJobProcessor.test.ts`, adicionar (seguindo o padrão dos testes já existentes no arquivo — mesmo `FakeCampaignRepository`/`FakeCampaignMessageSender` já importados):

```typescript
  it('usa CampaignRecipient.personalizedMessage no lugar de Campaign.messageTemplate, quando presente', async () => {
    const { processor, repository, sender, campaign, recipient } = setUp({
      recipientOverrides: { personalizedMessage: 'Mensagem só deste lead, gerada pela IA.' },
    });

    await processor.process({
      tenantId: campaign.tenantId,
      campaignId: campaign.id,
      recipientId: recipient.id,
    });

    expect(sender.sendCalls).toHaveLength(1);
    expect(sender.sendCalls[0].messageTemplate).toBe('Mensagem só deste lead, gerada pela IA.');
  });
```

> Se `setUp()` ainda não aceitar `recipientOverrides`, ajuste sua assinatura (função de teste local do arquivo) para mesclar `recipientOverrides` no destinatário `PENDING` criado por padrão — sem duplicar a função, só estendendo o parâmetro já usado pelos outros `it(...)` do mesmo arquivo.

- [x] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --testPathPattern "CampaignSendJobProcessor" -t "personalizedMessage"`

Expected: FAIL — `sender.sendCalls[0].messageTemplate` ainda é o `messageTemplate` da campanha, não o texto do destinatário.

- [x] **Step 3: Implementar**

Em `CampaignSendJobProcessor.process`, trocar:

```typescript
    const result = await this.campaignMessageSender.send(
      data.tenantId,
      campaign.sessionName,
      { contactId: recipient.contactId, phoneE164: recipient.phoneE164, name: recipient.name },
      campaign.messageTemplate,
      media,
    );
```

por:

```typescript
    // Fase de Prospecção IA (2026-08-29) — um destinatário com
    // `personalizedMessage` (gerado por `GenerateLeadMessagesService` a
    // partir de um lead enriquecido) recebe ESSE texto; sem ele, o
    // comportamento é o de sempre (`campaign.messageTemplate`, igual para
    // todos os destinatários da campanha).
    const messageToSend = recipient.personalizedMessage ?? campaign.messageTemplate;
    const result = await this.campaignMessageSender.send(
      data.tenantId,
      campaign.sessionName,
      { contactId: recipient.contactId, phoneE164: recipient.phoneE164, name: recipient.name },
      messageToSend,
      media,
    );
```

- [x] **Step 4: Rodar e confirmar que passa**

Run: `npx jest --testPathPattern "CampaignSendJobProcessor"`

Expected: PASS — todos os testes do arquivo, incluindo o novo.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/services/campaigns/infrastructure/CampaignSendJobProcessor.ts apps/api/tests/services/campaigns/infrastructure/CampaignSendJobProcessor.test.ts
git commit -m "feat(campaigns): send per-recipient personalized message when present"
```

---

### Task 4: `CampaignService.createCampaign` repassa `personalizedMessage`

**Files:**
- Modify: `apps/api/src/services/campaigns/domain/policies/recipientSources.ts:19-22`
- Modify: `apps/api/src/services/campaigns/application/CampaignService.ts:54-65,137-238`
- Test: `apps/api/tests/services/campaigns/application/CampaignService.test.ts`

**Interfaces:**
- Consumes: `CampaignRecipientDraft.personalizedMessage?: string` (Task 2).
- Produces: `CreateCampaignInput.phoneRecipients[].personalizedMessage?: string` — usado pela Task 5 (router).

- [x] **Step 1: Adicionar o campo em `RawPhoneRecipient`**

Em `apps/api/src/services/campaigns/domain/policies/recipientSources.ts`:

```typescript
export interface RawPhoneRecipient {
  rawPhone: string;
  name?: string;
  /** Fase de Prospecção IA (2026-08-29) — ver `CampaignRecipient.personalizedMessage`. */
  personalizedMessage?: string;
}
```

- [x] **Step 2: Escrever o teste que falha**

Em `apps/api/tests/services/campaigns/application/CampaignService.test.ts`, adicionar (seguindo o padrão dos testes de `createCampaign` já existentes no arquivo, reaproveitando o `FakeCampaignRepository`/`tenantRepository` já montados no `beforeEach`/`setUp` local):

```typescript
  it('repassa personalizedMessage de um destinatário solto (planilha) até o destinatário materializado', async () => {
    const { service, repository, tenantId } = setUp();

    await service.createCampaign({
      tenantId,
      sessionName: 'sessao-1',
      name: 'Prospecção IA — lote 1',
      messageTemplate: 'Template genérico (não usado por quem tem personalizedMessage)',
      contactIds: [],
      phoneRecipients: [
        {
          rawPhone: '+55 21 98765-4321',
          name: 'Restaurante Exemplo',
          personalizedMessage: 'Mensagem única gerada pela IA para este lead.',
        },
      ],
    });

    const created = repository.createRecipientsCalls.at(-1)!;
    expect(created.recipients).toHaveLength(1);
    expect(created.recipients[0].personalizedMessage).toBe(
      'Mensagem única gerada pela IA para este lead.',
    );
  });
```

> `repository.createRecipientsCalls` é o array de chamadas que `FakeCampaignRepository.createRecipients` já registra (mesmo padrão dos outros testes deste arquivo) — confirmar o nome exato lendo `FakeCampaignRepository.ts` antes de escrever a asserção; se o fake ainda não registrar as chamadas dessa forma, é a Task 6 que ajusta o fake (ver abaixo), então esta task pode registrar a expectativa e seguir para lá antes do Step 4.

- [x] **Step 3: Rodar e confirmar que falha**

Run: `npx jest --testPathPattern "CampaignService" -t "personalizedMessage"`

Expected: FAIL — `created.recipients[0].personalizedMessage` é `undefined` (o serviço ainda não repassa o campo).

- [x] **Step 4: Implementar — threading em `createCampaign`**

Em `CampaignService.createCampaign`, o mapa `phoneToName` guarda hoje só `rawPhone → name`. Adicionar um segundo mapa paralelo e usá-lo nos dois pontos onde destinatários são montados (linha `looseDrafts` e a resolução de contato existente):

```typescript
    const phoneToName = new Map<string, string | undefined>();
    const phoneToPersonalizedMessage = new Map<string, string | undefined>();
    for (const recipient of input.phoneRecipients ?? []) {
      const phoneE164 = normalizePhoneToE164(recipient.rawPhone);
      if (!phoneE164 || phoneToName.has(phoneE164)) continue;
      phoneToName.set(phoneE164, recipient.name);
      phoneToPersonalizedMessage.set(phoneE164, recipient.personalizedMessage);
    }
```

Um telefone de planilha/manual que JÁ é um Contato conhecido vira `contactId` (não `phoneE164`/`name`) — sem um lugar para guardar `personalizedMessage` por `contactId`, esse texto seria perdido nesse caso raro (lead frio que por acaso já tem Contato salvo). Adicionar um terceiro mapa e usá-lo ao montar `contactDrafts`:

```typescript
    const looseRecipients: { phoneE164: string; name?: string }[] = [];
    const contactPersonalizedMessages = new Map<string, string>();
    for (const phone of phones) {
      const existingContactId = resolvedContactIds.get(phone);
      if (existingContactId) {
        contactIds.add(existingContactId);
        const personalizedMessage = phoneToPersonalizedMessage.get(phone);
        if (personalizedMessage) {
          contactPersonalizedMessages.set(existingContactId, personalizedMessage);
        }
      } else {
        looseRecipients.push({ phoneE164: phone, name: phoneToName.get(phone) });
      }
    }
```

E propagar nos dois pontos de montagem de draft:

```typescript
    const contactDrafts: CampaignRecipientDraft[] = contactIdList
      .filter((contactId) => eligibilityByContactId.has(contactId))
      .map((contactId) => {
        const eligibility = eligibilityByContactId.get(contactId)!;
        const skipReason = determineSkipReason(eligibility);
        const personalizedMessage = contactPersonalizedMessages.get(contactId);
        return skipReason
          ? { contactId, status: 'skipped' as const, skipReason }
          : { contactId, status: 'pending' as const, personalizedMessage };
      });

    const looseDrafts: CampaignRecipientDraft[] = looseRecipients.map((recipient) => ({
      phoneE164: recipient.phoneE164,
      name: recipient.name,
      personalizedMessage: phoneToPersonalizedMessage.get(recipient.phoneE164),
      status: 'pending' as const,
    }));
```

- [x] **Step 5: Rodar e confirmar que passa**

Run: `npx jest --testPathPattern "CampaignService"`

Expected: PASS — todos os testes do arquivo, incluindo o novo. Se falhar por `createRecipientsCalls` não existir no fake, ver Task 6 (mudar a ordem: aplicar a Task 6 primeiro é aceitável se o fake ainda não suportar o registro de chamadas).

- [x] **Step 6: Commit**

```bash
git add apps/api/src/services/campaigns/domain/policies/recipientSources.ts apps/api/src/services/campaigns/application/CampaignService.ts apps/api/tests/services/campaigns/application/CampaignService.test.ts
git commit -m "feat(campaigns): propagate personalizedMessage from phoneRecipients into recipient drafts"
```

---

### Task 5: Fake do repositório registra `personalizedMessage` (se necessário)

**Files:**
- Modify: `apps/api/tests/services/campaigns/infrastructure/FakeCampaignRepository.ts`

**Interfaces:**
- Consumes: `CampaignRecipientDraft.personalizedMessage?: string` (Task 2).
- Produces: `personalizedMessage` visível em `CampaignRecipient` devolvido por `findRecipientById`/`listPendingRecipients` do fake, e em qualquer array de chamadas que os testes das Tasks 3/4 leiam (`createRecipientsCalls` ou equivalente já existente no arquivo).

- [x] **Step 1: Ler o fake atual**

Abrir `apps/api/tests/services/campaigns/infrastructure/FakeCampaignRepository.ts` e localizar `createRecipients` — ele provavelmente guarda os destinatários materializados num array/Map interno (`this.recipients` ou similar) e também registra as chamadas cruas recebidas (para os testes de `CampaignService` inspecionarem o que foi enviado). Garantir que:

1. O objeto de destinatário guardado internamente (o que `findRecipientById`/`listPendingRecipients` devolvem) inclua `personalizedMessage: recipient.personalizedMessage`.
2. O array de chamadas cruas (usado pela asserção da Task 4) inclua os drafts completos, `personalizedMessage` incluso — sem filtrar campos.

Se o fake já copia o objeto `recipient` inteiro (spread `{ ...recipient }`) em ambos os lugares, nenhuma mudança de código é necessária além de conferir — os testes das Tasks 3/4 já passam porque o campo simplesmente atravessa. Só editar se o fake constrói o objeto campo a campo (sem spread), explicitando cada um.

- [x] **Step 2: Rodar toda a suíte de campanhas**

Run: `npx jest --testPathPattern "campaigns"`

Expected: PASS — nenhuma regressão nos testes já existentes (`CampaignService.test.ts`, `CampaignSendJobProcessor.test.ts`, `campaignsRouter.test.ts`, etc.), e os dois testes novos das Tasks 3/4 verdes.

- [x] **Step 3: Commit**

```bash
git add apps/api/tests/services/campaigns/infrastructure/FakeCampaignRepository.ts
git commit -m "test(campaigns): ensure FakeCampaignRepository carries personalizedMessage end to end"
```

---

### Task 6: Router aceita `personalizedMessage` em `phoneRecipients`

**Files:**
- Modify: `apps/api/src/services/campaigns/presentation/campaignsRouter.ts:38-41`
- Test: `apps/api/tests/services/campaigns/presentation/campaignsRouter.test.ts`

**Interfaces:**
- Consumes: `CreateCampaignInput.phoneRecipients[].personalizedMessage?: string` (Task 4).

- [x] **Step 1: Escrever o teste que falha**

Em `apps/api/tests/services/campaigns/presentation/campaignsRouter.test.ts`, seguindo o padrão dos testes de `POST /` já existentes (mesmo `request(app).post(...)` já usado no arquivo):

```typescript
  it('POST / aceita personalizedMessage em phoneRecipients e repassa ao CampaignService', async () => {
    const response = await request(app)
      .post(`/api/tenants/${tenantId}/campaigns`)
      .send({
        sessionName: 'sessao-1',
        name: 'Prospecção IA — lote 1',
        messageTemplate: 'Template genérico',
        contactIds: [],
        phoneRecipients: [
          {
            rawPhone: '+55 21 98765-4321',
            name: 'Restaurante Exemplo',
            personalizedMessage: 'Mensagem única gerada pela IA para este lead.',
          },
        ],
      });

    expect(response.status).toBe(201);
    const created = campaignRepository.createRecipientsCalls.at(-1)!;
    expect(created.recipients[0].personalizedMessage).toBe(
      'Mensagem única gerada pela IA para este lead.',
    );
  });
```

> Ajustar `campaignRepository`/`tenantId`/`app` para os nomes exatos já usados no `beforeEach` deste arquivo de teste — seguir o padrão dos testes de `POST /` vizinhos.

- [x] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --testPathPattern "campaignsRouter" -t "personalizedMessage"`

Expected: FAIL — Zod rejeita o corpo com `400` (campo desconhecido não está no schema) OU o campo é descartado silenciosamente antes de chegar ao serviço.

- [x] **Step 3: Implementar**

Em `campaignsRouter.ts`, adicionar ao `rawPhoneRecipientSchema`:

```typescript
const rawPhoneRecipientSchema = z.object({
  rawPhone: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  /** Fase de Prospecção IA (2026-08-29) — texto já aprovado pelo operador, gerado por `POST /leads/generate-messages`. */
  personalizedMessage: z.string().trim().min(1).max(4000).optional(),
});
```

(`body.phoneRecipients` já é repassado inteiro para `campaignService.createCampaign` na rota `POST /` — nenhuma outra mudança necessária nesse handler.)

- [x] **Step 4: Rodar e confirmar que passa**

Run: `npx jest --testPathPattern "campaignsRouter"`

Expected: PASS — todos os testes do arquivo.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/services/campaigns/presentation/campaignsRouter.ts apps/api/tests/services/campaigns/presentation/campaignsRouter.test.ts
git commit -m "feat(campaigns): accept personalizedMessage on POST /campaigns phoneRecipients"
```

---

### Task 7: `EnrichedLead` + `parseEnrichedLeadsCsv`

**Files:**
- Create: `apps/api/src/services/campaigns/domain/entities/EnrichedLead.ts`
- Create: `apps/api/src/services/campaigns/domain/policies/parseEnrichedLeadsCsv.ts`
- Test: `apps/api/tests/services/campaigns/domain/parseEnrichedLeadsCsv.test.ts`

**Interfaces:**
- Consumes: `parseCsv` de `apps/api/src/services/contacts/domain/csvParsing.ts` (já existe — assinatura `parseCsv(csvText: string): string[][]`, primeira linha é cabeçalho).
- Produces: `EnrichedLead` (tipo) e `parseEnrichedLeadsCsv(csvText: string): ParseEnrichedLeadsCsvResult` — consumidos pela Task 9 (`GenerateLeadMessagesService`) e pela Task 11 (router).

- [x] **Step 1: Definir o tipo `EnrichedLead`**

Criar `apps/api/src/services/campaigns/domain/entities/EnrichedLead.ts`:

```typescript
/**
 * Um lead de prospecção fria já enriquecido — mesmo formato usado
 * manualmente em `leads-prospeccao-google-maps/leads_prospeccao_whatsapp_ia.json`
 * (ver `PLAYBOOK_IA_WHATSAPP.md` da mesma pasta, Seção 3 — "Estrutura de
 * dados por lead"). Curado por humano/scraper FORA do produto nesta
 * rodada (ver Global Constraints do plano) — este tipo só formaliza o
 * contrato de entrada de `GenerateLeadMessagesService`.
 *
 * Todo campo aqui precisa ter vindo de uma fonte real (planilha) — nenhuma
 * regra deste bounded context pode inventar um valor para um campo
 * ausente (ver `buildLeadMessagePrompt`, que trata `googleRating`/
 * `reviewCount` ausentes como "não citar prova social", nunca como um
 * valor a adivinhar).
 */
export type LeadSiteStatus = 'Sem Site' | 'Apenas Redes Sociais' | 'Com Site';

export interface EnrichedLead {
  companyName: string;
  category: string;
  neighborhood: string;
  siteStatus: LeadSiteStatus;
  /** `undefined` = sem nota ainda (ex.: negócio recém-listado, 0 avaliações) — nunca inventar um número. */
  googleRating?: number;
  reviewCount: number;
  mainPainPoint: string;
  /** `undefined` só é esperado quando `reviewCount === 0` (nada ainda para citar como prova social). */
  socialProofTrigger?: string;
  recommendedTone: string;
  /** 2 ou mais opções — `pickMessageVariation` escolhe UM índice por lead, nunca todas. */
  openingHooks: string[];
  recommendedCta: string;
  /** Telefone bruto, ainda não normalizado (mesmo formato de `RawPhoneRecipient.rawPhone`). */
  rawPhone: string;
}
```

- [x] **Step 2: Escrever o teste do parser (falha primeiro)**

Criar `apps/api/tests/services/campaigns/domain/parseEnrichedLeadsCsv.test.ts`:

```typescript
import { parseEnrichedLeadsCsv } from '../../../../src/services/campaigns/domain/policies/parseEnrichedLeadsCsv';

const HEADER =
  'Nome da Empresa,Categoria,Bairro,Status do Site,Nota Google,Qtd Avaliações,Dor Principal Identificada,Gatilho de Prova Social,Tom Recomendado,Ganchos de Abertura,CTA Recomendado,Telefone';

describe('parseEnrichedLeadsCsv (Fase de Prospecção IA)', () => {
  it('parseia uma linha completa, com nota/avaliações e ganchos separados por |', () => {
    const csv = [
      HEADER,
      [
        'Adega Barril do Recreio',
        'Restaurante português',
        'Recreio dos Bandeirantes',
        'Sem Site',
        '4.3',
        '3096',
        'Tem prova social forte mas nenhuma vitrine digital própria.',
        'Referência consolidada no bairro (3096 avaliações, nota 4.3)',
        'Direto e consultivo',
        'Gancho um|Gancho dois|Gancho três',
        'Pergunta direta sobre uma ligação rápida',
        '+55 21 2437-4428',
      ].join(','),
    ].join('\n');

    const result = parseEnrichedLeadsCsv(csv);

    expect(result.invalid).toEqual([]);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toEqual({
      companyName: 'Adega Barril do Recreio',
      category: 'Restaurante português',
      neighborhood: 'Recreio dos Bandeirantes',
      siteStatus: 'Sem Site',
      googleRating: 4.3,
      reviewCount: 3096,
      mainPainPoint: 'Tem prova social forte mas nenhuma vitrine digital própria.',
      socialProofTrigger: 'Referência consolidada no bairro (3096 avaliações, nota 4.3)',
      recommendedTone: 'Direto e consultivo',
      openingHooks: ['Gancho um', 'Gancho dois', 'Gancho três'],
      recommendedCta: 'Pergunta direta sobre uma ligação rápida',
      rawPhone: '+55 21 2437-4428',
    });
  });

  it('lead sem nota/avaliações (0) não recebe googleRating, e vira reviewCount 0', () => {
    const csv = [
      HEADER,
      [
        'Matheus Do Frango',
        'Restaurante de frango',
        'Campo Grande',
        'Sem Site',
        '',
        '0',
        'Depende 100% do tráfego orgânico do Google Maps.',
        'Poucas avaliações ainda (0)',
        'Leve e de descoberta',
        'Gancho único',
        'Pergunta aberta e leve sobre planos de crescimento',
        '+55 21 99105-6156',
      ].join(','),
    ].join('\n');

    const result = parseEnrichedLeadsCsv(csv);

    expect(result.leads[0].googleRating).toBeUndefined();
    expect(result.leads[0].reviewCount).toBe(0);
  });

  it('linha com Status do Site inválido vai para invalid, nunca quebra o parse inteiro', () => {
    const csv = [
      HEADER,
      [
        'Empresa Qualquer',
        'Restaurante',
        'Campo Grande',
        'Talvez Tenha Site',
        '4.0',
        '10',
        'Dor qualquer.',
        'Gatilho qualquer.',
        'Tom qualquer.',
        'Gancho único',
        'CTA qualquer.',
        '+55 21 90000-0000',
      ].join(','),
    ].join('\n');

    const result = parseEnrichedLeadsCsv(csv);

    expect(result.leads).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].reason).toBe('site_status_invalido');
  });
});
```

- [x] **Step 3: Rodar e confirmar que falha**

Run: `npx jest --testPathPattern "parseEnrichedLeadsCsv"`

Expected: FAIL — módulo `parseEnrichedLeadsCsv` não existe ainda.

- [x] **Step 4: Implementar o parser**

Criar `apps/api/src/services/campaigns/domain/policies/parseEnrichedLeadsCsv.ts`:

```typescript
import { parseCsv } from '../../../contacts/domain/csvParsing';
import { EnrichedLead, LeadSiteStatus } from '../entities/EnrichedLead';

const VALID_SITE_STATUSES: LeadSiteStatus[] = ['Sem Site', 'Apenas Redes Sociais', 'Com Site'];

const REQUIRED_HEADERS = [
  'Nome da Empresa',
  'Categoria',
  'Bairro',
  'Status do Site',
  'Nota Google',
  'Qtd Avaliações',
  'Dor Principal Identificada',
  'Gatilho de Prova Social',
  'Tom Recomendado',
  'Ganchos de Abertura',
  'CTA Recomendado',
  'Telefone',
] as const;

export interface InvalidEnrichedLeadRow {
  rowNumber: number;
  reason: 'colunas_insuficientes' | 'site_status_invalido' | 'nome_vazio' | 'telefone_vazio';
}

export interface ParseEnrichedLeadsCsvResult {
  totalRows: number;
  leads: EnrichedLead[];
  invalid: InvalidEnrichedLeadRow[];
}

/**
 * Parseia o CSV de leads enriquecidos (Fase de Prospecção IA, 2026-08-29) —
 * mesmo formato de `leads-prospeccao-google-maps/leads_prospeccao_whatsapp_ia.csv`
 * (ver `PLAYBOOK_IA_WHATSAPP.md` da mesma pasta). Reaproveita `parseCsv`
 * (tokenização pura, já usada por `parseRecipientsCsv`) — nenhuma
 * duplicação de lógica de CSV.
 *
 * Cabeçalho é POSICIONAL nesta primeira versão (colunas na ordem exata de
 * `REQUIRED_HEADERS`) — mesma simplificação já aceita em `mapImportRows`
 * para a planilha de contatos genérica; se o formato precisar de colunas
 * fora de ordem no futuro, isso é uma extensão localizada aqui, não uma
 * mudança de contrato para quem chama esta função.
 */
export function parseEnrichedLeadsCsv(csvText: string): ParseEnrichedLeadsCsvResult {
  const rows = parseCsv(csvText);
  const dataRows = rows.slice(1); // primeira linha é cabeçalho
  const totalRows = dataRows.length;

  const leads: EnrichedLead[] = [];
  const invalid: InvalidEnrichedLeadRow[] = [];

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 (base 1) +1 (cabeçalho já consumido)
    if (row.length < REQUIRED_HEADERS.length) {
      invalid.push({ rowNumber, reason: 'colunas_insuficientes' });
      return;
    }

    const [
      companyName,
      category,
      neighborhood,
      siteStatusRaw,
      googleRatingRaw,
      reviewCountRaw,
      mainPainPoint,
      socialProofTrigger,
      recommendedTone,
      openingHooksRaw,
      recommendedCta,
      rawPhone,
    ] = row;

    if (companyName.trim().length === 0) {
      invalid.push({ rowNumber, reason: 'nome_vazio' });
      return;
    }
    if (rawPhone.trim().length === 0) {
      invalid.push({ rowNumber, reason: 'telefone_vazio' });
      return;
    }
    if (!VALID_SITE_STATUSES.includes(siteStatusRaw.trim() as LeadSiteStatus)) {
      invalid.push({ rowNumber, reason: 'site_status_invalido' });
      return;
    }

    const reviewCount = Number.parseInt(reviewCountRaw.trim(), 10) || 0;
    const googleRatingTrimmed = googleRatingRaw.trim();
    const googleRating =
      googleRatingTrimmed.length > 0 ? Number.parseFloat(googleRatingTrimmed) : undefined;

    leads.push({
      companyName: companyName.trim(),
      category: category.trim(),
      neighborhood: neighborhood.trim(),
      siteStatus: siteStatusRaw.trim() as LeadSiteStatus,
      googleRating: Number.isFinite(googleRating) ? googleRating : undefined,
      reviewCount,
      mainPainPoint: mainPainPoint.trim(),
      socialProofTrigger: socialProofTrigger.trim().length > 0 ? socialProofTrigger.trim() : undefined,
      recommendedTone: recommendedTone.trim(),
      openingHooks: openingHooksRaw
        .split('|')
        .map((hook) => hook.trim())
        .filter((hook) => hook.length > 0),
      recommendedCta: recommendedCta.trim(),
      rawPhone: rawPhone.trim(),
    });
  });

  return { totalRows, leads, invalid };
}
```

- [x] **Step 5: Rodar e confirmar que passa**

Run: `npx jest --testPathPattern "parseEnrichedLeadsCsv"`

Expected: PASS — os 3 testes.

- [x] **Step 6: Commit**

```bash
git add apps/api/src/services/campaigns/domain/entities/EnrichedLead.ts apps/api/src/services/campaigns/domain/policies/parseEnrichedLeadsCsv.ts apps/api/tests/services/campaigns/domain/parseEnrichedLeadsCsv.test.ts
git commit -m "feat(campaigns): add EnrichedLead type and parseEnrichedLeadsCsv"
```

---

### Task 8: `pickMessageVariation` — rotação determinística de gancho + esqueleto

**Files:**
- Create: `apps/api/src/services/campaigns/domain/policies/pickMessageVariation.ts`
- Test: `apps/api/tests/services/campaigns/domain/pickMessageVariation.test.ts`

**Interfaces:**
- Produces: `MessageSkeleton` (tipo), `pickMessageVariation(index: number, hooksCount: number): { skeleton: MessageSkeleton; hookIndex: number }` — usado pela Task 9.

- [x] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/services/campaigns/domain/pickMessageVariation.test.ts`:

```typescript
import { pickMessageVariation, MESSAGE_SKELETONS } from '../../../../src/services/campaigns/domain/policies/pickMessageVariation';

describe('pickMessageVariation (Fase de Prospecção IA, Seção 2 do playbook — variação estrutural)', () => {
  it('nunca repete o esqueleto entre dois índices consecutivos', () => {
    for (let index = 1; index < 20; index += 1) {
      const previous = pickMessageVariation(index - 1, 4);
      const current = pickMessageVariation(index, 4);
      expect(current.skeleton).not.toBe(previous.skeleton);
    }
  });

  it('roda por todos os esqueletos definidos, na ordem, e repete o ciclo depois disso', () => {
    const total = MESSAGE_SKELETONS.length;
    for (let index = 0; index < total; index += 1) {
      expect(pickMessageVariation(index, 4).skeleton).toBe(MESSAGE_SKELETONS[index]);
    }
    expect(pickMessageVariation(total, 4).skeleton).toBe(MESSAGE_SKELETONS[0]);
  });

  it('roda o índice do gancho dentro da quantidade de ganchos disponíveis do lead', () => {
    expect(pickMessageVariation(0, 3).hookIndex).toBe(0);
    expect(pickMessageVariation(1, 3).hookIndex).toBe(1);
    expect(pickMessageVariation(3, 3).hookIndex).toBe(0); // cicla
  });

  it('com hooksCount 0 (planilha sem ganchos), devolve hookIndex 0 sem lançar', () => {
    expect(() => pickMessageVariation(5, 0)).not.toThrow();
    expect(pickMessageVariation(5, 0).hookIndex).toBe(0);
  });
});
```

- [x] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --testPathPattern "pickMessageVariation"`

Expected: FAIL — módulo não existe.

- [x] **Step 3: Implementar**

Criar `apps/api/src/services/campaigns/domain/policies/pickMessageVariation.ts`:

```typescript
/**
 * Os 7 "esqueletos" estruturais usados manualmente na primeira rodada de
 * prospecção (ver `leads-prospeccao-google-maps/rascunhos_mensagens_msg1.csv`,
 * gerado antes deste serviço existir) — cada um descreve uma ORDEM DE
 * IDEIAS e um TIPO DE FECHAMENTO diferente, nunca só um sinônimo do
 * anterior. `buildLeadMessagePrompt` (próxima peça do pipeline) traduz
 * cada valor numa instrução concreta para a IA.
 */
export const MESSAGE_SKELETONS = [
  'elogio_pergunta_curta',
  'observacao_reticencias',
  'pergunta_gancho_pergunta',
  'observacao_call_leve',
  'gancho_curto_pergunta_aberta',
  'dado_numerico_observacao_pergunta',
  'pergunta_leve_exploratoria',
] as const;

export type MessageSkeleton = (typeof MESSAGE_SKELETONS)[number];

export interface MessageVariation {
  skeleton: MessageSkeleton;
  hookIndex: number;
}

/**
 * Escolhe DETERMINISTICAMENTE (sem IA, sem aleatoriedade) o esqueleto e o
 * índice de gancho de abertura para o lead na posição `index` de um lote —
 * Seção 2 do playbook ("regra de ouro: variação estrutural, não só
 * lexical"). Determinístico de propósito: depender de um modelo de IA
 * "lembrar" de variar entre chamadas independentes (sem memória entre
 * elas) é frágil; a rotação em código GARANTE que o esqueleto nunca se
 * repete entre dois leads consecutivos do mesmo lote (`MESSAGE_SKELETONS.length`
 * é 7, sempre > 1).
 *
 * `hooksCount` é a quantidade de `Ganchos de Abertura` daquele lead
 * específico (`EnrichedLead.openingHooks.length`) — cicla dentro dela, não
 * dentro de um valor fixo, porque cada lead pode ter uma quantidade
 * diferente de ganchos na planilha. `0` (planilha sem ganchos para aquele
 * lead) devolve sempre `hookIndex: 0`, sem lançar — quem monta o prompt
 * decide o que fazer com uma lista de ganchos vazia (ver
 * `buildLeadMessagePrompt`).
 */
export function pickMessageVariation(index: number, hooksCount: number): MessageVariation {
  const skeleton = MESSAGE_SKELETONS[index % MESSAGE_SKELETONS.length];
  const hookIndex = hooksCount > 0 ? index % hooksCount : 0;
  return { skeleton, hookIndex };
}
```

- [x] **Step 4: Rodar e confirmar que passa**

Run: `npx jest --testPathPattern "pickMessageVariation"`

Expected: PASS — os 4 testes.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/services/campaigns/domain/policies/pickMessageVariation.ts apps/api/tests/services/campaigns/domain/pickMessageVariation.test.ts
git commit -m "feat(campaigns): add deterministic pickMessageVariation policy"
```

---

### Task 9: `buildLeadMessagePrompt` — monta o prompt final (regras do playbook)

**Files:**
- Create: `apps/api/src/services/campaigns/domain/policies/buildLeadMessagePrompt.ts`
- Test: `apps/api/tests/services/campaigns/domain/buildLeadMessagePrompt.test.ts`

**Interfaces:**
- Consumes: `EnrichedLead` (Task 7), `MessageVariation`/`MessageSkeleton` (Task 8).
- Produces: `buildLeadMessagePrompt(lead: EnrichedLead, variation: MessageVariation): { systemPrompt: string; userMessage: string }` — usado pela Task 10 (`GenerateLeadMessagesService`), no formato que `AiProvider.generateReply({ systemPrompt, messages: [{ role: 'user', content: userMessage }] })` espera.

- [x] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/services/campaigns/domain/buildLeadMessagePrompt.test.ts`:

```typescript
import { buildLeadMessagePrompt } from '../../../../src/services/campaigns/domain/policies/buildLeadMessagePrompt';
import { EnrichedLead } from '../../../../src/services/campaigns/domain/entities/EnrichedLead';

const BASE_LEAD: EnrichedLead = {
  companyName: 'Adega Barril do Recreio',
  category: 'Restaurante português',
  neighborhood: 'Recreio dos Bandeirantes',
  siteStatus: 'Sem Site',
  googleRating: 4.3,
  reviewCount: 3096,
  mainPainPoint: 'Tem prova social forte mas nenhuma vitrine digital própria.',
  socialProofTrigger: 'Referência consolidada no bairro (3096 avaliações, nota 4.3)',
  recommendedTone: 'Direto e consultivo',
  openingHooks: ['Gancho um', 'Gancho dois'],
  recommendedCta: 'Pergunta direta sobre uma ligação rápida',
  rawPhone: '+55 21 2437-4428',
};

describe('buildLeadMessagePrompt (Fase de Prospecção IA — regras do playbook)', () => {
  it('systemPrompt proíbe oferta/CTA e exige fechamento em pergunta ou reticências (Seção 5)', () => {
    const { systemPrompt } = buildLeadMessagePrompt(BASE_LEAD, {
      skeleton: 'elogio_pergunta_curta',
      hookIndex: 0,
    });

    expect(systemPrompt).toMatch(/nunca.*oferta|zero oferta/i);
    expect(systemPrompt).toMatch(/pergunta aberta|reticências/i);
  });

  it('systemPrompt proíbe a frase literal "não tem site" (Seção 6)', () => {
    const { systemPrompt } = buildLeadMessagePrompt(BASE_LEAD, {
      skeleton: 'observacao_reticencias',
      hookIndex: 0,
    });

    expect(systemPrompt.toLowerCase()).toContain('nunca escreva a frase');
  });

  it('userMessage inclui o gancho escolhido pelo índice da variação, não outro', () => {
    const { userMessage } = buildLeadMessagePrompt(BASE_LEAD, {
      skeleton: 'elogio_pergunta_curta',
      hookIndex: 1,
    });

    expect(userMessage).toContain('Gancho dois');
    expect(userMessage).not.toContain('Gancho um');
  });

  it('lead com reviewCount 0 (sem googleRating): userMessage NÃO inclui nota/quantidade de avaliações', () => {
    const leadSemAvaliacoes: EnrichedLead = {
      ...BASE_LEAD,
      googleRating: undefined,
      reviewCount: 0,
      socialProofTrigger: 'Poucas avaliações ainda (0)',
    };

    const { userMessage } = buildLeadMessagePrompt(leadSemAvaliacoes, {
      skeleton: 'pergunta_leve_exploratoria',
      hookIndex: 0,
    });

    expect(userMessage).not.toMatch(/nota google|avalia/i);
  });

  it('userMessage descreve o esqueleto estrutural escolhido, diferente por esqueleto', () => {
    const a = buildLeadMessagePrompt(BASE_LEAD, {
      skeleton: 'elogio_pergunta_curta',
      hookIndex: 0,
    }).userMessage;
    const b = buildLeadMessagePrompt(BASE_LEAD, {
      skeleton: 'observacao_reticencias',
      hookIndex: 0,
    }).userMessage;

    expect(a).not.toBe(b);
  });
});
```

- [x] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --testPathPattern "buildLeadMessagePrompt"`

Expected: FAIL — módulo não existe.

- [x] **Step 3: Implementar**

Criar `apps/api/src/services/campaigns/domain/policies/buildLeadMessagePrompt.ts`:

```typescript
import { EnrichedLead } from '../entities/EnrichedLead';
import { MessageSkeleton, MessageVariation } from './pickMessageVariation';

/** Descrição, em português claro, de CADA esqueleto — a IA recebe isto como instrução de estrutura, nunca escolhe a estrutura sozinha. */
const SKELETON_INSTRUCTIONS: Record<MessageSkeleton, string> = {
  elogio_pergunta_curta:
    'Estrutura: comece com um elogio curto baseado no dado real do lead, feche com UMA pergunta direta. Duas linhas no máximo.',
  observacao_reticencias:
    'Estrutura: uma observação sobre o negócio do lead, terminando em reticências (sem ponto de interrogação) — um pensamento em aberto, não uma pergunta fechada.',
  pergunta_gancho_pergunta:
    'Estrutura: abra com uma pergunta leve, no meio cite o gancho/elogio, feche com outra pergunta. Três a quatro linhas.',
  observacao_call_leve:
    'Estrutura: uma observação sobre o negócio, seguida de uma frase que convida a continuar a conversa de forma leve (nunca um agendamento de call — isso só entra a partir da mensagem 3, nunca aqui).',
  gancho_curto_pergunta_aberta:
    'Estrutura: gancho bem curto (uma frase), seguido de uma pergunta objetiva e aberta. Duas linhas no máximo.',
  dado_numerico_observacao_pergunta:
    'Estrutura: comece citando o dado numérico (nota/avaliações) do lead, uma observação sobre o que esse dado significa, feche com uma pergunta.',
  pergunta_leve_exploratoria:
    'Estrutura: pergunta leve e exploratória logo no início (sobre planos/crescimento do negócio), sem nenhuma oferta — típica de lead de prioridade Baixa.',
};

/**
 * Monta o prompt (system + user) que `GenerateLeadMessagesService` manda
 * para `AiProvider.generateReply` — Fase de Prospecção IA (2026-08-29).
 * Traduz DIRETAMENTE as regras de
 * `leads-prospeccao-google-maps/PLAYBOOK_IA_WHATSAPP.md` (Seções 2, 5 e 6)
 * em instruções explícitas; nenhuma regra de negócio fica só "implícita"
 * na cabeça do modelo.
 *
 * `variation` já veio de `pickMessageVariation` — esta função só TRADUZ o
 * esqueleto/gancho escolhidos em texto, nunca escolhe sozinha (mantém a
 * variação determinística e testável fora do alcance da IA).
 */
export function buildLeadMessagePrompt(
  lead: EnrichedLead,
  variation: MessageVariation,
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = `Você escreve a PRIMEIRA mensagem de WhatsApp de uma prospecção fria B2B, seguindo estas regras obrigatórias:

1. ZERO OFERTA: esta é a mensagem 1 de uma sequência. Nunca ofereça produto, serviço, reunião ou qualquer solução. O objetivo é só abrir uma conversa genuína.
2. Termine SEMPRE em uma pergunta aberta OU em uma frase com reticências (um pensamento em aberto) — nunca em uma afirmação fechada, nunca em uma chamada para ação de venda.
3. Nunca escreva a frase "vocês não têm site" (ou qualquer variação literal disso, tipo "percebi que não tem site"/"vi que não tem página") — se o negócio não tem site, reformule sempre como curiosidade/oportunidade sobre COMO o cliente encontra o negócio hoje, nunca como uma crítica ou constatação de falha.
4. Nunca invente dado: use só nota, quantidade de avaliações, nome e bairro exatamente como informados abaixo. Se nota/quantidade de avaliações não forem informadas, NÃO cite nenhum número — não invente "boa reputação" nem aproxime um valor.
5. Tom da mensagem: ${lead.recommendedTone}
6. ${SKELETON_INSTRUCTIONS[variation.skeleton]}
7. Responda APENAS com o texto final da mensagem, sem aspas, sem comentário, sem prefixo como "Mensagem:".`;

  const chosenHook =
    lead.openingHooks.length > 0
      ? lead.openingHooks[variation.hookIndex % lead.openingHooks.length]
      : `Vi o ${lead.companyName} no Google Maps`;

  const hasSocialProof = lead.reviewCount > 0 && lead.googleRating !== undefined;

  const userMessageLines = [
    `Empresa: ${lead.companyName}`,
    `Categoria: ${lead.category}`,
    `Bairro: ${lead.neighborhood}`,
    `Situação digital: ${lead.siteStatus}`,
    hasSocialProof
      ? `Prova social real: ${lead.socialProofTrigger} (nota ${lead.googleRating}, ${lead.reviewCount} avaliações)`
      : 'Prova social: NENHUMA ainda (negócio com poucas ou nenhuma avaliação) — não cite nota nem quantidade de avaliações.',
    `Dor principal identificada: ${lead.mainPainPoint}`,
    `Gancho de abertura a usar (adapte a redação, mas mantenha a ideia): ${chosenHook}`,
  ];

  return { systemPrompt, userMessage: userMessageLines.join('\n') };
}
```

- [x] **Step 4: Rodar e confirmar que passa**

Run: `npx jest --testPathPattern "buildLeadMessagePrompt"`

Expected: PASS — os 5 testes.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/services/campaigns/domain/policies/buildLeadMessagePrompt.ts apps/api/tests/services/campaigns/domain/buildLeadMessagePrompt.test.ts
git commit -m "feat(campaigns): add buildLeadMessagePrompt encoding playbook rules"
```

---

### Task 10: `GenerateLeadMessagesService` — orquestra a geração do lote

**Files:**
- Create: `apps/api/src/services/campaigns/domain/errors/LeadMessageGenerationUnavailableError.ts`
- Create: `apps/api/src/services/campaigns/application/GenerateLeadMessagesService.ts`
- Test: `apps/api/tests/services/campaigns/application/GenerateLeadMessagesService.test.ts`

**Interfaces:**
- Consumes: `EnrichedLead` (Task 7), `pickMessageVariation` (Task 8), `buildLeadMessagePrompt` (Task 9), `AiProvider.generateReply` (já existe, `services/ai/domain/providers/AiProvider.ts`), `normalizePhoneToE164` (já existe, `services/contacts/domain/phoneNumber.ts`).
- Produces: `LeadMessageDraft` (tipo), `GenerateLeadMessagesService.generate(leads: EnrichedLead[]): Promise<LeadMessageDraft[]>` — usado pela Task 11 (router) e, depois de aprovado pelo operador, vira `phoneRecipients` de `POST /campaigns` (Task 6).

- [x] **Step 1: Criar o erro de indisponibilidade**

Criar `apps/api/src/services/campaigns/domain/errors/LeadMessageGenerationUnavailableError.ts` (mesmo estilo de `SendingEngineNotConfiguredError.ts`):

```typescript
/**
 * `GenerateLeadMessagesService.generate` chamado sem um `AiProvider`
 * configurado — mesmo racional de `SendingEngineNotConfiguredError`
 * (ambiente sem as credenciais de IA no `.env`, ver `index.ts`).
 */
export class LeadMessageGenerationUnavailableError extends Error {
  constructor() {
    super('A geração de mensagens por IA não está configurada neste ambiente.');
    this.name = 'LeadMessageGenerationUnavailableError';
  }
}
```

- [x] **Step 2: Escrever o teste que falha**

Criar `apps/api/tests/services/campaigns/application/GenerateLeadMessagesService.test.ts`:

```typescript
import { GenerateLeadMessagesService } from '../../../../src/services/campaigns/application/GenerateLeadMessagesService';
import { LeadMessageGenerationUnavailableError } from '../../../../src/services/campaigns/domain/errors/LeadMessageGenerationUnavailableError';
import { EnrichedLead } from '../../../../src/services/campaigns/domain/entities/EnrichedLead';
import { FakeAiProvider } from '../../../services/ai/infrastructure/FakeAiProviderFactory';

function buildLead(overrides: Partial<EnrichedLead> = {}): EnrichedLead {
  return {
    companyName: 'Adega Barril do Recreio',
    category: 'Restaurante português',
    neighborhood: 'Recreio dos Bandeirantes',
    siteStatus: 'Sem Site',
    googleRating: 4.3,
    reviewCount: 3096,
    mainPainPoint: 'Tem prova social forte mas nenhuma vitrine digital própria.',
    socialProofTrigger: 'Referência consolidada no bairro (3096 avaliações, nota 4.3)',
    recommendedTone: 'Direto e consultivo',
    openingHooks: ['Gancho um', 'Gancho dois'],
    recommendedCta: 'Pergunta direta sobre uma ligação rápida',
    rawPhone: '+55 21 2437-4428',
    ...overrides,
  };
}

describe('GenerateLeadMessagesService (Fase de Prospecção IA)', () => {
  it('gera um rascunho por lead, com o telefone já normalizado', async () => {
    const aiProvider = new FakeAiProvider();
    aiProvider.setNextResult({
      content: 'Texto gerado pela IA para o primeiro lead.',
      model: 'fake-model',
      tokensInput: 10,
      tokensOutput: 20,
    });
    const service = new GenerateLeadMessagesService(aiProvider);

    const drafts = await service.generate([buildLead()]);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual({
      companyName: 'Adega Barril do Recreio',
      phoneE164: '+5521243744280', // ver normalizePhoneToE164 para o formato exato — ajustar se a normalização real devolver outro valor para este número de teste
      message: 'Texto gerado pela IA para o primeiro lead.',
    });
  });

  it('chama a IA uma vez por lead, e cada chamada usa um esqueleto diferente do anterior', async () => {
    const aiProvider = new FakeAiProvider();
    const service = new GenerateLeadMessagesService(aiProvider);

    await service.generate([buildLead(), buildLead({ companyName: 'Segundo Lead' })]);

    expect(aiProvider.generateReplyCalls).toHaveLength(2);
    expect(aiProvider.generateReplyCalls[0].systemPrompt).not.toBe(
      aiProvider.generateReplyCalls[1].systemPrompt,
    );
  });

  it('lead com telefone que não normaliza é pulado, sem derrubar o lote inteiro', async () => {
    const aiProvider = new FakeAiProvider();
    const service = new GenerateLeadMessagesService(aiProvider);

    const drafts = await service.generate([buildLead({ rawPhone: 'não é um telefone' })]);

    expect(drafts).toHaveLength(0);
  });

  it('sem AiProvider configurado, lança LeadMessageGenerationUnavailableError', async () => {
    const service = new GenerateLeadMessagesService(undefined);

    await expect(service.generate([buildLead()])).rejects.toBeInstanceOf(
      LeadMessageGenerationUnavailableError,
    );
  });
});
```

> No primeiro teste, rodar `normalizePhoneToE164('+55 21 2437-4428')` isoladamente (ex.: um `console.log` num teste descartável, ou ler `apps/api/tests/services/contacts/domain/phoneNumber.test.ts` já existente) para confirmar o valor exato esperado antes de fixar a asserção — não adivinhar o formato.

- [x] **Step 3: Rodar e confirmar que falha**

Run: `npx jest --testPathPattern "GenerateLeadMessagesService"`

Expected: FAIL — módulo não existe.

- [x] **Step 4: Implementar**

Criar `apps/api/src/services/campaigns/application/GenerateLeadMessagesService.ts`:

```typescript
import { AiProvider } from '../../ai/domain/providers/AiProvider';
import { normalizePhoneToE164 } from '../../contacts/domain/phoneNumber';
import { EnrichedLead } from '../domain/entities/EnrichedLead';
import { pickMessageVariation } from '../domain/policies/pickMessageVariation';
import { buildLeadMessagePrompt } from '../domain/policies/buildLeadMessagePrompt';
import { LeadMessageGenerationUnavailableError } from '../domain/errors/LeadMessageGenerationUnavailableError';

/** Um rascunho de mensagem 1, pronto para revisão humana — nunca persistido sozinho (vira `phoneRecipients[].personalizedMessage` só depois de aprovado, na criação da campanha). */
export interface LeadMessageDraft {
  companyName: string;
  phoneE164: string;
  message: string;
}

/**
 * Gera a mensagem 1 (abertura) de cada lead de um lote — Fase de
 * Prospecção IA (2026-08-29). NUNCA persiste nada (mesmo racional de
 * `CampaignService.parseRecipientsCsv`): o resultado é só para o operador
 * revisar antes de criar a campanha de fato.
 *
 * A ORDEM dos leads recebidos é preservada e usada como `index` de
 * `pickMessageVariation` — o CHAMADOR (router) é quem garante que os leads
 * já chegam ordenados por prioridade/avaliações (mesma ordem já usada
 * manualmente em `leads-prospeccao-google-maps/`), esta classe só rotaciona
 * a variação NA ORDEM em que recebe.
 */
export class GenerateLeadMessagesService {
  constructor(private readonly aiProvider?: AiProvider) {}

  async generate(leads: EnrichedLead[]): Promise<LeadMessageDraft[]> {
    if (!this.aiProvider) {
      throw new LeadMessageGenerationUnavailableError();
    }

    const drafts: LeadMessageDraft[] = [];
    for (let index = 0; index < leads.length; index += 1) {
      const lead = leads[index];
      const phoneE164 = normalizePhoneToE164(lead.rawPhone);
      if (!phoneE164) {
        continue; // telefone inválido: pulado, nunca derruba o lote inteiro
      }

      const variation = pickMessageVariation(index, lead.openingHooks.length);
      const { systemPrompt, userMessage } = buildLeadMessagePrompt(lead, variation);
      const result = await this.aiProvider.generateReply({
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      drafts.push({
        companyName: lead.companyName,
        phoneE164,
        message: result.content.trim(),
      });
    }
    return drafts;
  }
}
```

- [x] **Step 5: Rodar e confirmar que passa**

Run: `npx jest --testPathPattern "GenerateLeadMessagesService"`

Expected: PASS — os 4 testes (ajustar o valor exato de `phoneE164` esperado no primeiro teste, conforme apurado no Step 2).

- [x] **Step 6: Commit**

```bash
git add apps/api/src/services/campaigns/domain/errors/LeadMessageGenerationUnavailableError.ts apps/api/src/services/campaigns/application/GenerateLeadMessagesService.ts apps/api/tests/services/campaigns/application/GenerateLeadMessagesService.test.ts
git commit -m "feat(campaigns): add GenerateLeadMessagesService"
```

---

### Task 11: Endpoints `POST /leads/parse-csv` e `POST /leads/generate-messages`

**Files:**
- Modify: `apps/api/src/services/campaigns/presentation/campaignsRouter.ts`
- Modify: `apps/api/src/services/campaigns/presentation/campaignsErrorHandler.ts`
- Modify: `apps/api/src/services/campaigns/compositionRoot.ts`
- Test: `apps/api/tests/services/campaigns/presentation/campaignsRouter.test.ts`

**Interfaces:**
- Consumes: `parseEnrichedLeadsCsv` (Task 7), `GenerateLeadMessagesService` (Task 10).
- Produces: rotas HTTP consumidas pelo operador (via planilha/CSV, ver Global Constraints — sem UI nesta rodada).

- [x] **Step 1: Escrever os testes que falham**

Em `apps/api/tests/services/campaigns/presentation/campaignsRouter.test.ts`, seguindo o padrão do teste já existente de `POST /parse-recipients-csv` (mesmo `request(app).post(...).set('Content-Type', 'text/plain').send(csvText)`):

```typescript
  it('POST /leads/parse-csv devolve leads + inválidos, sem persistir nada', async () => {
    const csv = [
      'Nome da Empresa,Categoria,Bairro,Status do Site,Nota Google,Qtd Avaliações,Dor Principal Identificada,Gatilho de Prova Social,Tom Recomendado,Ganchos de Abertura,CTA Recomendado,Telefone',
      'Adega Barril do Recreio,Restaurante português,Recreio dos Bandeirantes,Sem Site,4.3,3096,Dor qualquer.,Gatilho qualquer.,Tom qualquer.,Gancho único,CTA qualquer.,+55 21 2437-4428',
    ].join('\n');

    const response = await request(app)
      .post(`/api/tenants/${tenantId}/campaigns/leads/parse-csv`)
      .set('Content-Type', 'text/plain')
      .send(csv);

    expect(response.status).toBe(200);
    expect(response.body.leads).toHaveLength(1);
    expect(response.body.leads[0].companyName).toBe('Adega Barril do Recreio');
  });

  it('POST /leads/generate-messages devolve um rascunho por lead, sem criar campanha', async () => {
    aiProvider.setNextResult({
      content: 'Mensagem gerada para teste.',
      model: 'fake-model',
      tokensInput: 5,
      tokensOutput: 10,
    });

    const response = await request(app)
      .post(`/api/tenants/${tenantId}/campaigns/leads/generate-messages`)
      .send({
        leads: [
          {
            companyName: 'Adega Barril do Recreio',
            category: 'Restaurante português',
            neighborhood: 'Recreio dos Bandeirantes',
            siteStatus: 'Sem Site',
            googleRating: 4.3,
            reviewCount: 3096,
            mainPainPoint: 'Dor qualquer.',
            socialProofTrigger: 'Gatilho qualquer.',
            recommendedTone: 'Tom qualquer.',
            openingHooks: ['Gancho único'],
            recommendedCta: 'CTA qualquer.',
            rawPhone: '+55 21 2437-4428',
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.drafts).toHaveLength(1);
    expect(response.body.drafts[0].message).toBe('Mensagem gerada para teste.');
  });
```

> Ajustar `aiProvider`/`tenantId`/`app` para os identificadores exatos já usados no `beforeEach` deste arquivo — a composição de teste do router provavelmente precisa passar a receber um `FakeAiProvider` a mais; seguir o mesmo padrão de injeção já usado para `campaignRepository`/`contactLookup` no arquivo.

- [x] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --testPathPattern "campaignsRouter" -t "leads"`

Expected: FAIL — rotas ainda não existem (404).

- [x] **Step 3: Implementar as rotas**

Em `campaignsRouter.ts`, adicionar o import e o schema do corpo de `/leads/generate-messages` (logo abaixo de `rawPhoneRecipientSchema`):

```typescript
import { GenerateLeadMessagesService } from '../application/GenerateLeadMessagesService';
import { LeadSiteStatus } from '../domain/entities/EnrichedLead';

const enrichedLeadSchema = z.object({
  companyName: z.string().trim().min(1),
  category: z.string().trim().min(1),
  neighborhood: z.string().trim().min(1),
  siteStatus: z.enum(['Sem Site', 'Apenas Redes Sociais', 'Com Site']),
  googleRating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0),
  mainPainPoint: z.string().trim().min(1),
  socialProofTrigger: z.string().trim().optional(),
  recommendedTone: z.string().trim().min(1),
  openingHooks: z.array(z.string().trim().min(1)).default([]),
  recommendedCta: z.string().trim().min(1),
  rawPhone: z.string().trim().min(1),
});

const generateLeadMessagesBodySchema = z.object({
  leads: z.array(enrichedLeadSchema).min(1).max(500),
});
```

Mudar a assinatura de `createCampaignsRouter` para receber o novo serviço:

```typescript
export function createCampaignsRouter(
  campaignService: CampaignService,
  generateLeadMessagesService: GenerateLeadMessagesService,
): Router {
```

Adicionar as duas rotas, logo abaixo de `/parse-recipients-csv` (ANTES de `/:campaignId`, mesmo motivo documentado nos comentários vizinhos):

```typescript
  /**
   * `POST /leads/parse-csv` — Fase de Prospecção IA (2026-08-29). Só
   * PARSEIA (nunca persiste), mesmo padrão de `/parse-recipients-csv`, mas
   * para o formato de lead ENRIQUECIDO (dor/gatilho/tom/ganchos/CTA) —
   * ver `parseEnrichedLeadsCsv`.
   */
  router.post(
    '/leads/parse-csv',
    requirePermission('campaign:manage'),
    text({ type: () => true, limit: MAX_RECIPIENTS_CSV_BYTES }),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      if (typeof req.body !== 'string' || req.body.trim().length === 0) {
        res.status(400).json({
          error: 'empty_body',
          message: 'O corpo da requisição precisa ser o arquivo CSV (não vazio).',
        });
        return;
      }

      const report = parseEnrichedLeadsCsv(req.body);
      res.status(200).json(report);
    }),
  );

  /**
   * `POST /leads/generate-messages` — Fase de Prospecção IA (2026-08-29).
   * Gera a mensagem 1 de cada lead (Seções 2/5/6 do playbook) e devolve
   * rascunhos para revisão humana — NUNCA cria campanha nem persiste nada.
   * O operador aprova/edita e só então manda os textos aprovados em
   * `phoneRecipients[].personalizedMessage` de `POST /` (ver Task 6).
   */
  router.post(
    '/leads/generate-messages',
    requirePermission('campaign:manage'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(generateLeadMessagesBodySchema, req.body, res);
      if (!body) return;

      const drafts = await generateLeadMessagesService.generate(body.leads);
      res.status(200).json({ drafts });
    }),
  );
```

E o import de `parseEnrichedLeadsCsv` no topo do arquivo:

```typescript
import { parseEnrichedLeadsCsv } from '../domain/policies/parseEnrichedLeadsCsv';
```

- [x] **Step 4: Mapear o novo erro no error handler**

Em `campaignsErrorHandler.ts`, adicionar o import e o mapeamento (mesmo padrão de `SendingEngineNotConfiguredError`, mesmo status `503`):

```typescript
import { LeadMessageGenerationUnavailableError } from '../domain/errors/LeadMessageGenerationUnavailableError';
```

```typescript
    if (error instanceof LeadMessageGenerationUnavailableError) {
      res.status(503).json({
        error: 'lead_message_generation_unavailable',
        message: error.message,
      });
      return;
    }
```

(inserir logo abaixo do bloco de `SendingEngineNotConfiguredError`.)

- [x] **Step 5: Atualizar a composição**

Em `compositionRoot.ts`, `createCampaignsComposition` precisa receber e repassar o `AiProvider` (mesmo padrão do parâmetro opcional `contactLookup` já existente):

```typescript
export function createCampaignsComposition(
  prisma: PrismaClient,
  logger: Logger,
  contactLookup?: ContactLookup,
  /** Fase de Prospecção IA (2026-08-29) — mesmo `AiProvider` síncrono já construído em `index.ts` (`summaryAiProvider`), reaproveitado aqui. `undefined` = geração de mensagens desabilitada, mas o resto do bounded context (campanhas normais) continua funcionando. */
  leadMessageAiProvider?: AiProvider,
): CampaignsComposition {
  const campaignRepository = new PrismaCampaignRepository(prisma);
  const tenantRepository = new PrismaTenantRepository(prisma);

  const campaignService = new CampaignService(
    campaignRepository,
    tenantRepository,
    logger,
    undefined,
    contactLookup,
  );
  const generateLeadMessagesService = new GenerateLeadMessagesService(leadMessageAiProvider);
  const campaignsRouter = createCampaignsRouter(campaignService, generateLeadMessagesService);
  const campaignsErrorHandler = createCampaignsErrorHandler(logger);

  return { campaignRepository, campaignService, campaignsRouter, campaignsErrorHandler };
}
```

Adicionar os imports novos no topo do arquivo:

```typescript
import { AiProvider } from '../ai/domain/providers/AiProvider';
import { GenerateLeadMessagesService } from './application/GenerateLeadMessagesService';
```

- [x] **Step 6: Passar o provider real em `index.ts`**

Em `apps/api/src/index.ts`, nos DOIS pontos onde `createCampaignsComposition(...)` é chamado (linhas ~446 e ~750, ver busca feita durante o planejamento), passar `summaryAiProvider` (já construído mais acima no arquivo, reaproveitado — ver comentário em `index.ts:603-609`) como quarto argumento:

```typescript
const campaigns = createCampaignsComposition(prisma, logger, contactLookup, summaryAiProvider);
```

> **Atenção de ordem**: `summaryAiProvider` é construído no arquivo DEPOIS do primeiro `createCampaignsComposition` (linha ~446, ramo degradado/sem Redis). Se essa chamada acontecer antes de `summaryAiProvider` existir, mover a construção de `summaryAiProvider` (linhas ~610-639) para ANTES do primeiro uso de `createCampaignsComposition`, ou passar `undefined` nesse primeiro ramo degradado (ele já é o modo "menos capacidades" do sistema — degradar também a geração de mensagens por IA é consistente com o resto do arquivo) e só passar `summaryAiProvider` de verdade no ramo completo (linha ~750). Confirmar lendo a ordem real do arquivo antes de decidir.

- [x] **Step 7: Rodar e confirmar que passa**

Run: `npx jest --testPathPattern "campaignsRouter"`

Expected: PASS — todos os testes do arquivo, incluindo os dois novos.

Run: `npx tsc --noEmit -p apps/api`

Expected: sem erros em nenhum arquivo tocado por esta task.

- [x] **Step 8: Commit**

```bash
git add apps/api/src/services/campaigns/presentation/campaignsRouter.ts apps/api/src/services/campaigns/presentation/campaignsErrorHandler.ts apps/api/src/services/campaigns/compositionRoot.ts apps/api/src/index.ts apps/api/tests/services/campaigns/presentation/campaignsRouter.test.ts
git commit -m "feat(campaigns): add POST /leads/parse-csv and /leads/generate-messages endpoints"
```

---

### Task 12: Suíte completa + verificação manual end-to-end

**Files:**
- Nenhum arquivo novo — só verificação.

- [x] **Step 1: Rodar a suíte completa da API**

Run: `npx jest --testPathPattern "api"`

Expected: PASS — nenhuma regressão em nenhum teste pré-existente (incluindo `services/contacts`, `services/ai`, `services/conversations`, que não deveriam ter sido tocados por este plano).

- [x] **Step 2: `tsc` e `eslint` no bounded context inteiro**

Run: `npx tsc --noEmit -p apps/api`
Run: `cd apps/api && npx eslint src/services/campaigns --ext .ts`

Expected: ambos limpos.

- [x] **Step 3: Rebuild do container `api` e verificação manual via curl**

Run: `docker compose build api && docker compose up -d api`

Depois, com a sessão `Whatsapp Sites` (`tenant-1`) já usada nesta mesma conversa, testar manualmente (sem criar campanha de verdade — só os dois endpoints novos, que nunca enviam nada):

```bash
curl -s -X POST "http://localhost:3001/api/tenants/tenant-1/campaigns/leads/generate-messages" \
  -H "Content-Type: application/json" \
  -d '{"leads":[{"companyName":"Adega Barril do Recreio","category":"Restaurante português","neighborhood":"Recreio dos Bandeirantes","siteStatus":"Sem Site","googleRating":4.3,"reviewCount":3096,"mainPainPoint":"Tem prova social forte mas nenhuma vitrine digital própria.","socialProofTrigger":"Referência consolidada no bairro (3096 avaliações, nota 4.3)","recommendedTone":"Direto e consultivo","openingHooks":["Gancho um","Gancho dois"],"recommendedCta":"Pergunta direta sobre uma ligação rápida","rawPhone":"+55 21 2437-4428"}]}'
```

Expected: `200`, corpo `{ "drafts": [{ "companyName": "Adega Barril do Recreio", "phoneE164": "...", "message": "..." }] }`, com `message` respeitando as regras do playbook (sem oferta, terminando em pergunta/reticências). Ajustar a porta (`3001`) e o header de autenticação, se o ambiente exigir um (conferir `.env`/outros exemplos de `curl` já usados nesta sessão).

- [x] **Step 4: Reportar ao usuário**

Resumir o que foi implementado, os testes que passaram, e reiterar: **nenhuma campanha real foi criada nem nenhuma mensagem foi enviada por este plano** — a Task 12 só verifica o endpoint de geração de rascunhos. Fechar com "Sem commit [do merge final] — aguardando autorização", seguindo o padrão já usado no resto da sessão.

---

## Fora de escopo desta rodada (registrar como próximo passo, não implementar agora)

- Tela de revisão visual na Dashboard (upload de CSV, edição inline por lead, botão "aprovar e criar campanha").
- Pipeline de enriquecimento automático (scraper → IA → banco) — hoje a planilha enriquecida é curada fora do produto.
- Leitura do provider de IA configurado POR TENANT (hoje usa o mesmo `summaryAiProvider` global de `index.ts`, via variável de ambiente `AI_PROVIDER`) — se cada tenant precisar de credenciais próprias no futuro, isso é uma migration+lookup separados.
