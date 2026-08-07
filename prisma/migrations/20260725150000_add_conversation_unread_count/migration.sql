-- Indicador de conversas não lidas (2026-07-25, pedido do fundador): contador
-- denormalizado de mensagens INBOUND chegadas desde a última leitura de um
-- humano pela Dashboard. Incrementado a cada mensagem inbound
-- (MessageIngestionService), zerado ao abrir a conversa (POST .../read).
--
-- ADITIVA e SEGURA: coluna nova NOT NULL com DEFAULT 0 — linhas existentes
-- ficam com unread_count = 0 (nenhuma conversa aparenta ter mensagem não lida
-- até a próxima mensagem inbound real chegar).
ALTER TABLE "whatsapp_conversations" ADD COLUMN "unread_count" INTEGER NOT NULL DEFAULT 0;
