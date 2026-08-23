import {
  login,
  logout,
  fetchSessions,
  connectSession,
  fetchSessionDetail,
  disconnectSession,
  removeSession,
  fetchQrCode,
  fetchHistory,
  ClientApiError,
} from '../../lib/clientApi';

function mockFetchOnce(status: number, body: unknown, textOverride?: string): jest.Mock {
  const text =
    textOverride !== undefined ? textOverride : body === undefined ? '' : JSON.stringify(body);
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('clientApi (M2, Fase 4 — cliente do browser para as rotas BFF)', () => {
  it('login envia POST para /api/auth/login com tenantId e apiKey no corpo', async () => {
    const fetchMock = mockFetchOnce(200, { tenantId: 'tenant-1' });

    const result = await login('tenant-1', 'chave');

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ tenantId: 'tenant-1', apiKey: 'chave' });
    expect(result).toEqual({ tenantId: 'tenant-1' });
  });

  it('logout envia POST para /api/auth/logout', async () => {
    const fetchMock = mockFetchOnce(204, undefined, '');

    await logout();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/logout');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('fetchSessions faz GET em /api/sessions', async () => {
    mockFetchOnce(200, { sessions: [] });

    const result = await fetchSessions();

    expect(result).toEqual({ sessions: [] });
  });

  it('connectSession envia POST com sessionName no corpo', async () => {
    const fetchMock = mockFetchOnce(200, { sessionName: 'vendas' });

    await connectSession('vendas');

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/sessions');
    expect(JSON.parse(init.body)).toEqual({ sessionName: 'vendas' });
  });

  it('fetchSessionDetail codifica o sessionName na URL', async () => {
    const fetchMock = mockFetchOnce(200, { sessionName: 'time comercial' });

    await fetchSessionDetail('time comercial');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/sessions/time%20comercial');
  });

  it('disconnectSession envia DELETE em /api/sessions/:sessionName', async () => {
    const fetchMock = mockFetchOnce(204, undefined, '');

    await disconnectSession('vendas');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/sessions/vendas');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('removeSession envia DELETE em /api/sessions/:sessionName/remove', async () => {
    const fetchMock = mockFetchOnce(204, undefined, '');

    await removeSession('vendas');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/sessions/vendas/remove');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('fetchQrCode faz GET em /api/sessions/:sessionName/qrcode', async () => {
    mockFetchOnce(200, { qrCode: '2@abc...' });

    const result = await fetchQrCode('vendas');

    expect(result).toEqual({ qrCode: '2@abc...' });
  });

  it('fetchHistory omite a query string quando limit não é passado', async () => {
    const fetchMock = mockFetchOnce(200, { events: [] });

    await fetchHistory('vendas');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/sessions/vendas/history');
  });

  it('fetchHistory anexa ?limit= quando fornecido', async () => {
    const fetchMock = mockFetchOnce(200, { events: [] });

    await fetchHistory('vendas', 10);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/sessions/vendas/history?limit=10');
  });

  it('lança ClientApiError com status e body para respostas não-2xx', async () => {
    mockFetchOnce(401, { error: 'not_authenticated' });

    await expect(fetchSessions()).rejects.toMatchObject({
      status: 401,
      body: { error: 'not_authenticated' },
    });
    await expect(fetchSessions()).rejects.toBeInstanceOf(ClientApiError);
  });

  /**
   * Onda 3 do redesign (2026-08-23) — trava de regressão: este é o
   * `JSON.parse` que roda no NAVEGADOR (diferente do de `apiClient.test.ts`,
   * que roda no servidor). Uma resposta do BFF que não é JSON válido (página
   * de erro HTML do próprio Next.js, timeout de proxy) antes derrubava a
   * chamada com um `SyntaxError` cru, não tratado por nenhum componente —
   * agora vira o mesmo `ClientApiError` que toda tela já sabe exibir.
   */
  it('resposta do BFF que não é JSON válido vira ClientApiError, nunca SyntaxError cru', async () => {
    mockFetchOnce(500, undefined, '<!DOCTYPE html><html>Internal Server Error</html>');

    await expect(fetchSessions()).rejects.toBeInstanceOf(ClientApiError);
    await expect(fetchSessions()).rejects.toMatchObject({
      status: 500,
      body: { error: 'invalid_response' },
    });
  });
});
