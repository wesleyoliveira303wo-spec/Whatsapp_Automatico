import { ContactLookup } from '../../../../src/services/campaigns/domain/ports/ContactLookup';

/** Fake em memória de `ContactLookup` — Reorganização Contatos/Campanhas (2026-08-17). */
export class FakeContactLookup implements ContactLookup {
  private readonly byPhone = new Map<string, string>();

  /** Helper de teste: registra que `phoneE164` já corresponde ao Contato `contactId`. */
  seed(phoneE164: string, contactId: string): void {
    this.byPhone.set(phoneE164, contactId);
  }

  async findContactIdsByPhones(
    _tenantId: string,
    phonesE164: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const phone of phonesE164) {
      const contactId = this.byPhone.get(phone);
      if (contactId) result.set(phone, contactId);
    }
    return result;
  }
}
