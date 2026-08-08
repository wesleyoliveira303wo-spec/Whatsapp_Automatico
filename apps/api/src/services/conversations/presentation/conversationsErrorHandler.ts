import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { ConversationNotFoundError } from '../domain/errors/ConversationNotFoundError';
import { ConversationOwnershipError } from '../domain/errors/ConversationOwnershipError';
import { ConversationNotHumanError } from '../domain/errors/ConversationNotHumanError';
import { MessageMediaNotFoundError } from '../domain/errors/MessageMediaNotFoundError';
import { AgentMediaTooLargeError } from '../domain/errors/AgentMediaTooLargeError';
import { AgentMediaTypeMismatchError } from '../domain/errors/AgentMediaTypeMismatchError';
import { WhatsAppNotConnectedError } from '../../whatsapp/domain/errors/WhatsAppNotConnectedError';

/**
 * Middleware de erro (Express, 4 parâmetros) para `createConversationsRouter`
 * — Milestone 3, Bloco 5. Mapeia por `instanceof` (nunca por texto de
 * mensagem — mesmo motivo já documentado em `whatsAppErrorHandler`/nos
 * próprios erros de Domain).
 *
 * Mapeia `TenantNotFoundError` (D14 do levantamento arquitetural): corrige,
 * já na primeira versão deste handler, o gap encontrado em
 * `whatsAppErrorHandler.ts` (que nunca mapeou este erro — caía sempre em
 * 500 genérico). A mesma correção foi replicada em `whatsAppErrorHandler.ts`
 * neste bloco.
 *
 * IMPORTANTE (D17 do levantamento arquitetural — correção do bug de
 * encadeamento): este handler deve ser montado ESCOPADO ao path do próprio
 * router (`app.use('/api/tenants/:tenantId/conversations', ...)`), nunca
 * globalmente sem path — ver `index.ts` para a montagem real e a
 * justificativa completa do porquê.
 */
export function createConversationsErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof ConversationNotFoundError) {
      res.status(404).json({ error: 'conversation_not_found', message: error.message });
      return;
    }
    if (error instanceof ConversationOwnershipError) {
      res.status(403).json({
        error: 'conversation_forbidden',
        message: 'Voce nao pode agir sobre esta conversa.',
      });
      return;
    }
    if (error instanceof ConversationNotHumanError) {
      res.status(409).json({
        error: 'conversation_not_human',
        message: 'Assuma a conversa (escalar para humano) antes de responder manualmente.',
      });
      return;
    }
    if (error instanceof MessageMediaNotFoundError) {
      res.status(404).json({ error: 'message_media_not_found', message: error.message });
      return;
    }
    // Fase 1, Bloco F1.3.
    if (error instanceof AgentMediaTooLargeError) {
      res.status(413).json({ error: 'agent_media_too_large', message: error.message });
      return;
    }
    // Fase 1, Bloco F1.10 — Content-Type declarado não bate com a assinatura
    // binária real do arquivo.
    if (error instanceof AgentMediaTypeMismatchError) {
      res.status(400).json({
        error: 'agent_media_type_mismatch',
        message: error.message,
        declaredCategory: error.declaredCategory,
        detectedCategory: error.detectedCategory,
      });
      return;
    }
    // Fase 1, Bloco F1.3: `sendAgentMediaMessage` chama `MediaSender.send()`
    // SINCRONAMENTE (diferente do texto, que vai pela fila) — o operador
    // precisa de um erro HTTP claro na hora se a sessão não estiver
    // conectada, em vez de um 500 genérico.
    if (error instanceof WhatsAppNotConnectedError) {
      res.status(502).json({ error: 'whatsapp_not_connected', message: error.message });
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    logger.error('Erro não tratado nas rotas de conversas', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
