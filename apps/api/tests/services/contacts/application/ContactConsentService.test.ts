import { ContactConsentService } from '../../../../src/services/contacts/application/ContactConsentService';
import { TenantNotFoundError } from '../../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { ContactNotFoundError } from '../../../../src/services/contacts/domain/errors/ContactNotFoundError';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeContactRepository } from '../infrastructure/FakeContactRepository';
import { FakeConsentEventRepository } from '../infrastructure/FakeConsentEventRepository';

function buildSut(): {
  service: ContactConsentService;
  contacts: FakeContactRepository;
  events: FakeConsentEventRepository;
} {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const contacts = new FakeContactRepository();
  const events = new FakeConsentEventRepository();
  const service = new ContactConsentService(contacts, events, tenants, new NoopLogger());
  return { service, contacts, events };
}

describe('ContactConsentService', () => {
  describe('recordOptOut()', () => {
    it('grava optOutAt no contato e registra o evento', async () => {
      const { service, contacts, events } = buildSut();
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777' });

      const result = await service.recordOptOut('tenant-1', id, 'palavra-chave');

      expect(result.optOutAt).toBeInstanceOf(Date);
      expect(events.getAll()).toEqual([
        expect.objectContaining({
          contactId: id,
          type: 'opt_out',
          reason: 'palavra-chave',
          actorUserId: undefined,
        }),
      ]);
    });

    it('registra o actorUserId quando é uma ação manual', async () => {
      const { service, contacts, events } = buildSut();
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777' });

      await service.recordOptOut('tenant-1', id, 'manual', 'user-42');

      expect(events.getAll()[0]).toMatchObject({ actorUserId: 'user-42', reason: 'manual' });
    });

    // Uma pessoa que já saiu e pede de novo não deve "sumir" da auditoria —
    // cada pedido é um evento próprio, mesmo repetindo o mesmo resultado final.
    it('opt-out repetido grava um NOVO evento a cada vez (nunca é no-op silencioso)', async () => {
      const { service, contacts, events } = buildSut();
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777' });

      await service.recordOptOut('tenant-1', id, 'palavra-chave');
      await service.recordOptOut('tenant-1', id, 'palavra-chave');

      expect(events.getAll()).toHaveLength(2);
    });

    it('lança ContactNotFoundError para um id inexistente', async () => {
      const { service } = buildSut();

      await expect(service.recordOptOut('tenant-1', 'contact-fantasma', 'manual')).rejects.toThrow(
        ContactNotFoundError,
      );
    });

    it('lança ContactNotFoundError (não vaza dado) para contato de OUTRO tenant', async () => {
      const { service, contacts } = buildSut();
      const id = contacts.seed({ tenantId: 'tenant-2', phoneE164: '5521988887777' });

      await expect(service.recordOptOut('tenant-1', id, 'manual')).rejects.toThrow(
        ContactNotFoundError,
      );
    });

    it('lança TenantNotFoundError para tenant inexistente', async () => {
      const { service } = buildSut();

      await expect(service.recordOptOut('tenant-fantasma', 'contact-1', 'manual')).rejects.toThrow(
        TenantNotFoundError,
      );
    });
  });

  describe('recordOptIn()', () => {
    it('limpa optOutAt e registra o evento de reversão', async () => {
      const { service, contacts, events } = buildSut();
      const id = contacts.seed({
        tenantId: 'tenant-1',
        phoneE164: '5521988887777',
        optOutAt: new Date('2026-08-15T00:00:00.000Z'),
      });

      const result = await service.recordOptIn('tenant-1', id, 'user-1');

      expect(result.optOutAt).toBeUndefined();
      expect(events.getAll()).toEqual([
        expect.objectContaining({ contactId: id, type: 'opt_in', actorUserId: 'user-1' }),
      ]);
    });

    it('funciona sem actorUserId (plano máquina)', async () => {
      const { service, contacts, events } = buildSut();
      const id = contacts.seed({
        tenantId: 'tenant-1',
        phoneE164: '5521988887777',
        optOutAt: new Date(),
      });

      await service.recordOptIn('tenant-1', id);

      expect(events.getAll()[0].actorUserId).toBeUndefined();
    });

    it('lança ContactNotFoundError para um id inexistente', async () => {
      const { service } = buildSut();

      await expect(service.recordOptIn('tenant-1', 'contact-fantasma')).rejects.toThrow(
        ContactNotFoundError,
      );
    });
  });
});
