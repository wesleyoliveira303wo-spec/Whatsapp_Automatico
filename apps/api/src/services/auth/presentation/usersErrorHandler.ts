import { ErrorRequestHandler } from 'express';

import { Logger } from '../../../shared/domain/Logger';
import {
  EmailAlreadyInUseError,
  RoleNotAllowedError,
  SelfManagementError,
  UserNotFoundError,
  WeakTemporaryPasswordError,
} from '../domain/errors/userManagementErrors';

/**
 * Error handler das rotas de gestao de usuarios — Milestone 5, Bloco M5E-3.
 * Mapeia por `instanceof` (nunca por texto), mesmo padrao de
 * `conversationsErrorHandler`. Montado PATH-SCOPED em
 * `/api/tenants/:tenantId/users` (D17 — nunca global).
 */
export function createUsersErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof UserNotFoundError) {
      res.status(404).json({ error: 'user_not_found', message: 'Usuario nao encontrado.' });
      return;
    }
    if (error instanceof EmailAlreadyInUseError) {
      res.status(409).json({ error: 'email_already_in_use', message: 'Ja existe um usuario com este e-mail.' });
      return;
    }
    if (error instanceof RoleNotAllowedError) {
      res.status(403).json({ error: 'role_not_allowed', message: 'Seu cargo nao permite esta acao sobre este usuario.' });
      return;
    }
    if (error instanceof SelfManagementError) {
      res.status(422).json({ error: 'self_management_forbidden', message: 'Voce nao pode executar esta acao sobre a propria conta.' });
      return;
    }
    if (error instanceof WeakTemporaryPasswordError) {
      res.status(422).json({ error: 'weak_temporary_password', message: error.message });
      return;
    }
    logger.error('Erro nao tratado nas rotas de usuarios', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
