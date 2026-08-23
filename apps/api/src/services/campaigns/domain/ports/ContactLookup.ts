/**
 * Porta estreita (mesmo padrão de `AiAvailabilityRepository`/`MediaSender`)
 * — `services/campaigns` pergunta "algum destes telefones já é um Contato
 * salvo?" sem importar nada de `services/contacts` diretamente. Implementada
 * em `services/contacts/infrastructure/ContactLookupImpl.ts`.
 *
 * Reorganização Contatos/Campanhas (2026-08-17): é isso que permite um
 * número vindo de planilha/lista manual "virar" automaticamente um
 * destinatário vinculado ao Contato certo QUANDO esse Contato já existe —
 * sem nunca CRIAR um Contato novo a partir de uma campanha.
 */
export interface ContactLookup {
  /**
   * Para cada telefone (já normalizado, `normalizePhoneToE164`), devolve o
   * `contactId` correspondente, se um Contato com esse telefone já existir
   * no tenant. Telefones sem Contato simplesmente não aparecem no mapa —
   * NUNCA cria nada.
   */
  findContactIdsByPhones(tenantId: string, phonesE164: string[]): Promise<Map<string, string>>;
}
