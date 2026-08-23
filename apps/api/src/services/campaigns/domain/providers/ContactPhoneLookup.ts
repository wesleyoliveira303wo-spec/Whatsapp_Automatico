/**
 * Porta estreita (mesmo padrão de `ContactLookup`) — Fase L, Bloco L5:
 * `WhatsAppCampaignMessageSender` (implementação real de `CampaignMessageSender`,
 * `services/whatsapp/infrastructure`) precisa resolver o telefone de um
 * Contato salvo (`contactId`) que AINDA NÃO tem conversa nesta sessão, para
 * poder mandar o primeiro contato. Implementada em
 * `services/contacts/infrastructure/ContactPhoneLookupImpl.ts` sobre
 * `ContactRepository.findById` — sem isso, `services/whatsapp` importaria o
 * domínio inteiro de `services/contacts` só por um telefone.
 */
export interface ContactPhoneLookup {
  /** Devolve o telefone (e nome, se houver) do Contato, ou `undefined` se não existir/não pertencer ao tenant. */
  findPhoneById(
    tenantId: string,
    contactId: string,
  ): Promise<{ phoneE164: string; name?: string } | undefined>;
}
