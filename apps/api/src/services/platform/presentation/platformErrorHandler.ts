import { ErrorRequestHandler } from 'express';

import { Logger } from '../../../shared/domain/Logger';
import { InvalidPlatformCredentialsError } from '../domain/errors/InvalidPlatformCredentialsError';
import { PlatformAccountLockedError } from '../domain/errors/PlatformAccountLockedError';
import { TenantControlNoOpError } from '../domain/errors/TenantControlNoOpError';
import { TenantNotFoundError } from '../domain/errors/TenantNotFoundError';

/**
 * Error handler das rotas `/api/platform` — montado ESCOPADO ao path (D17),
 * nunca global.
 *
 * Diferente do de auth, aqui as duas falhas de negócio do login SÃO exceções
 * (o `PlatformAuthService` lança, não devolve resultado), então elas são
 * traduzidas aqui — num lugar só, para nenhuma rota futura ter chance de
 * responder algo diferente de 401 para credencial inválida.
 */
export function createPlatformErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    if (error instanceof PlatformAccountLockedError) {
      const retryAfterSeconds = Math.ceil(error.retryAfterMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(423).json({
        error: 'account_locked',
        message: 'Muitas tentativas de acesso. Tente novamente em instantes.',
        retryAfterSeconds,
      });
      return;
    }

    // Fase 4 — ações de controle do tenant.
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: 'Tenant não encontrado.' });
      return;
    }

    if (error instanceof TenantControlNoOpError) {
      res.status(409).json({ error: 'no_op', message: error.message });
      return;
    }

    if (error instanceof InvalidPlatformCredentialsError) {
      res.status(401).json({ error: 'invalid_credentials', message: 'E-mail ou senha inválidos.' });
      return;
    }

    // O log é deliberadamente genérico: o corpo da resposta do `/admin` nunca
    // deve carregar detalhe interno, mesmo em 500.
    logger.error('Erro não tratado nas rotas de plataforma', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
