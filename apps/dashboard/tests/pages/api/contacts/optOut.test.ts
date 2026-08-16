import optOutHandler from '../../../../pages/api/contacts/[contactId]/opt-out';
import optInHandler from '../../../../pages/api/contacts/[contactId]/opt-in';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';

jest.mock('../../../../lib/dashboardSession');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

/**
 * Testes dos proxies de consentimento (Fase L, Bloco L2): encaminhamento de
 * status/corpo para `apps/api`, mesmo padrão de `pages/api/users/index.test.ts`.
 */
describe('proxies /api/contacts/[contactId]/opt-out|opt-in (Fase L, Bloco L2)', () => {
  const originalFetch = global.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.API_BASE_URL = 'http://api-de-teste:4000';
    (requireSession as jest.Mock).mockResolvedValue(SESSION);
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env.API_BASE_URL = originalApiBaseUrl;
  });

  function mockApi(status: number, body: unknown): void {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ status, text: async () => JSON.stringify(body) }) as unknown as typeof fetch;
  }

  describe('opt-out', () => {
    it('POST: monta o path com o contactId escapado e devolve o contato', async () => {
      mockApi(200, { contact: { id: 'contact-1', optOutAt: '2026-08-16T00:00:00.000Z' } });
      const req = createFakeReq({ method: 'POST', query: { contactId: 'contact-1' } });
      const res = createFakeRes();

      await optOutHandler(req, res);

      const [url, init] = (fetch as jest.Mock).mock.calls[0];
      expect(String(url)).toBe(
        'http://api-de-teste:4000/api/tenants/tenant-1/contacts/contact-1/opt-out',
      );
      expect(init.method).toBe('POST');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('erro de negócio da API passa intacto (404 contact_not_found)', async () => {
      mockApi(404, { error: 'contact_not_found' });
      const req = createFakeReq({ method: 'POST', query: { contactId: 'contact-fantasma' } });
      const res = createFakeRes();

      await optOutHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'contact_not_found' });
    });

    it('método errado: 405, nunca chama a API', async () => {
      const req = createFakeReq({ method: 'GET', query: { contactId: 'contact-1' } });
      const res = createFakeRes();

      await optOutHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('opt-in', () => {
    it('POST: monta o path com o contactId escapado e devolve o contato', async () => {
      mockApi(200, { contact: { id: 'contact-1', optOutAt: undefined } });
      const req = createFakeReq({ method: 'POST', query: { contactId: 'contact-1' } });
      const res = createFakeRes();

      await optInHandler(req, res);

      const [url] = (fetch as jest.Mock).mock.calls[0];
      expect(String(url)).toBe(
        'http://api-de-teste:4000/api/tenants/tenant-1/contacts/contact-1/opt-in',
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('método errado: 405, nunca chama a API', async () => {
      const req = createFakeReq({ method: 'DELETE', query: { contactId: 'contact-1' } });
      const res = createFakeRes();

      await optInHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
