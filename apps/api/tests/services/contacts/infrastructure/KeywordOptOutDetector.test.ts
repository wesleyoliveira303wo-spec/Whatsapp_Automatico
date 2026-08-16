import { KeywordOptOutDetector } from '../../../../src/services/contacts/infrastructure/KeywordOptOutDetector';
import { ContactConsentService } from '../../../../src/services/contacts/application/ContactConsentService';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeContactRepository } from './FakeContactRepository';
import { FakeConsentEventRepository } from './FakeConsentEventRepository';

function buildSut(): {
  detector: KeywordOptOutDetector;
  contacts: FakeContactRepository;
  events: FakeConsentEventRepository;
} {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const contacts = new FakeContactRepository();
  const events = new FakeConsentEventRepository();
  const consentService = new ContactConsentService(contacts, events, tenants, new NoopLogger());
  const detector = new KeywordOptOutDetector(consentService, new NoopLogger());
  return { detector, contacts, events };
}

describe('KeywordOptOutDetector', () => {
  it('marca opt-out quando o texto é uma palavra-chave reconhecida', async () => {
    const { detector, contacts, events } = buildSut();
    const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777' });

    await detector.detectAndRecord('tenant-1', id, 'PARAR');

    expect((await contacts.findById('tenant-1', id))?.optOutAt).toBeInstanceOf(Date);
    expect(events.getAll()).toEqual([
      expect.objectContaining({ contactId: id, type: 'opt_out', reason: 'palavra-chave' }),
    ]);
  });

  it('não faz nada quando o texto NÃO é uma palavra-chave', async () => {
    const { detector, contacts, events } = buildSut();
    const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777' });

    await detector.detectAndRecord('tenant-1', id, 'Olá, qual o preço do serviço?');

    expect((await contacts.findById('tenant-1', id))?.optOutAt).toBeUndefined();
    expect(events.getAll()).toEqual([]);
  });

  // Nunca lança — é chamado de dentro da ingestão de mensagem, que não pode
  // ser interrompida por uma falha de um dado auxiliar.
  it('NUNCA lança, mesmo se o contato não existir (falha interna do consent service)', async () => {
    const { detector } = buildSut();

    await expect(
      detector.detectAndRecord('tenant-1', 'contact-fantasma', 'parar'),
    ).resolves.toBeUndefined();
  });
});
