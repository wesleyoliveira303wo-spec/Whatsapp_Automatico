import { NextFunction, Request, RequestHandler, Response } from 'express';
import { Logger } from '../domain/Logger';
import { ApiKeyHasher } from '../security/domain/ApiKeyHasher';
import { TenantRepository } from '../tenant/domain/TenantRepository';
import { Tenant } from '../tenant/domain/Tenant';
import { resolveTenantFromApiKey } from '../tenant/application/resolveTenantFromApiKey';
import { sanitizeHeaders } from '../infrastructure/logging/sanitizeHeaders';
import { AccessTokenService } from '../../services/auth/domain/AccessTokenService';
import { UserRole } from '../../services/auth/domain/entities/User';
import { SupportAccessTokenService } from '../../services/platform/domain/SupportAccessTokenService';
import { SupportAccessVerifier } from '../../services/platform/domain/providers/SupportAccessVerifier';
import { RequestWithAuthUser } from './requireUser';
import { RequestWithTenant } from './requireApiKey';

const AUTHORIZATION_HEADER = 'authorization';
const API_KEY_HEADER = 'x-api-key';
const SUPPORT_TOKEN_HEADER = 'x-support-token';
const BEARER_PREFIX = 'Bearer ';

/**
 * Ator autenticado — Milestone 5, Bloco M5D. Dois "planos":
 * - `user`: uma PESSOA (crachá/access token), com `role` para o RBAC.
 * - `machine`: o lado MÁQUINA (chave da empresa / API key), confiável — tem
 *   acesso total (o worker/integracoes usam este plano; ADR #45/#54).
 */
export type Principal =
  | { kind: 'user'; userId: string; tenantId: string; role: UserRole }
  | { kind: 'machine'; tenantId: string }
  /**
   * Plano SUPORTE (Painel `/admin`, Fase 5) — um `PlatformUser` operando o
   * tenant dentro de uma janela de acesso assistido. Resolvido só depois de
   * `SupportAccessVerifier` reconfirmar no banco que o `TenantAccessRequest`
   * está `accepted` e dentro do prazo (Regra inviolável 1). Tem acesso total,
   * como o plano `machine` (decisão #5).
   */
  | { kind: 'support'; tenantId: string; platformUserId: string; supportAccessId: string };

/** `Request` enriquecida com o ator resolvido — lido por `requirePermission` e pelas rotas. */
export interface RequestWithPrincipal extends Request {
  principal?: Principal;
}

/**
 * Middleware de autenticacao DE DOIS PLANOS (o "porteiro dois-em-um") —
 * Milestone 5, Bloco M5D. Aceita a requisicao se vier COM crachá de pessoa
 * (`Authorization: Bearer`) OU com a chave da empresa (`X-API-Key`), e resolve
 * o `req.principal` de acordo.
 *
 * Existe para permitir que as salas ja existentes (conversas, sessoes)
 * continuem aceitando a chave da empresa (o Dashboard usa isso HOJE) e passem
 * a aceitar tambem o crachá de pessoa (o Dashboard vai usar a partir do M5F) —
 * sem quebrar nada. A chave da empresa continua sendo o plano MAQUINA
 * (confiavel), exatamente como antes (ADR #45/#54 preservadas).
 *
 * Reaproveita `resolveTenantFromApiKey` (mesma logica do `requireApiKey`) e o
 * `AccessTokenService.verify` (mesma do `requireUser`) — nao reimplementa
 * verificacao. Faz a mesma checagem de IDOR (tenant do ator == `:tenantId` da
 * URL) que os dois ja fazem.
 */
export function createAuthenticate(
  accessTokenService: AccessTokenService | null,
  apiKeyHasher: ApiKeyHasher,
  tenantRepository: TenantRepository,
  logger: Logger,
  /**
   * Fase 5 do `/admin` — OPCIONAIS: sem os dois, o plano `support` fica
   * desligado (comportamento pré-Fase 5). Presentes, uma requisição com
   * `X-Support-Token` é resolvida como `principal.kind === 'support'` DEPOIS
   * de o verifier reconfirmar o acesso no banco.
   */
  supportAccessTokenService?: SupportAccessTokenService,
  supportAccessVerifier?: SupportAccessVerifier,
): RequestHandler {
  return function authenticate(req: Request, res: Response, next: NextFunction): void {
    // --- Plano SUPORTE (crachá de acesso assistido, Fase 5) ---
    const supportToken = req.header(SUPPORT_TOKEN_HEADER);
    if (supportToken) {
      if (!supportAccessTokenService || !supportAccessVerifier) {
        res.status(401).json({
          error: 'support_access_unavailable',
          message: 'Acesso assistido não está configurado nesta instância.',
        });
        return;
      }
      const claims = supportAccessTokenService.verify(supportToken);
      if (!claims) {
        res.status(401).json({
          error: 'invalid_support_token',
          message: 'Crachá de suporte inválido ou expirado.',
        });
        return;
      }
      if (!tenantMatches(req, claims.tenantId)) {
        res.status(403).json({
          error: 'tenant_mismatch',
          message: 'O crachá de suporte não autoriza acesso a este tenant.',
        });
        return;
      }
      void (async () => {
        try {
          // REGRA INVIOLÁVEL 1 (§9.3): a validade é reconferida no BANCO a
          // cada requisição, contra `TenantAccessRequest.status`/`expiresAt` —
          // nunca só pela validade do token. Uma revogação do cliente derruba
          // o acesso na requisição seguinte.
          const verification = await supportAccessVerifier.verify(claims.supportAccessId);
          if (!verification.ok || verification.tenantId !== claims.tenantId) {
            res.status(403).json({
              error: 'support_access_ended',
              message: 'O acesso de suporte não está mais ativo.',
            });
            return;
          }
          (req as RequestWithPrincipal).principal = {
            kind: 'support',
            tenantId: claims.tenantId,
            platformUserId: claims.platformUserId,
            supportAccessId: claims.supportAccessId,
          };
          next();
        } catch (error) {
          next(error);
        }
      })();
      return;
    }

    const authHeader = req.headers[AUTHORIZATION_HEADER];

    // --- Plano PESSOA (crachá) ---
    if (typeof authHeader === 'string' && authHeader.startsWith(BEARER_PREFIX)) {
      // `accessTokenService` nulo = auth de usuario nao configurada
      // (sem ACCESS_TOKEN_SECRET): nenhum crachá pode ser verificado -> 401.
      const claims = accessTokenService
        ? accessTokenService.verify(authHeader.slice(BEARER_PREFIX.length).trim())
        : null;
      if (!claims) {
        res.status(401).json({
          error: 'invalid_access_token',
          message: 'Crachá de acesso invalido ou expirado.',
        });
        return;
      }
      if (!tenantMatches(req, claims.tenantId)) {
        res.status(403).json({
          error: 'tenant_mismatch',
          message: 'O crachá nao autoriza acesso a este tenant.',
        });
        return;
      }
      // R1 da auditoria de seguranca (2026-08-26): `mustChangePassword` era
      // imposto SO no frontend do Dashboard (`getServerSideProps`) — uma
      // chamada direta a API com o access token contornava a exigencia por
      // completo. Bloqueado aqui, no unico portao que TODAS as rotas de
      // negocio atravessam (conversas, sessoes, usuarios, campanhas...).
      // O router de auth (`/auth/*`) NAO passa por este middleware (usa
      // `requireUser` direto) — por isso `change-password`/`logout`/`me`
      // continuam acessiveis mesmo com a flag ligada (o usuario PRECISA
      // conseguir trocar a senha e sair).
      if (claims.mustChangePassword) {
        res.status(403).json({
          error: 'must_change_password',
          message: 'Troque sua senha provisoria antes de continuar.',
        });
        return;
      }
      const principal: Principal = {
        kind: 'user',
        userId: claims.userId,
        tenantId: claims.tenantId,
        role: claims.role,
      };
      (req as RequestWithPrincipal).principal = principal;
      (req as RequestWithAuthUser).authUser = claims;
      next();
      return;
    }

    // --- Plano MAQUINA (chave da empresa) ---
    const apiKey = req.header(API_KEY_HEADER);
    if (apiKey) {
      void (async () => {
        try {
          const tenant: Tenant | null = await resolveTenantFromApiKey(
            apiKeyHasher,
            tenantRepository,
            apiKey,
          );
          if (!tenant) {
            logger.warn('Requisicao recusada: API key invalida', {
              headers: sanitizeHeaders(req.headers as Record<string, unknown>),
            });
            res.status(401).json({ error: 'invalid_api_key', message: 'API key invalida.' });
            return;
          }
          if (!tenantMatches(req, tenant.id)) {
            res.status(403).json({
              error: 'tenant_mismatch',
              message: 'A API key nao autoriza acesso a este tenant.',
            });
            return;
          }
          (req as RequestWithPrincipal).principal = { kind: 'machine', tenantId: tenant.id };
          (req as RequestWithTenant).tenant = tenant;
          next();
        } catch (error) {
          next(error);
        }
      })();
      return;
    }

    res.status(401).json({
      error: 'missing_credentials',
      message: 'Informe um crachá (Authorization: Bearer) ou a API key (X-API-Key).',
    });
  };
}

/**
 * Onda 3 do redesign (2026-08-23) — antes falhava ABERTO: sem `:tenantId` no
 * path, a checagem devolvia `true` (liberava). Hoje é seguro na prática
 * porque todo mount de `authenticate` (ver `index.ts`) vive sob
 * `/api/tenants/:tenantId/...`, então `req.params.tenantId` está sempre
 * presente — mas uma rota nova montada sem esse prefixo herdaria acesso
 * cross-tenant por omissão, em vez de ser barrada por padrão. Corrigido para
 * falhar FECHADO: exige o parâmetro presente E igual ao tenant da API key.
 */
function tenantMatches(req: Request, principalTenantId: string): boolean {
  const tenantIdFromPath = req.params.tenantId;
  return tenantIdFromPath !== undefined && tenantIdFromPath === principalTenantId;
}
