/**
 * O tenant tem assinatura valendo no Stripe? (B5, etapa 2.) Porta estreita
 * para o `/admin` não trocar o plano de quem paga pelo Stripe — sem ela, a
 * cobrança continuaria correndo enquanto o plano dizia outra coisa. Mesmo
 * padrão das outras portas de um método entre contextos
 * (`PlatformLiveSessionStatusResolver`); a implementação mora em
 * `services/billing`.
 */
export interface ActiveSubscriptionChecker {
  hasActiveSubscription(tenantId: string): Promise<boolean>;
}
