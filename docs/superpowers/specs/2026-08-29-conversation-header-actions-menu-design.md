# Menu "⋮" de Ações da Conversa — Design

## Contexto

O cabeçalho de uma conversa (`apps/dashboard/components/ConversationDetailPanel.tsx`) hoje tem só um botão isolado de "Atualizar" (ícone `RefreshCw`) ao lado do nome/status. Várias ações relacionadas à conversa já existem espalhadas em outros lugares: "Salvar Contato" e "Adicionar Etiqueta" vivem num painel lateral de contexto (`ConversationContextPanel.tsx`); mudar estágio da pipeline só é feito arrastando o card no board Kanban; marcar como "Não Cliente" foi removido do cabeçalho de propósito (ADR #96, 2026-08-01) por não escalar bem numa conta com centenas de contatos. Não existe hoje nenhuma forma de arquivar, excluir, ou marcar uma conversa como não lida manualmente.

O fundador pediu para consolidar tudo isso (mais duas ações novas: Arquivar e Excluir) num único menu "⋮" no cabeçalho, substituindo o botão de "Atualizar" isolado.

## Conflito com decisão existente (ADR #96) — resolvido

ADR #96 removeu o toggle "Não é cliente" do cabeçalho porque marcar conversa por conversa não escalava e a conversa marcada simplesmente sumia sem nenhuma tela para achá-la de volta. O fundador confirmou que quer o botão de volta, mas com uma mudança de comportamento que resolve a preocupação original: ao clicar em "Ativar Não Cliente" no menu, a conversa é automaticamente movida para a coluna "Não Cliente" do board de Pipeline — ela nunca desaparece sem um lugar visível, contável e reversível para encontrá-la depois. Tecnicamente isso já é o que o endpoint `exclude-from-pipeline` faz hoje (o board já lê `excludedFromPipeline` e já a exibe na coluna certa) — o menu só reabre um segundo ponto de entrada para uma ação cujo efeito colateral (aparecer na coluna) já é o comportamento correto e já existente.

## Escopo

**Dentro do escopo:**
- Novo componente `ConversationHeaderMenu.tsx` (dropdown "⋮"), substituindo o botão de atualizar isolado.
- 8 itens de menu: Atualizar, Marcar como não lida, Adicionar Etiqueta, Salvar Contato, Mudar estágio da pipeline, Ativar Não Cliente, Arquivar, Excluir.
- Back-end novo: endpoint de marcar como não lida (hoje só existe marcar como lida), endpoint de arquivar/desarquivar, endpoint de excluir (hard delete), campo `archived`/`archivedAt` no schema, filtro para excluir conversas arquivadas da listagem padrão + um jeito de ver as arquivadas.
- Os botões grandes existentes ("Assumir conversa"/"Devolver ao bot") continuam fora do menu, como estão hoje.

**Fora do escopo (não mexer):**
- O painel lateral de contexto (`ConversationContextPanel.tsx`) continua existindo exatamente como está — o menu não o substitui, é um atalho adicional.
- Nenhuma mudança no board de Pipeline em si (ele já lê `excludedFromPipeline`/`stage` corretamente).
- Nenhuma tela de "papeleira"/lixeira para desfazer uma exclusão — excluir é definitivo.

## Arquitetura

### Back-end (`apps/api/src/services/conversations/`)

**1. Marcar como não lida** — hoje `POST /:conversationId/read` só zera `unreadCount`. Adicionar `POST /:conversationId/unread`, espelhando a estrutura de `read.ts`/`resume.ts` (proxy fino, sem corpo), que seta `unreadCount` para `1` (não incrementa — é uma marcação manual do operador, não uma contagem real de mensagens não vistas; `1` é suficiente para o indicador visual "tem não lida" acender).

**2. Arquivar/Desarquivar** — novo campo no schema Prisma, `WhatsAppConversation.archived Boolean @default(false)` + `archivedAt DateTime?`. Novo endpoint `POST /:conversationId/archive` (aceita `{ archived: boolean }` no corpo, espelhando `exclude-from-pipeline.ts`) que seta os dois campos juntos (`archived: true` + `archivedAt: now()`, ou `archived: false` + `archivedAt: null`). A listagem padrão de conversas (`GET /conversations`) passa a filtrar `archived: false` por padrão; um novo parâmetro de query `archived=true` (mesmo padrão de `needsHumanAttention`/`status` já existentes no endpoint) permite ver só as arquivadas — vira a aba "Arquivadas" no dashboard.

**3. Excluir** — novo endpoint `DELETE /:conversationId`, hard delete de verdade (`WhatsAppConversation` + `WhatsAppMessage`s vinculadas, cascade já deve existir via FK — confirmar no schema atual antes de implementar). Sem "lixeira", sem desfazer. RBAC: mesma permissão de `message:send` usada pelas outras ações desta tela (confirmar durante o plano se o fundador quer uma permissão mais restrita, tipo `conversation:delete`, dado o risco).

Nenhuma mudança necessária em: `escalate`/`resume` (já existem), `exclude-from-pipeline` (já existe, só ganha um novo ponto de entrada na UI), `stage` (já existe), `save-contact` (já existe), `tags/[tagId]` (já existe).

### Front-end (`apps/dashboard/components/`)

**`ConversationHeaderMenu.tsx`** (novo) — o `DropdownMenu` em si (reaproveita `components/ui/dropdown-menu.tsx`, já existente desde a correção do bug de Campanhas). Recebe a `conversation` atual e `onUpdated` (mesmo padrão de `ConversationActions.tsx`), monta os 8 itens. Cada item que precisa de confirmação ou de mais um passo (tag, contato, estágio, não-cliente, arquivar, excluir) abre seu próprio `Dialog` — o menu fecha, o diálogo abre por cima, mesmo padrão já usado em `CampaignDetailPanel.tsx` (`Dialog` dentro de cada botão de ação).

Reaproveitamento de lógica (não do componente inteiro, que hoje vem com seu próprio botão-gatilho embutido):
- **Adicionar Etiqueta**: a lógica de buscar tags do tenant + atribuir/remover (`ConversationTagPicker.tsx` já tem isso) é extraída para um formato reutilizável (hook ou o próprio componente recebendo um `trigger` customizável) — decisão de implementação fica para o plano.
- **Salvar Contato**: mesma ideia com `SaveContactButton.tsx` — o `Dialog`/lógica de salvar já existe, só precisa de um gatilho novo (o item do menu) além do ícone que já existe no painel lateral.

`ConversationDetailPanel.tsx`: troca o `<button>` de `RefreshCw` isolado por `<ConversationHeaderMenu conversation={conversation} onUpdated={applyUpdate} onRefresh={refresh} />` (o "Atualizar" do menu chama a mesma função `refresh` que o botão antigo chamava).

### Fluxo de dados

Todas as ações seguem o mesmo padrão já estabelecido em `ConversationActions.tsx`: chamam uma função de `lib/clientApi.ts` (novas: `markConversationUnread`, `archiveConversation`, `deleteConversation`; reaproveitadas: `saveConversationContact`, `updateConversationStage`, `excludeFromPipeline`, funções de tag), e o resultado atualiza o estado local via `onUpdated`/`applyUpdate` — sem re-buscar a conversa inteira, mesmo padrão de `escalate`/`resume` hoje. `deleteConversation` é a exceção: depois de excluir, a tela não tem mais o que mostrar — precisa navegar de volta para a lista de conversas (`router.push`).

### Tratamento de erro

Mesmo padrão de `ConversationActions.tsx`: `toast` de erro com mensagem específica quando possível (404 = conversa não encontrada, etc.), nunca falha silenciosa. "Excluir" tem uma barra extra: diálogo de confirmação exige digitar o nome do contato exibido (mesmo padrão de "digitar para confirmar" já usado em ações destrutivas fortes deste projeto, ex.: campanhas), botão de confirmar some/desabilita até o texto bater.

### Testes

- `apps/api/tests/services/conversations/`: testes novos para `unread`, `archive`/`unarchive` (incluindo o filtro de listagem passando a excluir arquivadas por padrão), `delete` (incluindo que mensagens vinculadas somem junto).
- `apps/dashboard/tests-jsdom/components/`: teste novo para `ConversationHeaderMenu.tsx` cobrindo os 8 itens (usando o mesmo polyfill de `PointerEvent` já adicionado ao `setup.ts` para o `DropdownMenu`), e teste de regressão garantindo que "Atualizar" continua chamando a mesma função de refresh de antes.

## Auto-revisão da spec

- Sem placeholders/TBD — todas as decisões (o que cada item faz, quem reaproveita o quê, onde fica o filtro de arquivadas) estão explícitas.
- Sem contradição interna — o item "Ativar Não Cliente" documenta explicitamente por que não reintroduz o problema do ADR #96.
- Escopo focado o suficiente para um plano só: back-end (3 endpoints + 1 migration) + front-end (1 componente novo + refatoração pontual de 2 componentes existentes para expor sua lógica a um gatilho externo). Não decompus em sub-specs porque as peças são pequenas e compartilham o mesmo componente-alvo (`ConversationDetailPanel.tsx`).
- Uma ambiguidade deliberadamente deixada para o plano (não para o usuário decidir agora, é detalhe de implementação): a forma exata de extrair a lógica de `ConversationTagPicker`/`SaveContactButton` para um gatilho customizável (hook vs. prop de render) — baixo risco, decisão de código, não de produto.
