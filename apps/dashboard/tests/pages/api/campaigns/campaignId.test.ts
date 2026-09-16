import indexHandler from '../../../../pages/api/campaigns/[campaignId]/index';
import startHandler from '../../../../pages/api/campaigns/[campaignId]/start';
import reopenHandler from '../../../../pages/api/campaigns/[campaignId]/reopen';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callCampaignsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

/**
 * Testes do proxy `GET/PUT/DELETE /api/campaigns/[campaignId]` e
 * `POST .../start`/`.../reopen` (Task 7, 2026-09-15) — encaminhamento de
 * corpo/status, mesmo padrão de `group-broadcasts/broadcastId.test.ts`.
 * Nenhuma regra de negócio reimplementada no BFF.
 */
describe('proxy /api/campaigns/[campaignId]', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockResolvedValue(SESSION);
  });

  describe('GET/PUT/DELETE /:campaignId', () => {
    it('sem sessão: não chama a API', async () => {
      (requireSession as jest.Mock).mockResolvedValue(null);
      const req = createFakeReq({ method: 'GET', query: { campaignId: 'c1' } });
      const res = createFakeRes();

      await indexHandler(req, res);

      expect(callCampaignsApi).not.toHaveBeenCalled();
    });

    it('GET encaminha e devolve o detalhe', async () => {
      (callCampaignsApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: { campaign: { id: 'c1' }, summary: {} },
      });
      const req = createFakeReq({ method: 'GET', query: { campaignId: 'c1' } });
      const res = createFakeRes();

      await indexHandler(req, res);

      expect(callCampaignsApi).toHaveBeenCalledWith(SESSION, '/c1');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('PUT encaminha o corpo de edição e devolve o detalhe recarregado (2026-09-15)', async () => {
      (callCampaignsApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: { campaign: { id: 'c1', name: 'Nome novo' }, summary: {} },
      });
      const body = { name: 'Nome novo', messageTemplate: 'Oi', contactIds: ['contact-1'] };
      const req = createFakeReq({ method: 'PUT', query: { campaignId: 'c1' }, body });
      const res = createFakeRes();

      await indexHandler(req, res);

      expect(callCampaignsApi).toHaveBeenCalledWith(SESSION, '/c1', { method: 'PUT', body });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('PUT repassa o status de erro da API (400) sem transformar', async () => {
      (callCampaignsApi as jest.Mock).mockResolvedValue({ status: 400, body: { error: 'x' } });
      const req = createFakeReq({ method: 'PUT', query: { campaignId: 'c1' }, body: {} });
      const res = createFakeRes();

      await indexHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('DELETE devolve 204 sem corpo', async () => {
      (callCampaignsApi as jest.Mock).mockResolvedValue({ status: 204, body: undefined });
      const req = createFakeReq({ method: 'DELETE', query: { campaignId: 'c1' } });
      const res = createFakeRes();

      await indexHandler(req, res);

      expect(callCampaignsApi).toHaveBeenCalledWith(SESSION, '/c1', { method: 'DELETE' });
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('método errado: 405', async () => {
      const req = createFakeReq({ method: 'POST', query: { campaignId: 'c1' } });
      const res = createFakeRes();

      await indexHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
    });
  });

  describe('POST /:campaignId/start', () => {
    it('encaminha e devolve a campanha atualizada', async () => {
      (callCampaignsApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: { campaign: { id: 'c1', status: 'running' } },
      });
      const req = createFakeReq({ method: 'POST', query: { campaignId: 'c1' } });
      const res = createFakeRes();

      await startHandler(req, res);

      expect(callCampaignsApi).toHaveBeenCalledWith(SESSION, '/c1/start', { method: 'POST' });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('repassa resumeMode do corpo (2026-09-15)', async () => {
      (callCampaignsApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: { campaign: { id: 'c1', status: 'running' } },
      });
      const req = createFakeReq({
        method: 'POST',
        query: { campaignId: 'c1' },
        body: { resumeMode: 'scheduled' },
      });
      const res = createFakeRes();

      await startHandler(req, res);

      expect(callCampaignsApi).toHaveBeenCalledWith(SESSION, '/c1/start', {
        method: 'POST',
        body: { resumeMode: 'scheduled' },
      });
    });

    it('método errado: 405, nunca chama a API', async () => {
      const req = createFakeReq({ method: 'GET', query: { campaignId: 'c1' } });
      const res = createFakeRes();

      await startHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(callCampaignsApi).not.toHaveBeenCalled();
    });
  });

  describe('POST /:campaignId/reopen', () => {
    it('encaminha e devolve a campanha atualizada', async () => {
      (callCampaignsApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: { campaign: { id: 'c1', status: 'running' } },
      });
      const req = createFakeReq({ method: 'POST', query: { campaignId: 'c1' } });
      const res = createFakeRes();

      await reopenHandler(req, res);

      expect(callCampaignsApi).toHaveBeenCalledWith(SESSION, '/c1/reopen', { method: 'POST' });
    });

    it('repassa resumeMode do corpo (2026-09-15)', async () => {
      (callCampaignsApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: { campaign: { id: 'c1', status: 'running' } },
      });
      const req = createFakeReq({
        method: 'POST',
        query: { campaignId: 'c1' },
        body: { resumeMode: 'now' },
      });
      const res = createFakeRes();

      await reopenHandler(req, res);

      expect(callCampaignsApi).toHaveBeenCalledWith(SESSION, '/c1/reopen', {
        method: 'POST',
        body: { resumeMode: 'now' },
      });
    });
  });
});
