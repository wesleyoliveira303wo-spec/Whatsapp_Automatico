/**
 * `GenerateLeadMessagesService.generate` chamado sem um `AiProvider`
 * configurado — mesmo racional de `SendingEngineNotConfiguredError`
 * (ambiente sem as credenciais de IA no `.env`, ver `index.ts`).
 */
export class LeadMessageGenerationUnavailableError extends Error {
  constructor() {
    super('A geração de mensagens por IA não está configurada neste ambiente.');
    this.name = 'LeadMessageGenerationUnavailableError';
  }
}
