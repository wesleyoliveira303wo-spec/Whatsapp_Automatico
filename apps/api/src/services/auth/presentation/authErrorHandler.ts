import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';

/**
 * Error handler do router de auth (Milestone 5, Bloco M5C). As falhas de
 * NEGOCIO (login/refresh invalidos) sao RESULTADOS tratados no proprio router
 * (401), nao excecoes — entao aqui so resta o caminho INESPERADO (500).
 * Montado ESCOPADO ao path (D17), nunca global.
 */
export function createAuthErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    logger.error('Erro nao tratado nas rotas de auth', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
