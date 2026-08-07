import { callApi, getApiBaseUrl } from '../../lib/apiClient';

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave-secreta' };

function mockFetchOnce(status: number, body: unknown, textOverride?: string): jest.Mock {
  const text =
    textOverride !== undefined ? textOverride : body === undefined ? '' : JSON.stringify(body);
  const fetchMock = jest.fn().mockResolvedValue({
    status,
    text: async () => text,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('apiClient', () => {
  const originalApiBaseUrl = process.env.API_BASE_URL;

  beforeEach(() => {
    process.env.API_BASE_URL = 'http://api-de-teste:4000';
  });

  afterAll(() => {
    process.env.API_BASE_URL = originalApiBaseUrl;
  });

  describe('getApiBaseUrl', () => {
    it('lança quando API_BASE_URL não está configurada', () => {
      delete process.env.API_BASE_URL;
      expect(() => getApiBaseUrl()).toThrow(/API_BASE_URL/);
    });
  });

  describe('callApi', () => {
    it('monta a URL com o tenantId da sessão e injeta X-API-Key', async () => {
      const fetchMock = mockFetchOnce(200, { sessions: [] });

      await callApi(SESSION, '');

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe('http://api-de-teste:4000/api/tenants/tenant-1/whatsapp-sessions');
      expect((init.headers as Record<string, string>)['X-API-Key']).toBe('chave-secreta');
    });

    it('encaminha status e body decodificado', async () => {
      mockFetchOnce(200, { sessions: [{ sessionName: 'vendas' }] });

      const result = await callApi(SESSION, '');

      expect(result).toEqual({ status: 200, body: { sessions: [{ sessionName: 'vendas' }] } });
    });

    it('trata corpo vazio (204) sem lançar, devolvendo body undefined', async () => {
      mockFetchOnce(204, undefined, '');

      const result = await callApi(SESSION, '/vendas', { method: 'DELETE' });

      expect(result).toEqual({ status: 204, body: undefined });
    });

    it('anexa path e query string corretamente', async () => {
      const fetchMock = mockFetchOnce(200, { events: [] });

      await callApi(SESSION, '/vendas/history', { query: { limit: 10 } });

      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toBe(
        'http://api-de-teste:4000/api/tenants/tenant-1/whatsapp-sessions/vendas/history?limit=10',
      );
    });

    it('omite parâmetros de query com valor undefined', async () => {
      const fetchMock = mockFetchOnce(200, { events: [] });

      await callApi(SESSION, '/vendas/history', { query: { limit: undefined } });

      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toBe(
        'http://api-de-teste:4000/api/tenants/tenant-1/whatsapp-sessions/vendas/history',
      );
    });

    it('envia Content-Type e body serializado quando body é fornecido (POST)', async () => {
      const fetchMock = mockFetchOnce(200, { sessionName: 'vendas' });

      await callApi(SESSION, '', { method: 'POST', body: { sessionName: 'vendas' } });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(init.body).toBe(JSON.stringify({ sessionName: 'vendas' }));
    });

    // --- Milestone 5, Bloco M5F-1: sessao de PESSOA usa Bearer, nao X-API-Key ---
    it('sessao de PESSOA (accessToken): injeta Authorization Bearer e NAO envia X-API-Key', async () => {
      const fetchMock = mockFetchOnce(200, { sessions: [] });
      const userSession = {
        tenantId: 'tenant-1',
        accessToken: 'acc-123',
        refreshToken: 'ref-123',
        user: {
          id: 'user-1',
          email: 'maria@empresa.com',
          role: 'operator',
          mustChangePassword: false,
        },
      };

      await callApi(userSession, '');

      const [, init] = fetchMock.mock.calls[0];
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer acc-123');
      expect(headers['X-API-Key']).toBeUndefined();
    });
  });
});
