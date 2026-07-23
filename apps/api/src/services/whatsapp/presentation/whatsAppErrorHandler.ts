import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { WhatsAppSessionNotFoundError } from '../domain/errors/WhatsAppSessionNotFoundError';
import { WhatsAppQRCodeNotAvailableError } from '../domain/errors/WhatsAppQRCodeNotAvailableError';

/**
 * Middleware de erro (Express, 4 parâmetros) para `createWhatsAppSessionsRouter`.
 * Mapeia por `instanceof` (nunca por texto de mensagem — mesmo motivo
 * documentado nos próprios erros de Domain).
 *
 * `TenantNotFoundError` mapeado a partir da Milestone 3, Bloco 5 (D14 do
 * levantamento arquitetural — bug pré-existente corrigido aqui):
 * `WhatsAppSessionService.assertTenantExists()` já lança este erro desde a
 * Production Hardening, mas este handler nunca o reconhecia — caía sempre
 * no branch genérico (500), nunca no 404 semântico que o chamador deveria
 * receber. Mesma correção replicada em `conversationsErrorHandler`/
 * `aiInteractionsErrorHandler` (Bloco 5), que já nascem cientes deste caso.
 *
 * IMPORTANTE (D17 do levantamento arquitetural — correção do bug de
 * encadeamento): a partir do Bloco 5 este handler é montado ESCOPADO ao
 * path do próprio router (`app.use('/api/tenants/:tenantId/whatsapp-sessions',
 * ...)`), nunca mais globalmente sem path — ver `index.ts`. Montá-lo sem
 * path (como antes do Bloco 5) fazia com que ele participasse da cadeia de
 * QUALQUER rota da aplicação (inclusive as novas de `conversations`/`ai`) e,
 * como este handler nunca chama `next(error)` para um erro desconhecido
 * (só no caso `headersSent`), um erro de outro bounded context era engolido
 * aqui antes de alcançar o handler correto.
 */
export function createWhatsAppErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof WhatsAppSessionNotFoundError) {
      res.status(404).json({ error: 'session_not_found', message: error.message });
      return;
    }
    if (error instanceof WhatsAppQRCodeNotAvailableError) {
      res.status(409).json({ error: 'qr_code_not_available', message: error.message });
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    logger.error('Erro não tratado nas rotas de sessão do WhatsApp', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
