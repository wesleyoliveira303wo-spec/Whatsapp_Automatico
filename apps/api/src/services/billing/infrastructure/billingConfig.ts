import { PriceCatalog } from '../domain/priceCatalog';

export type BillingEnv =
  | {
      enabled: true;
      secretKey: string;
      webhookSecret: string;
      catalog: PriceCatalog;
      publicUrl: string;
    }
  | { enabled: false; missing: string[] };

const REQUIRED = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_BROADCAST',
  'STRIPE_PRICE_PRO',
  'STRIPE_PRICE_ENTERPRISE',
  'BILLING_PUBLIC_URL',
] as const;

/**
 * Lê a configuração da cobrança (B5, etapa 2). Tudo ou nada: faltando
 * qualquer variável, a cobrança fica desligada e quem chama registra só os
 * NOMES que faltam — nunca os valores.
 */
export function readBillingEnv(env: NodeJS.ProcessEnv): BillingEnv {
  const values = Object.fromEntries(
    REQUIRED.map((name) => [name, env[name]?.trim() ?? '']),
  ) as Record<(typeof REQUIRED)[number], string>;
  const missing = REQUIRED.filter((name) => values[name] === '');
  if (missing.length > 0) {
    return { enabled: false, missing };
  }
  return {
    enabled: true,
    secretKey: values.STRIPE_SECRET_KEY,
    webhookSecret: values.STRIPE_WEBHOOK_SECRET,
    catalog: {
      broadcast: values.STRIPE_PRICE_BROADCAST,
      pro: values.STRIPE_PRICE_PRO,
      enterprise: values.STRIPE_PRICE_ENTERPRISE,
    },
    publicUrl: values.BILLING_PUBLIC_URL.replace(/\/+$/, ''),
  };
}
