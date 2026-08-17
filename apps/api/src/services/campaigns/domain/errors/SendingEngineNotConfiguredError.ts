/**
 * `startCampaign` chamado num processo/ambiente sem a fila `campaign-send`
 * configurada (mesmo racional de `sendAgentMediaMessage` sem `MediaSender`) —
 * acontece no modo degradado (sem `REDIS_URL`), onde `campaignsRouter`
 * continua montado para leitura, mas o motor de envio não existe.
 */
export class SendingEngineNotConfiguredError extends Error {
  constructor() {
    super('O motor de envio de campanhas não está configurado neste ambiente.');
    this.name = 'SendingEngineNotConfiguredError';
  }
}
