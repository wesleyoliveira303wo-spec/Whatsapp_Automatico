/**
 * Porta (port) que `MessageIngestionService` usa para pedir uma resposta de
 * IA para uma mensagem recém-persistida — Milestone 3, Bloco 2.
 *
 * Deliberadamente um port PEQUENO e sem nenhum conhecimento de fila/BullMQ:
 * `MessageIngestionService` só sabe que existe "algo" que agenda a geração
 * de resposta, nunca COMO (mesmo padrão de dispatch-via-porta-injetada já
 * usado 2x no projeto — `WhatsAppSessionEventRepository`/ADR #49,
 * `MessageReceivedHandler`/Bloco 1 desta Milestone; ver auditoria §1.1 do
 * `MILESTONE_003_AI_AUTORESPONDER.md`).
 *
 * Implementação real (`BullMqAiReplyScheduler`, produtor da fila `ai-reply`)
 * só chega no Bloco 4 — ver `MILESTONE_003_AI_AUTORESPONDER.md` §2.1
 * ("Consequência estrutural": `MessageIngestionService` e
 * `ConversationAiService` NUNCA se chamam diretamente, sempre por esta
 * porta). Até lá, só um Fake de teste existe
 * (`apps/api/tests/services/conversations/testDoubles.ts`); não há
 * implementação de produção nem no-op instanciado em nenhum composition
 * root ainda — `services/conversations/` não está wired a `apps/api/src/index.ts`
 * até o Bloco 5.
 */
export interface AiReplyScheduler {
  schedule(tenantId: string, conversationId: string, messageId: string): Promise<void>;
}
