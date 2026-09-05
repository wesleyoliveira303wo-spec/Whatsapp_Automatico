-- Bug real (2026-09-05): a tela de "perguntas que a IA não soube responder"
-- mostrava a RESPOSTA da IA no lugar da PERGUNTA do cliente.
--
-- Causa: `ai_interactions.message_id` servia a dois donos. A Fase 1, Bloco
-- F1.4 passou a gravar ali o id da mensagem INBOUND que originou a tentativa;
-- mas o `OutboundCommandConsumer`, depois do envio, chama `linkMessage()` e
-- SOBRESCREVE a mesma coluna com o id da mensagem OUTBOUND (a resposta). Quem
-- lê no fim sempre encontra a resposta, nunca a pergunta.
--
-- Correção: dois fatos distintos, duas colunas. `message_id` mantém o
-- significado histórico (a resposta enviada); a pergunta ganha coluna própria.
ALTER TABLE "ai_interactions" ADD COLUMN "inbound_message_id" TEXT;

-- Backfill best-effort das linhas que a tela de lacunas lê. A pergunta que
-- originou a resposta é a última mensagem INBOUND daquela conversa antes da
-- interação — o que o próprio motor garante (`shouldGenerateReply` só deixa
-- responder o job da mensagem mais recente). Restrito às linhas
-- UNKNOWN_ANSWER: são as únicas que a tela consome, e manter o backfill
-- pequeno evita uma varredura cara em bases grandes.
UPDATE "ai_interactions" AS ai
SET "inbound_message_id" = (
  SELECT m."id"
  FROM "whatsapp_messages" AS m
  WHERE m."conversation_id" = ai."conversation_id"
    AND m."direction" = 'INBOUND'
    AND m."occurred_at" <= ai."created_at"
  ORDER BY m."occurred_at" DESC, m."id" DESC
  LIMIT 1
)
WHERE ai."escalation_reason" = 'UNKNOWN_ANSWER'
  AND ai."inbound_message_id" IS NULL;
