import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';

/**
 * Middleware de erro (Express, 4 parâmetros) para `createAiInteractionsRouter`
 * — Milestone 3, Bloco 5. Mapeia só `TenantNotFoundError` por enquanto:
 * nenhum erro de Domain específico de `ai` existe ainda para este endpoint
 * (`listInteractions` nunca lança um erro "interação não encontrada" — uma
 * lista vazia é uma resposta válida, não um erro, ver `AiInteractionsService`).
 *
 * IMPORTANTE (D17): deve ser montado ESCOPADO ao path do próprio router
 * (`app.use('/api/tenants/:tenantId/ai-interactions', ...)`), nunca
 * globalmente — ver `index.ts`.
 */
export function createAiInteractionsErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    logger.error('Erro não tratado nas rotas de ai-interactions', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
