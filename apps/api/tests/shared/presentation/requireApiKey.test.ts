import express, { Express, NextFunction, Request, Response } from 'express';
import request from 'supertest';
import {
  createRequireApiKey,
  RequestWithTenant,
} from '../../../src/shared/presentation/requireApiKey';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { Logger } from '../../../src/shared/domain/Logger';
import { ApiKeyHasher } from '../../../src/shared/security/domain/ApiKeyHasher';
import { TenantRepository } from '../../../src/shared/tenant/domain/TenantRepository';
import { FakeApiKeyHasher } from '../security/FakeApiKeyHasher';
import { FakeTenantRepository } from '../tenant/FakeTenantRepository';

/**
 * Handler de sondagem: só existe para o teste observar o que
 * `requireApiKey` anexou em `req.tenant` depois de deixar passar a
 * requisição (`next()`).
 */
function probeHandler(req: Request, res: Response): void {
  res.status(200).json({ tenant: (req as RequestWithTenant).tenant ?? null });
}

/**
 * Monta um Express real com `requireApiKey` na frente de duas rotas de
 * sondagem (com e sem `:tenantId`) e um error handler mínimo — só para
 * tornar `next(error)` observável como uma resposta HTTP (500), do mesmo
 * jeito que `whatsAppErrorHandler` faz para o router real.
 *
 * Mesmo padrão de `whatsAppSessionsRouter.test.ts`: sincroniza pelo ciclo
 * HTTP real do `supertest`, nunca por contagem manual de microtasks
 * (`await Promise.resolve()`/`setImmediate`), que se mostrou frágil aqui —
 * a profundidade da cadeia de promises entre `requireApiKey` →
 * `resolveTenantFromApiKey` → `TenantRepository.findByApiKeyHash` não é uma
 * constante estável para se contar ticks manualmente, e o `supertest`
 * elimina esse problema por construção: ele só resolve depois que o Express
 * de fato despachou uma resposta.
 */
function buildApp(
  apiKeyHasher: ApiKeyHasher,
  tenantRepository: TenantRepository,
  logger: Logger,
): Express {
  const app = express();
  const middleware = createRequireApiKey(apiKeyHasher, tenantRepository, logger);

  app.get('/protegido', middleware, probeHandler);
  app.get('/protegido/:tenantId', middleware, probeHandler);

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

describe('requireApiKey', () => {
  it('responde 401 quando o header X-API-Key está ausente, sem seguir para o handler', async () => {
    const app = buildApp(new FakeApiKeyHasher(), new FakeTenantRepository(), new NoopLogger());

    const response = await request(app).get('/protegido');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: 'missing_api_key' });
  });

  it('responde 401 quando a API key não corresponde a nenhum tenant, sem seguir para o handler', async () => {
    const app = buildApp(new FakeApiKeyHasher(), new FakeTenantRepository(), new NoopLogger());

    const response = await request(app).get('/protegido').set('x-api-key', 'chave-inexistente');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: 'invalid_api_key' });
  });

  it('com API key válida e sem :tenantId na rota, anexa req.tenant e segue para o handler', async () => {
    const hasher = new FakeApiKeyHasher();
    const tenantRepository = new FakeTenantRepository();
    const apiKeyHash = hasher.hash('chave-valida');
    tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash, plan: 'pro' });
    const app = buildApp(hasher, tenantRepository, new NoopLogger());

    const response = await request(app).get('/protegido').set('x-api-key', 'chave-valida');

    expect(response.status).toBe(200);
    expect(response.body.tenant).toEqual({
      id: 'tenant-1',
      name: 'Empresa Teste',
      apiKeyHash,
      plan: 'pro',
    });
  });

  it('com API key válida e :tenantId na rota IGUAL ao tenant autenticado, segue para o handler', async () => {
    const hasher = new FakeApiKeyHasher();
    const tenantRepository = new FakeTenantRepository();
    tenantRepository.seed({
      id: 'tenant-1',
      name: 'Empresa Teste',
      apiKeyHash: hasher.hash('chave-valida'),
    });
    const app = buildApp(hasher, tenantRepository, new NoopLogger());

    const response = await request(app).get('/protegido/tenant-1').set('x-api-key', 'chave-valida');

    expect(response.status).toBe(200);
    expect(response.body.tenant).toMatchObject({ id: 'tenant-1' });
  });

  it('[fecha o IDOR] com API key válida MAS :tenantId da rota DIFERENTE do tenant autenticado, responde 403', async () => {
    const hasher = new FakeApiKeyHasher();
    const tenantRepository = new FakeTenantRepository();
    tenantRepository.seed({
      id: 'tenant-1',
      name: 'Empresa Teste',
      apiKeyHash: hasher.hash('chave-do-tenant-1'),
    });
    const app = buildApp(hasher, tenantRepository, new NoopLogger());

    // Autentica como tenant-1, mas tenta acessar a rota de tenant-2.
    const response = await request(app)
      .get('/protegido/tenant-2')
      .set('x-api-key', 'chave-do-tenant-1');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'tenant_mismatch' });
  });

  it('nunca loga o valor cru do header X-API-Key (sanitizeHeaders aplicado)', async () => {
    const logger = new NoopLogger();
    const warnSpy = jest.spyOn(logger, 'warn');
    const app = buildApp(new FakeApiKeyHasher(), new FakeTenantRepository(), logger);

    await request(app).get('/protegido').set('x-api-key', 'valor-secreto-nao-pode-vazar');

    expect(warnSpy).toHaveBeenCalled();
    const loggedMeta = warnSpy.mock.calls[0][1] as { headers: Record<string, unknown> };
    expect(loggedMeta.headers['x-api-key']).toBe('[REDACTED]');
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('valor-secreto-nao-pode-vazar');
  });

  it('repassa erros inesperados via next(error) — chegam ao error handler genérico, não a uma resposta do próprio middleware', async () => {
    const tenantRepository = new FakeTenantRepository();
    jest.spyOn(tenantRepository, 'findByApiKeyHash').mockRejectedValue(new Error('falha de banco'));
    const app = buildApp(new FakeApiKeyHasher(), tenantRepository, new NoopLogger());

    const response = await request(app).get('/protegido').set('x-api-key', 'qualquer-chave');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ error: 'internal_error' });
  });
});
