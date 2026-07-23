import { NextFunction, Request, RequestHandler, Response } from 'express';
import { Logger } from '../domain/Logger';
import { ApiKeyHasher } from '../security/domain/ApiKeyHasher';
import { TenantRepository } from '../tenant/domain/TenantRepository';
import { Tenant } from '../tenant/domain/Tenant';
import { resolveTenantFromApiKey } from '../tenant/application/resolveTenantFromApiKey';
import { sanitizeHeaders } from '../infrastructure/logging/sanitizeHeaders';

const API_KEY_HEADER = 'x-api-key';

/** Enriquecimento de `Request` usado por qualquer rota protegida para ler o tenant já
 * autenticado sem repetir a resolução da API key nas rotas. */
export interface RequestWithTenant extends Request {
  tenant?: Tenant;
}

/**
 * Middleware Express de autenticação por `X-API-Key` (Production Hardening,
 * Bloco 6 — decisão fechada: header customizado, não `Authorization: Bearer`;
 * ver DECISIONS.md).
 *
 * MOVIDO de `services/whatsapp/presentation/` para `shared/presentation/`
 * na Milestone 3, Bloco 5 (D9 do levantamento arquitetural): até o Bloco 4,
 * o único consumidor real era o router de sessões do WhatsApp — a própria
 * docstring original deste arquivo já previa "extrair para um local
 * compartilhado antes de existir um segundo consumidor repetiria o erro de
 * abstração prematura". O Bloco 5 introduz o segundo (`conversationsRouter`)
 * e o terceiro (`aiInteractionsRouter`) consumidores — o gatilho que a
 * docstring original previu agora existe, e mover ANTES de qualquer um dos
 * dois novos routers importar de dentro de `services/whatsapp/presentation/`
 * evita o acoplamento lateral entre bounded contexts que a existência deste
 * arquivo ali passaria a causar.
 *
 * Responsabilidades, nesta ordem:
 * 1. Extrair o header `X-API-Key` — ausente → 401.
 * 2. Resolver o tenant dono da chave via `resolveTenantFromApiKey` (função
 *    pura, só hash + lookup) — chave inválida/não encontrada → 401.
 * 3. Se a rota tiver `:tenantId` no path, confirmar que o tenant AUTENTICADO
 *    é o MESMO referenciado na URL — divergência → 403. Sem este passo, uma
 *    empresa com uma API key própria e válida ainda poderia acessar rotas de
 *    OUTRO tenant só trocando o `tenantId` na URL, o que anularia o próprio
 *    propósito desta milestone (C1 — IDOR). Este é o passo de AUTORIZAÇÃO
 *    (é este tenant quem pode agir sobre este recurso?), distinto do passo 2
 *    de AUTENTICAÇÃO (quem é o dono desta chave?) — por isso vive aqui, no
 *    middleware (que conhece `req.params`), e não em `resolveTenantFromApiKey`
 *    (que deliberadamente não sabe nada de HTTP/rotas).
 * 4. Anexar o tenant resolvido em `req.tenant` (ver `RequestWithTenant`) e
 *    chamar `next()` — cada router consome isso no lugar de aceitar
 *    `tenantId` só do path, sem verificação.
 *
 * Nunca loga o header cru (`sanitizeHeaders`) — nem em rejeição, nem em
 * qualquer outro caminho.
 *
 * Dependências recebidas por fábrica (`createRequireApiKey`), não
 * construídas aqui — mesmo padrão de `createWhatsAppErrorHandler`/
 * `createWhatsAppSessionsRouter`: quem monta é o composition root de cada
 * bounded context, este arquivo só conhece as portas (`ApiKeyHasher`,
 * `TenantRepository`).
 */
export function createRequireApiKey(apiKeyHasher: ApiKeyHasher, tenantRepository: TenantRepository, logger: Logger): RequestHandler {
  return function requireApiKey(req: Request, res: Response, next: NextFunction): void {
    void (async () => {
      try {
        const apiKey = req.header(API_KEY_HEADER);
        if (!apiKey) {
          logger.warn('Requisição recusada: header X-API-Key ausente', {
            headers: sanitizeHeaders(req.headers as Record<string, unknown>),
          });
          res.status(401).json({ error: 'missing_api_key', message: 'Header X-API-Key é obrigatório.' });
          return;
        }

        const tenant = await resolveTenantFromApiKey(apiKeyHasher, tenantRepository, apiKey);
        if (!tenant) {
          logger.warn('Requisição recusada: API key inválida', {
            headers: sanitizeHeaders(req.headers as Record<string, unknown>),
          });
          res.status(401).json({ error: 'invalid_api_key', message: 'API key inválida.' });
          return;
        }

        const tenantIdFromPath = req.params.tenantId;
        if (tenantIdFromPath !== undefined && tenantIdFromPath !== tenant.id) {
          logger.warn('Requisição recusada: tenant autenticado não corresponde ao tenantId da URL', {
            authenticatedTenantId: tenant.id,
            requestedTenantId: tenantIdFromPath,
          });
          res.status(403).json({ error: 'tenant_mismatch', message: 'A API key não autoriza acesso a este tenant.' });
          return;
        }

        (req as RequestWithTenant).tenant = tenant;
        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}
