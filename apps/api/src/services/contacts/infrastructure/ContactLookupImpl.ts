import { ContactLookup } from '../../campaigns/domain/ports/ContactLookup';
import { ContactRepository } from '../domain/repositories/ContactRepository';

/**
 * Implementação real do port `ContactLookup` (`services/campaigns/domain`)
 * — Reorganização Contatos/Campanhas (2026-08-17). Mesmo padrão estrutural
 * de `CampaignReplyTrackerImpl`/`CampaignOriginResolverImpl` (só que na
 * direção oposta: aqui é `contacts` que implementa uma porta declarada por
 * `campaigns`, porque é `campaigns` quem PRECISA da informação, e
 * `contacts` é quem sabe respondê-la).
 */
export class ContactLookupImpl implements ContactLookup {
  constructor(private readonly contactRepository: ContactRepository) {}

  async findContactIdsByPhones(
    tenantId: string,
    phonesE164: string[],
  ): Promise<Map<string, string>> {
    const contacts = await this.contactRepository.findManyByPhones(tenantId, phonesE164);
    return new Map(contacts.map((contact) => [contact.phoneE164, contact.id]));
  }
}
