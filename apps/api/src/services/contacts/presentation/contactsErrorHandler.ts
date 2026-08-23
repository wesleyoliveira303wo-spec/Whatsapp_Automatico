import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { TooManyImportRowsError } from '../domain/errors/TooManyImportRowsError';
import { ContactNotFoundError } from '../domain/errors/ContactNotFoundError';
import { ContactPhoneAlreadyExistsError } from '../domain/errors/ContactPhoneAlreadyExistsError';

/**
 * Middleware de erro (Express, 4 parâmetros) para `createContactsRouter` —
 * Fase L, Blocos L1/L1b/L2. Mapeia `TenantNotFoundError` (404),
 * `ContactNotFoundError` (404, Bloco L2 — opt-out/opt-in de um `id`
 * inexistente/de outro tenant) e `TooManyImportRowsError` (413, mesmo código
 * de "arquivo grande demais" já usado para mídia). Erros de forma do input
 * (query inválida, corpo vazio) já são resolvidos por
 * `validateOrRespond`/checagem manual dentro do router (400).
 *
 * Montado ESCOPADO ao path do router (D17), nunca globalmente — ver `index.ts`.
 */
export function createContactsErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    if (error instanceof ContactNotFoundError) {
      res.status(404).json({ error: 'contact_not_found', message: error.message });
      return;
    }
    if (error instanceof ContactPhoneAlreadyExistsError) {
      res.status(409).json({ error: 'contact_phone_already_exists', message: error.message });
      return;
    }
    if (error instanceof TooManyImportRowsError) {
      res.status(413).json({
        error: 'too_many_import_rows',
        message: `A planilha tem ${error.rowCount} linhas; o máximo suportado é ${error.maxRows}.`,
      });
      return;
    }
    logger.error('Erro não tratado nas rotas de contatos', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
