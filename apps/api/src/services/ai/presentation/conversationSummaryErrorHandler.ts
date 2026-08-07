import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { ConversationNotFoundError } from '../../conversations/domain/errors/ConversationNotFoundError';
import { ConversationSummaryUnavailableError } from '../domain/errors/ConversationSummaryUnavailableError';

/**
 * Middleware de erro (Express, 4 parâmetros) para `createConversationSummaryRouter`
 * (Redesign 2026-08-05, R5). Mapeia por `instanceof`, mesmo padrão de
 * `conversationsErrorHandler`/`tagErrorHandler`.
 *
 * `ConversationNotFoundError` é REUSADO de `services/conversations` (não
 * duplicado) — mesmo erro, mesma resposta 404, evitando dois tipos
 * distintos para o mesmo significado.
 *
 * Erro genérico "AiProvider não configurado" (`Error` simples, lançado por
 * `ConversationSummaryService` — mesmo idioma de
 * `ConversationsService.sendAgentMessage` para `mediaSender`/
 * `outboundMessageDispatcher` ausentes) mapeado por MENSAGEM aqui, já que é
 * um `Error` genérico, não uma classe própria (não vale criar uma classe de
 * Domain só para esta checagem de configuração de deploy). Qualquer OUTRA
 * falha (erro do `AiProvider` de fato, ex.: 429/503 do Gemini) cai no 502
 * genérico — o operador pode tentar de novo, diferente do autoresponder
 * (que tem retry embutido no `GeminiAiProvider`).
 */
export function createConversationSummaryErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof ConversationNotFoundError) {
      res.status(404).json({ error: 'conversation_not_found', message: error.message });
      return;
    }
    if (error instanceof ConversationSummaryUnavailableError) {
      res.status(400).json({ error: 'conversation_summary_unavailable', message: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('AiProvider não configurado')) {
      res.status(503).json({ error: 'ai_provider_not_configured', message: error.message });
      return;
    }
    logger.error('Falha ao gerar resumo de conversa', { error });
    res.status(502).json({
      error: 'ai_summary_generation_failed',
      message: 'Não foi possível gerar o resumo agora. Tente novamente.',
    });
  };
}
