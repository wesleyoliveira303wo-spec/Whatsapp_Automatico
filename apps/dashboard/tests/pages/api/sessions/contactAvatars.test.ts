import handler from '../../../../pages/api/sessions/[sessionName]/contact-avatars';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

/** Bloco B2 (issue #13) — proxy das fotos de perfil em lote. */
describe('POST /api/sessions/[sessionName]/contact-avatars', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockReturnValue(SESSION);
  });

  it('repassa o corpo para a rota em lote da API', async () => {
    (callApi as jest.Mock).mockResolvedValue({ status: 200, body: { avatars: [] } });
    const req = createFakeReq({
      method: 'POST',
      query: { sessionName: 'whatsapp sites' },
      body: { contactJids: ['a@s.whatsapp.net'] },
    });
    const res = createFakeRes();

    await handler(req, res);

    // Sessão com espaço no nome precisa ir URL-encoded — senão a API recebe
    // um path quebrado.
    expect(callApi).toHaveBeenCalledWith(SESSION, '/whatsapp%20sites/contacts/avatars', {
      method: 'POST',
      body: { contactJids: ['a@s.whatsapp.net'] },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sem sessão válida, não chama a API', async () => {
    (requireSession as jest.Mock).mockReturnValue(null);
    const req = createFakeReq({ method: 'POST', query: { sessionName: 'vendas' }, body: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(callApi).not.toHaveBeenCalled();
  });

  it('responde 405 para métodos diferentes de POST', async () => {
    const req = createFakeReq({ method: 'GET', query: { sessionName: 'vendas' } });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(callApi).not.toHaveBeenCalled();
  });

  it('repassa o status de erro da API tal como veio', async () => {
    (callApi as jest.Mock).mockResolvedValue({ status: 400, body: { error: 'validation_error' } });
    const req = createFakeReq({
      method: 'POST',
      query: { sessionName: 'vendas' },
      body: { contactJids: [] },
    });
    const res = createFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
