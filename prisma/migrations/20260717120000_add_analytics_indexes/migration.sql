-- Milestone 4 (Analytics), Bloco M4A — migration aditiva de indices (D43 / ADR #59).
--
-- ESCOPO ESTRITO: apenas CREATE INDEX. Nenhuma tabela criada/alterada,
-- nenhuma coluna adicionada/alterada/removida, nenhuma constraint, nenhum
-- contrato de dados afetado. Analytics e read-only (D51): estes indices
-- somente aceleram consultas de agregacao temporal por tenant; nenhum dado
-- muda de forma nem de significado.
--
-- Nomes seguem a convencao automatica do Prisma (`<tabela>_<colunas>_idx`),
-- identica a dos indices ja existentes nas migrations anteriores.

-- Serie temporal tenant-wide de uso de IA (custo/tokens/latencia/status por
-- dia): filtra `tenant_id` + range de `created_at`, sem `conversation_id`.
-- O indice existente `(tenant_id, conversation_id, created_at)` nao serve
-- esse padrao (conversation_id no meio).
CREATE INDEX "ai_interactions_tenant_id_created_at_idx" ON "ai_interactions"("tenant_id", "created_at");

-- Serie temporal tenant-wide de fluxo de mensagens (inbound/outbound por
-- dia): filtra `tenant_id` + range de `occurred_at`, sem `conversation_id`.
-- Os indices existentes `(conversation_id, occurred_at)` e `(tenant_id)` nao
-- cobrem esse padrao.
CREATE INDEX "whatsapp_messages_tenant_id_occurred_at_idx" ON "whatsapp_messages"("tenant_id", "occurred_at");
