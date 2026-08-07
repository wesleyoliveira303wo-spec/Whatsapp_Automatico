import express, { Express } from 'express';
import request from 'supertest';
import { createInternalMediaRouter } from '../../../../src/services/whatsapp/presentation/internalMediaRouter';
import { requireInternalSecret } from '../../../../src/shared/presentation/requireInternalSecret';
import { FakeMediaDownloader } from '../infrastructure/FakeMediaDownloader';

function buildApp(mediaDownloader: FakeMediaDownloader, secret = 'segredo-de-teste'): Express {
  const app = express();
  app.use(express.json());
  app.use(
    '/internal/media',
    requireInternalSecret(secret),
    createInternalMediaRouter(mediaDownloader),
  );
  return app;
}

const VALID_BODY = {
  tenantId: 'tenant-1',
  sessionName: 'sessao-1',
  contentType: 'image',
  mimeType: 'image/jpeg',
  url: 'https://x.enc',
  mediaKeyEncrypted: 'enc:abc',
};

describe('internalMediaRouter (Fase 1, Bloco F1.2)', () => {
  it('sem o header de segredo interno: 401, nunca chega no MediaDownloader', async () => {
    const mediaDownloader = new FakeMediaDownloader();
    const app = buildApp(mediaDownloader);

    const response = await request(app).post('/internal/media/download').send(VALID_BODY);

    expect(response.status).toBe(401);
    expect(mediaDownloader.downloadCalls).toHaveLength(0);
  });

  it('com o segredo correto e MediaDownloader retornando um Buffer: 200, corpo binário, Content-Type do mimeType', async () => {
    const mediaDownloader = new FakeMediaDownloader();
    mediaDownloader.nextResult = Buffer.from('conteudo-fake');
    const app = buildApp(mediaDownloader);

    const response = await request(app)
      .post('/internal/media/download')
      .set('x-internal-secret', 'segredo-de-teste')
      .send(VALID_BODY);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.compare(response.body, Buffer.from('conteudo-fake'))).toBe(0);
    expect(mediaDownloader.downloadCalls).toEqual([
      {
        tenantId: 'tenant-1',
        sessionName: 'sessao-1',
        media: {
          contentType: 'image',
          mimeType: 'image/jpeg',
          url: 'https://x.enc',
          mediaKeyEncrypted: 'enc:abc',
        },
      },
    ]);
  });

  it('MediaDownloader devolve undefined (mídia indisponível): 404 media_unavailable', async () => {
    const mediaDownloader = new FakeMediaDownloader();
    mediaDownloader.nextResult = undefined;
    const app = buildApp(mediaDownloader);

    const response = await request(app)
      .post('/internal/media/download')
      .set('x-internal-secret', 'segredo-de-teste')
      .send(VALID_BODY);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'media_unavailable' });
  });

  it('corpo inválido (campo obrigatório ausente): 400, nunca chega no MediaDownloader', async () => {
    const mediaDownloader = new FakeMediaDownloader();
    const app = buildApp(mediaDownloader);

    const response = await request(app)
      .post('/internal/media/download')
      .set('x-internal-secret', 'segredo-de-teste')
      .send({ ...VALID_BODY, tenantId: undefined });

    expect(response.status).toBe(400);
    expect(mediaDownloader.downloadCalls).toHaveLength(0);
  });

  it('contentType fora do enum aceito: 400', async () => {
    const mediaDownloader = new FakeMediaDownloader();
    const app = buildApp(mediaDownloader);

    const response = await request(app)
      .post('/internal/media/download')
      .set('x-internal-secret', 'segredo-de-teste')
      .send({ ...VALID_BODY, contentType: 'nao-existe' });

    expect(response.status).toBe(400);
  });
});
