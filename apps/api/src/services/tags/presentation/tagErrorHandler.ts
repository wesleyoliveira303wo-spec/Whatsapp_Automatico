import { ErrorRequestHandler } from 'express';
import { Logger } from '../../../shared/domain/Logger';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { TagNotFoundError } from '../domain/errors/TagNotFoundError';

/** Duck-typing do erro de violação de constraint única do Prisma (P2002) — evita importar `Prisma` como VALOR de `@prisma/client` só para isto (mantém o padrão `import type` do resto do repositório, ver `PrismaTagRepository`). */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

/**
 * Middleware de erro (Express, 4 parâmetros) para `createTagRouter` e
 * `createConversationTagRouter` (Redesign 2026-08-05, R4). Mapeia
 * `TenantNotFoundError` (404), `TagNotFoundError` (404) e violação de nome
 * duplicado na mesma sessão (`@@unique([tenantId, sessionName, name])`,
 * P2002 → 409). Erros de forma do input (nome vazio, cor fora da paleta)
 * já são resolvidos por `validateOrRespond` (400) dentro dos routers.
 *
 * IMPORTANTE (D17): montado ESCOPADO ao path de cada router, nunca
 * globalmente — ver `index.ts`.
 */
export function createTagErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof TenantNotFoundError) {
      res.status(404).json({ error: 'tenant_not_found', message: error.message });
      return;
    }
    if (error instanceof TagNotFoundError) {
      res.status(404).json({ error: 'tag_not_found', message: error.message });
      return;
    }
    if (isUniqueConstraintViolation(error)) {
      res.status(409).json({
        error: 'tag_already_exists',
        message: 'Já existe uma tag com este nome nesta sessão.',
      });
      return;
    }
    logger.error('Erro não tratado nas rotas de tags', { error });
    res.status(500).json({ error: 'internal_error', message: 'Erro interno.' });
  };
}
