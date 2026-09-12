import indexHandler from '../../../../pages/api/group-broadcasts/[broadcastId]/index';
import startHandler from '../../../../pages/api/group-broadcasts/[broadcastId]/start';
import pauseHandler from '../../../../pages/api/group-broadcasts/[broadcastId]/pause';
import cancelHandler from '../../../../pages/api/group-broadcasts/[broadcastId]/cancel';
import { createFakeReq, createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';
import { callGroupBroadcastsApi } from '../../../../lib/apiClient';

jest.mock('../../../../lib/dashboardSession');
jest.mock('../../../../lib/apiClient');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

describe('proxy /api/group-broadcasts/[broadcastId]', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireSession as jest.Mock).mockResolvedValue(SESSION);
  });

  describe('GET/DELETE /:broadcastId', () => {
    it('GET encaminha e devolve o detalhe', async () => {
      (callGroupBroadcastsApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: { broadcast: { id: 'b1' }, summary: {}, targets: [] },
      });
      const req = createFakeReq({ method: 'GET', query: { broadcastId: 'b1' } });
      const res = createFakeRes();

      await indexHandler(req, res);

      expect(callGroupBroadcastsApi).toHaveBeenCalledWith(SESSION, '/b1');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('DELETE devolve 204 sem corpo', async () => {
      (callGroupBroadcastsApi as jest.Mock).mockResolvedValue({ status: 204, body: undefined });
      const req = createFakeReq({ method: 'DELETE', query: { broadcastId: 'b1' } });
      const res = createFakeRes();

      await indexHandler(req, res);

      expect(callGroupBroadcastsApi).toHaveBeenCalledWith(SESSION, '/b1', { method: 'DELETE' });
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('disparo RUNNING: o status de erro da API (400) é repassado ao DELETE', async () => {
      (callGroupBroadcastsApi as jest.Mock).mockResolvedValue({ status: 400, body: undefined });
      const req = createFakeReq({ method: 'DELETE', query: { broadcastId: 'b1' } });
      const res = createFakeRes();

      await indexHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.end).toHaveBeenCalled();
    });

    it('método errado: 405', async () => {
      const req = createFakeReq({ method: 'POST', query: { broadcastId: 'b1' } });
      const res = createFakeRes();

      await indexHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
    });
  });

  describe('POST /:broadcastId/start', () => {
    it('encaminha e devolve o broadcast atualizado', async () => {
      (callGroupBroadcastsApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: { broadcast: { id: 'b1', status: 'running' } },
      });
      const req = createFakeReq({ method: 'POST', query: { broadcastId: 'b1' } });
      const res = createFakeRes();

      await startHandler(req, res);

      expect(callGroupBroadcastsApi).toHaveBeenCalledWith(SESSION, '/b1/start', { method: 'POST' });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('método errado: 405, nunca chama a API', async () => {
      const req = createFakeReq({ method: 'GET', query: { broadcastId: 'b1' } });
      const res = createFakeRes();

      await startHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(callGroupBroadcastsApi).not.toHaveBeenCalled();
    });
  });

  describe('POST /:broadcastId/pause', () => {
    it('encaminha e devolve o broadcast atualizado', async () => {
      (callGroupBroadcastsApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: { broadcast: { id: 'b1', status: 'paused' } },
      });
      const req = createFakeReq({ method: 'POST', query: { broadcastId: 'b1' } });
      const res = createFakeRes();

      await pauseHandler(req, res);

      expect(callGroupBroadcastsApi).toHaveBeenCalledWith(SESSION, '/b1/pause', { method: 'POST' });
    });
  });

  describe('POST /:broadcastId/cancel', () => {
    it('encaminha e devolve o broadcast atualizado', async () => {
      (callGroupBroadcastsApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: { broadcast: { id: 'b1', status: 'cancelled' } },
      });
      const req = createFakeReq({ method: 'POST', query: { broadcastId: 'b1' } });
      const res = createFakeRes();

      await cancelHandler(req, res);

      expect(callGroupBroadcastsApi).toHaveBeenCalledWith(SESSION, '/b1/cancel', {
        method: 'POST',
      });
    });
  });
});
