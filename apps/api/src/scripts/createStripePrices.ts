/**
 * Cria no Stripe os três preços mensais do Francis (B5, etapa 2) e imprime
 * as linhas `STRIPE_PRICE_*` para colar no `.env`.
 *
 * Idempotente por `lookup_key`: rodar de novo não duplica nada — um preço que
 * já existe só é mostrado. MODO SIMULAÇÃO POR PADRÃO (mesmo contrato dos
 * demais scripts deste diretório): sem `--apply`, só diz o que existe e o que
 * seria criado.
 *
 * Proteção contra engano: com uma chave de PRODUÇÃO (`sk_live_`/`rk_live_`),
 * o script recusa rodar sem `--live` explícito.
 *
 *   # ver o que existe (chave do .env, modo teste)
 *   npx tsx apps/api/src/scripts/createStripePrices.ts
 *
 *   # criar o que falta
 *   npx tsx apps/api/src/scripts/createStripePrices.ts --apply
 *
 *   # produção (na VM, com a chave live no .env)
 *   docker compose -f docker-compose.prod.yml run --rm api node apps/api/dist/scripts/createStripePrices.js --apply --live
 *
 * Nunca imprime a chave. Ids de preço não são segredo.
 */
import path from 'path';
import dotenv from 'dotenv';
import Stripe from 'stripe';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

interface PriceSpec {
  env: string;
  productName: string;
  lookupKey: string;
  /** Centavos de real. */
  unitAmount: number;
}

const PRICES: readonly PriceSpec[] = [
  {
    env: 'STRIPE_PRICE_BROADCAST',
    productName: 'Francis — Disparos',
    lookupKey: 'francis_broadcast_monthly',
    unitAmount: 6900,
  },
  {
    env: 'STRIPE_PRICE_PRO',
    productName: 'Francis — Pro',
    lookupKey: 'francis_pro_monthly',
    unitAmount: 11900,
  },
  {
    env: 'STRIPE_PRICE_ENTERPRISE',
    productName: 'Francis — Enterprise',
    lookupKey: 'francis_enterprise_monthly',
    unitAmount: 24900,
  },
];

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const live = process.argv.includes('--live');
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!secretKey) {
    console.error('STRIPE_SECRET_KEY ausente no ambiente (.env).');
    process.exitCode = 1;
    return;
  }
  const isLiveKey = /^(sk|rk)_live_/.test(secretKey);
  if (isLiveKey && !live) {
    console.error(
      'A chave no ambiente é de PRODUÇÃO. Para criar preços de produção de propósito, rode com --live.',
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Conta Stripe em modo ${isLiveKey ? 'PRODUÇÃO' : 'teste'}.`);
  console.log('');

  const stripe = new Stripe(secretKey);
  const lines: string[] = [];

  for (const spec of PRICES) {
    const existing = await stripe.prices.list({
      lookup_keys: [spec.lookupKey],
      active: true,
      limit: 1,
    });
    if (existing.data.length > 0) {
      console.log(`  já existe: ${spec.productName} (${spec.lookupKey})`);
      lines.push(`${spec.env}=${existing.data[0].id}`);
      continue;
    }
    if (!apply) {
      console.log(`  seria criado: ${spec.productName} — R$ ${(spec.unitAmount / 100).toFixed(2)}/mês`);
      continue;
    }
    const product = await stripe.products.create({ name: spec.productName });
    const price = await stripe.prices.create({
      product: product.id,
      currency: 'brl',
      unit_amount: spec.unitAmount,
      recurring: { interval: 'month' },
      lookup_key: spec.lookupKey,
    });
    console.log(`  criado: ${spec.productName} (${spec.lookupKey})`);
    lines.push(`${spec.env}=${price.id}`);
  }

  console.log('');
  if (lines.length === PRICES.length) {
    console.log('Cole no .env:');
    for (const line of lines) console.log(line);
  } else if (!apply) {
    console.log('Nada foi criado. Rode de novo com --apply para criar o que falta.');
  }
}

main().catch((error: unknown) => {
  // A mensagem do Stripe não traz a chave; mesmo assim, só a mensagem.
  console.error('Falha ao criar os preços no Stripe:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
