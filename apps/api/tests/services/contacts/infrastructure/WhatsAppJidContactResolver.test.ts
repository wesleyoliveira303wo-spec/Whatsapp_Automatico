import { WhatsAppJidContactResolver } from '../../../../src/services/contacts/infrastructure/WhatsAppJidContactResolver';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeContactRepository } from './FakeContactRepository';

function buildSut(): { resolver: WhatsAppJidContactResolver; contacts: FakeContactRepository } {
  const contacts = new FakeContactRepository();
  const resolver = new WhatsAppJidContactResolver(contacts, new NoopLogger());
  return { resolver, contacts };
}

describe('WhatsAppJidContactResolver', () => {
  describe('resolveByWhatsAppJid', () => {
    it('resolve (criando se preciso) a identidade de um endereço com telefone real', async () => {
      const { resolver, contacts } = buildSut();

      const contactId = await resolver.resolveByWhatsAppJid(
        'tenant-1',
        '5521988887777@s.whatsapp.net',
      );

      expect(contactId).toBeDefined();
      expect((await contacts.findById('tenant-1', contactId!))?.phoneE164).toBe('5521988887777');
    });

    it('devolve undefined (nunca lança) para um endereço @lid, sem telefone a derivar', async () => {
      const { resolver } = buildSut();

      const contactId = await resolver.resolveByWhatsAppJid('tenant-1', '225236742053984@lid');

      expect(contactId).toBeUndefined();
    });
  });

  // Retrofit visual 2026-08-18 — botão "Salvar contato".
  describe('saveName', () => {
    it('grava o nome no contato já existente', async () => {
      const { resolver, contacts } = buildSut();
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777' });

      await resolver.saveName('tenant-1', id, 'Maria Costa');

      expect((await contacts.findById('tenant-1', id))?.name).toBe('Maria Costa');
    });

    it('sobrescreve um nome já definido (diferente de setNameIfMissing)', async () => {
      const { resolver, contacts } = buildSut();
      const id = contacts.seed({
        tenantId: 'tenant-1',
        phoneE164: '5521988887777',
        name: 'Nome Antigo',
      });

      await resolver.saveName('tenant-1', id, 'Nome Novo');

      expect((await contacts.findById('tenant-1', id))?.name).toBe('Nome Novo');
    });

    it('PROPAGA erro — diferente de resolveByWhatsAppJid, esta é uma ação humana explícita', async () => {
      const contacts = new FakeContactRepository();
      const failingUpdate = jest
        .spyOn(contacts, 'update')
        .mockRejectedValueOnce(new Error('falha de banco'));
      const resolver = new WhatsAppJidContactResolver(contacts, new NoopLogger());

      await expect(resolver.saveName('tenant-1', 'contact-1', 'Maria')).rejects.toThrow(
        'falha de banco',
      );

      failingUpdate.mockRestore();
    });
  });
});
