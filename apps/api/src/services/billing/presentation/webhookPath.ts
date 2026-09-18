/**
 * Caminho público do aviso do Stripe (B5, etapa 2). Constante própria porque
 * três lugares precisam concordar com ela: o parser JSON global (que deixa
 * este caminho passar cru, para a assinatura conferir), a montagem da rota em
 * `index.ts` e a regra do Caddy que encaminha para a API.
 */
export const STRIPE_WEBHOOK_PATH = '/billing/stripe/webhook';
