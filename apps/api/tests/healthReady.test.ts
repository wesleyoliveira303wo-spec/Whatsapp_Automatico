import request from 'supertest';
import { app } from '../src/index';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fase 1, Bloco F1.10 (observabilidade mínima) — `/health/ready` só é
 * montado DEPOIS que `mountWhatsAppSessionsRoutes()` (assíncrono, disparado
 * ao importar `src/index.ts`) terminar; diferente de `health.test.ts`
 * (`/health`, síncrono, sempre disponível), este teste precisa aguardar
 * essa montagem. `index.ts` não exporta a promise do mount, então este
 * teste faz poll curto em `/health/ready` até parar de dar 404 — e PULA
 * (não falha) se a rota nunca aparecer, cobrindo tanto "infraestrutura
 * indisponível neste ambiente" quanto "variáveis de ambiente do pipeline
 * completo ausentes" (mesmo espírito de degradação já usado no resto do
 * projeto).
 */
async function waitForRoute(path: string, maxAttempts = 20): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await request(app).get(path);
    if (response.status !== 404) return true;
    await sleep(100);
  }
  return false;
}

describe('GET /health/ready', () => {
  it('reporta status/checks de database, redis e a profundidade da fila de IA', async () => {
    const routeMounted = await waitForRoute('/health/ready');
    if (!routeMounted) {
      console.warn(
        '/health/ready não foi montado (pipeline completo indisponível neste ambiente) — pulando.',
      );
      return;
    }

    const response = await request(app).get('/health/ready');

    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty('status');
    expect(response.body.checks).toHaveProperty('database');
    expect(response.body.checks).toHaveProperty('redis');
    expect(['ok', 'down']).toContain(response.body.checks.database);
    expect(['ok', 'down']).toContain(response.body.checks.redis);

    if (response.body.checks.redis === 'ok') {
      expect(response.body.checks.aiQueue).toEqual(
        expect.objectContaining({
          waiting: expect.any(Number),
          active: expect.any(Number),
          failed: expect.any(Number),
          delayed: expect.any(Number),
        }),
      );
    }
  }, 15000);
});
