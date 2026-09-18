/**
 * De onde veio o plano do tenant (B5, 2026-09-18).
 *
 * `self_service` — o próprio cliente assina (ou está no Grátis, podendo
 *   assinar). A partir da etapa 2 do B5, o Stripe manda nele.
 * `manual` — ativado pelo fundador (script ou `/admin`). O Stripe NUNCA
 *   altera um plano manual: um cliente de cortesia ou negociado à parte não
 *   pode ser rebaixado por um webhook.
 */
export type PlanSource = 'self_service' | 'manual';
