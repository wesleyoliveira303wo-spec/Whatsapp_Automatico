import { SupportAccessService } from '../../../../src/services/platform/application/SupportAccessService';
import {
  SupportAccessAlreadyOpenError,
  SupportAccessForbiddenError,
  SupportAccessNotFoundError,
  SupportAccessWrongStateError,
} from '../../../../src/services/platform/domain/errors/SupportAccessErrors';
import { FakeAuditLogRepository } from '../../auth/testDoubles';
import {
  FakePlatformAuditLogRepository,
  FakePlatformUserRepository,
  FakeSupportAccessRepository,
  FakeSupportAccessTokenService,
  fakeLogger,
} from '../testDoubles';

const NOW = new Date('2026-09-06T12:00:00Z');

function build() {
  const requests = new FakeSupportAccessRepository();
  const platformAudit = new FakePlatformAuditLogRepository();
  const tenantAudit = new FakeAuditLogRepository();
  const users = new FakePlatformUserRepository();
  users.seed({ id: 'admin-1', name: 'Dono', email: 'dono@francis.app' });
  const service = new SupportAccessService(
    requests,
    platformAudit,
    tenantAudit,
    new FakeSupportAccessTokenService(),
    users,
    fakeLogger(),
    () => NOW,
  );
  return { requests, platformAudit, tenantAudit, service };
}

describe('SupportAccessService', () => {
  describe('request', () => {
    it('cria PENDING e audita support.access_requested', async () => {
      const { service, platformAudit } = build();
      const created = await service.request({
        tenantId: 't-1',
        platformUserId: 'admin-1',
        reason: '  verificar a IA  ',
      });
      expect(created.status).toBe('pending');
      expect(created.reason).toBe('verificar a IA');
      expect(platformAudit.actions()).toEqual(['support.access_requested']);
    });

    it('motivo vazio → erro', async () => {
      const { service } = build();
      await expect(
        service.request({ tenantId: 't-1', platformUserId: 'admin-1', reason: '   ' }),
      ).rejects.toBeInstanceOf(SupportAccessWrongStateError);
    });

    it('já há um pedido aberto para o tenant → 409', async () => {
      const { service, requests } = build();
      requests.seed({ tenantId: 't-1', status: 'pending' });
      await expect(
        service.request({ tenantId: 't-1', platformUserId: 'admin-1', reason: 'x' }),
      ).rejects.toBeInstanceOf(SupportAccessAlreadyOpenError);
    });
  });

  describe('respond', () => {
    it('accept: grava expiresAt = now + 2h e audita nas DUAS trilhas', async () => {
      const { service, requests, platformAudit, tenantAudit } = build();
      const row = requests.seed({ tenantId: 't-1', status: 'pending' });

      const updated = await service.respond({
        tenantId: 't-1',
        supportAccessId: row.id,
        respondedByUserId: 'user-9',
        decision: 'accept',
      });

      expect(updated.status).toBe('accepted');
      expect(updated.expiresAt?.getTime()).toBe(NOW.getTime() + 2 * 60 * 60 * 1000);
      expect(updated.respondedByUserId).toBe('user-9');
      expect(platformAudit.actions()).toContain('support.access_granted');
      expect(tenantAudit.all().map((e) => e.action)).toContain('support.access_granted');
    });

    it('deny: status denied, sem expiresAt, auditado', async () => {
      const { service, requests, tenantAudit } = build();
      const row = requests.seed({ status: 'pending' });
      const updated = await service.respond({
        tenantId: 't-1',
        supportAccessId: row.id,
        respondedByUserId: 'user-9',
        decision: 'deny',
      });
      expect(updated.status).toBe('denied');
      expect(updated.expiresAt).toBeNull();
      expect(tenantAudit.all().map((e) => e.action)).toContain('support.access_denied');
    });

    it('pedido de OUTRO tenant → 403 (defesa em profundidade)', async () => {
      const { service, requests } = build();
      const row = requests.seed({ tenantId: 't-OUTRO', status: 'pending' });
      await expect(
        service.respond({
          tenantId: 't-1',
          supportAccessId: row.id,
          respondedByUserId: 'u',
          decision: 'accept',
        }),
      ).rejects.toBeInstanceOf(SupportAccessForbiddenError);
    });

    it('pedido já respondido → 409', async () => {
      const { service, requests } = build();
      const row = requests.seed({ status: 'accepted', expiresAt: new Date(NOW.getTime() + 1000) });
      await expect(
        service.respond({
          tenantId: 't-1',
          supportAccessId: row.id,
          respondedByUserId: 'u',
          decision: 'accept',
        }),
      ).rejects.toBeInstanceOf(SupportAccessWrongStateError);
    });
  });

  describe('revoke (Regra 2)', () => {
    it('acesso vivo → revoked + support.access_ended nas duas trilhas', async () => {
      const { service, requests, platformAudit, tenantAudit } = build();
      const row = requests.seed({
        status: 'accepted',
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      });
      const updated = await service.revoke({
        tenantId: 't-1',
        supportAccessId: row.id,
        revokedByUserId: 'user-9',
      });
      expect(updated.status).toBe('revoked');
      expect(platformAudit.actions()).toContain('support.access_ended');
      expect(tenantAudit.all().map((e) => e.action)).toContain('support.access_ended');
    });

    it('nada ativo para revogar → 409', async () => {
      const { service, requests } = build();
      const row = requests.seed({ status: 'pending' });
      await expect(
        service.revoke({ tenantId: 't-1', supportAccessId: row.id, revokedByUserId: 'u' }),
      ).rejects.toBeInstanceOf(SupportAccessWrongStateError);
    });
  });

  describe('mintToken', () => {
    it('acesso vivo do próprio admin → token + tenantId', async () => {
      const { service, requests } = build();
      const row = requests.seed({
        platformUserId: 'admin-1',
        status: 'accepted',
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      });
      const result = await service.mintToken({ supportAccessId: row.id, platformUserId: 'admin-1' });
      expect(result.tenantId).toBe('t-1');
      expect(result.token).toContain(row.id);
    });

    it('admin diferente → 403', async () => {
      const { service, requests } = build();
      const row = requests.seed({
        platformUserId: 'admin-1',
        status: 'accepted',
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      });
      await expect(
        service.mintToken({ supportAccessId: row.id, platformUserId: 'admin-OUTRO' }),
      ).rejects.toBeInstanceOf(SupportAccessForbiddenError);
    });

    it('acesso não aceito → 409', async () => {
      const { service, requests } = build();
      const row = requests.seed({ platformUserId: 'admin-1', status: 'pending' });
      await expect(
        service.mintToken({ supportAccessId: row.id, platformUserId: 'admin-1' }),
      ).rejects.toBeInstanceOf(SupportAccessWrongStateError);
    });

    it('id inexistente → 404', async () => {
      const { service } = build();
      await expect(
        service.mintToken({ supportAccessId: 'nao-existe', platformUserId: 'admin-1' }),
      ).rejects.toBeInstanceOf(SupportAccessNotFoundError);
    });
  });

  describe('getOpenForTenant (Regra 3 — sweep preguiçoso)', () => {
    it('varre ACCEPTED vencido → expired, e não devolve nada', async () => {
      const { service, requests } = build();
      requests.seed({
        tenantId: 't-1',
        status: 'accepted',
        expiresAt: new Date(NOW.getTime() - 1000),
      });
      const open = await service.getOpenForTenant('t-1');
      expect(open).toBeNull();
      expect(requests.rows[0].status).toBe('expired');
    });

    it('pendente → devolve com o nome do admin resolvido', async () => {
      const { service, requests } = build();
      requests.seed({ tenantId: 't-1', platformUserId: 'admin-1', status: 'pending' });
      const open = await service.getOpenForTenant('t-1');
      expect(open?.adminName).toBe('Dono');
      expect(open?.request.status).toBe('pending');
    });
  });
});
