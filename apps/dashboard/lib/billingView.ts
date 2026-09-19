import type { BillingStatus, SubscriptionStatus } from './clientApi';
import { sessionLimitFor, type PaidPlan } from './plans';

/**
 * Regras de EXIBIÇÃO da aba Plano (B5, etapa 2) — funções puras, testadas
 * sem navegador. Quem decide de verdade é a API: aqui só se escolhe o que
 * mostrar e quais botões oferecer.
 */

/**
 * Status em que a assinatura ainda vale (espelho de
 * `ACTIVE_SUBSCRIPTION_STATUSES` na API). Em atraso ainda vale: o plano só
 * cai quando o Stripe desiste de cobrar.
 */
const LIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(['trialing', 'active', 'past_due']);

/** Há uma assinatura valendo? Então não se assina de novo — troca-se pelo portal. */
export function hasLiveSubscription(billing: BillingStatus): boolean {
  const status = billing.subscription?.status;
  return status != null && LIVE_STATUSES.has(status);
}

/** O pagamento foi confirmado — é o que a tela espera depois de voltar do Stripe. */
export function isSubscriptionConfirmed(billing: BillingStatus): boolean {
  const status = billing.subscription?.status;
  return status === 'trialing' || status === 'active';
}

/** Plano pago ativado à mão pela equipe (Pix, contrato). O Stripe não mexe nele. */
export function isManualPaidPlan(billing: BillingStatus): boolean {
  return billing.planSource === 'manual' && billing.plan !== 'free';
}

/** Os botões "Assinar"/"Testar 1 dia grátis" aparecem? */
export function canStartCheckout(billing: BillingStatus, canManage: boolean): boolean {
  return (
    canManage &&
    billing.billingEnabled &&
    !hasLiveSubscription(billing) &&
    !isManualPaidPlan(billing)
  );
}

/** O botão "Gerenciar assinatura" aparece? Basta existir uma conta no Stripe. */
export function canOpenPortal(billing: BillingStatus, canManage: boolean): boolean {
  return canManage && billing.billingEnabled && billing.subscription !== null;
}

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/** "DD/MM" no horário de Brasília — a data que a pessoa vê no próprio calendário. */
export function formatBillingDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/**
 * A linha que diz em que pé está a assinatura. `null` quando não há nada
 * útil a dizer (plano pago sem dado de assinatura ainda).
 */
export function describeBillingSituation(billing: BillingStatus): string | null {
  if (isManualPaidPlan(billing)) return 'Ativado pela equipe do Francis.';

  const sub = billing.subscription;
  if (sub?.status === 'past_due') {
    return 'Pagamento em atraso. Atualize o cartão em Gerenciar assinatura.';
  }
  if (sub?.status === 'trialing' && sub.trialEndsAt) {
    const until = formatBillingDate(sub.trialEndsAt);
    // Cancelado durante o teste: a promessa de cobrança deixa de ser verdade.
    return sub.cancelAtPeriodEnd
      ? `Teste grátis até ${until}. A assinatura foi cancelada e nada será cobrado.`
      : `Teste grátis até ${until}. A primeira cobrança é feita nesse dia.`;
  }
  if (sub?.status === 'active' && sub.currentPeriodEnd) {
    const date = formatBillingDate(sub.currentPeriodEnd);
    return sub.cancelAtPeriodEnd
      ? `Cancelamento agendado para ${date}.`
      : `Próxima cobrança em ${date}.`;
  }
  if (billing.plan === 'free') return 'Você está no Grátis.';
  return null;
}

/** Mesma tolerância de 3 dias que a fila `billing-grace` usa no servidor. */
const PAST_DUE_GRACE_DAYS = 3;

/** `pastDueSince + 3 dias`, ou `undefined` se não estiver em atraso. */
export function pastDueDeadline(billing: BillingStatus): Date | undefined {
  const sub = billing.subscription;
  if (sub?.status !== 'past_due' || !sub.pastDueSince) return undefined;
  return new Date(
    new Date(sub.pastDueSince).getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );
}

/** "1 WhatsApp" / "Até 5 WhatsApps" — lido do mesmo limite que a API aplica. */
export function whatsAppAllowanceLabel(plan: PaidPlan): string {
  const limit = sessionLimitFor(plan);
  return limit === 1 ? '1 WhatsApp' : `Até ${limit} WhatsApps`;
}

/** O que cada plano pago libera, em uma frase. */
export const PLAN_SUMMARY: Record<PaidPlan, string> = {
  broadcast: 'Disparos para contatos e grupos, e você atende pela Dashboard. Sem IA.',
  pro: 'Tudo do Disparos, com a IA respondendo seus clientes.',
  enterprise: 'Tudo do Pro, com a IA em cada número.',
};
