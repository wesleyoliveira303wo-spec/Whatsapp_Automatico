/**
 * `startCampaign`/`reopenCampaign` chamado por um tenant no **Plano Grátis**
 * (Lançamento suave, 2026-08-31 — Trava de plano; recurso `operation` desde o B5, ver `planAllows` e
 * `CONTEXT.md`).
 *
 * Criar/rascunhar campanha (e calcular destinatários) continua liberado para
 * todos — nada é enviado ali. Só o DISPARO (o único ponto que produz
 * mensagens reais) fica atrás da Trava: um tenant `free` nunca inicia nem
 * retoma/reabre uma campanha. Ao ser ativado como `pro`/`enterprise`, passa
 * a iniciar normalmente, sem reconfigurar nada.
 *
 * Mesma forma de `SendingEngineNotConfiguredError` (erro de Domain traduzido
 * pelo `campaignsErrorHandler`), mas com status HTTP próprio (403 — recurso
 * pago, não um problema de ambiente).
 */
export class CampaignRequiresPaidPlanError extends Error {
  constructor() {
    super(
      'Disparar campanhas faz parte dos planos pagos (Disparos, Pro ou Enterprise).',
    );
    this.name = 'CampaignRequiresPaidPlanError';
  }
}
