import { ContactPhoneLookup } from '../../campaigns/domain/providers/ContactPhoneLookup';
import { ContactRepository } from '../domain/repositories/ContactRepository';

/**
 * Implementação real do port `ContactPhoneLookup` (`services/campaigns/domain`)
 * — Fase L, Bloco L5. Mesmo padrão estrutural de `ContactLookupImpl`: é
 * `campaigns`/`whatsapp` quem PRECISA do telefone de um Contato para o
 * primeiro envio, e `contacts` é quem sabe respondê-lo.
 */
export class ContactPhoneLookupImpl implements ContactPhoneLookup {
  constructor(private readonly contactRepository: ContactRepository) {}

  async findPhoneById(
    tenantId: string,
    contactId: string,
  ): Promise<{ phoneE164: string; name?: string } | undefined> {
    const contact = await this.contactRepository.findById(tenantId, contactId);
    if (!contact) return undefined;
    return { phoneE164: contact.phoneE164, name: contact.name };
  }
}
