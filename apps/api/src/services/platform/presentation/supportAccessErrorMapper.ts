import { Response } from 'express';

import {
  SupportAccessAlreadyOpenError,
  SupportAccessForbiddenError,
  SupportAccessNotFoundError,
  SupportAccessWrongStateError,
} from '../domain/errors/SupportAccessErrors';

/**
 * Traduz os erros de domínio do acesso assistido (Fase 5) para HTTP. Chamado
 * pelos DOIS error handlers que cobrem rotas de suporte: o de plataforma
 * (`/api/platform/support/*`) e o tenant-scoped
 * (`/api/tenants/:tenantId/support-access/*`) — mesma tabela num lugar só.
 *
 * Devolve `true` se tratou o erro (resposta já enviada), `false` se não é um
 * erro de suporte.
 */
export function mapSupportAccessError(error: unknown, res: Response): boolean {
  if (error instanceof SupportAccessNotFoundError) {
    res.status(404).json({ error: 'support_access_not_found' });
    return true;
  }
  if (error instanceof SupportAccessAlreadyOpenError) {
    res.status(409).json({
      error: 'support_access_already_open',
      message: 'Já há um pedido de acesso aberto para este cliente.',
    });
    return true;
  }
  if (error instanceof SupportAccessWrongStateError) {
    res.status(409).json({ error: 'support_access_wrong_state', message: error.message });
    return true;
  }
  if (error instanceof SupportAccessForbiddenError) {
    res.status(403).json({ error: 'support_access_forbidden', message: error.message });
    return true;
  }
  return false;
}
