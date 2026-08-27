import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';

/**
 * Middleware de erro (Express, 4 parâmetros) para `createAiPreferencesRouter`
 * — Cérebro da IA v3, Fase 3. Mesmo padrão exato de `aiProfileErrorHandler`:
 * só `TenantNotFoundError` é mapeado (preferências ausentes = `null`, uma
 * resposta válida, não um erro); erros de forma do input já são resolvidos
 * por `validateOrRespond` (400) dentro do router.
 *
 * IMPORTANTE (D17): montado ESCOPADO ao path do próprio router — ver
 * `index.ts`.
 */
export function createAiPreferencesErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    logger.error('Erro não tratado nas rotas de ai-preferences', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
