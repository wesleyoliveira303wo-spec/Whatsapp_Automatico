import { TenantPlan } from './TenantPlan';

/**
 * A Trava de plano (Lançamento suave, ver `CONTEXT.md`) — fonte ÚNICA de
 * verdade. Um tenant no Plano Grátis (`free`) não usa os recursos pagos
 * (IA respondendo automaticamente, responder pela Dashboard, iniciar
 * campanha); Pro e Enterprise usam.
 *
 * Função pura, sem estado — mesmo estilo de `shouldAutoRespond` e das demais
 * policies de Domain. Quem chama resolve o `plan` do tenant (via
 * `TenantRepository.findById`) e passa aqui.
 */
export function planPermiteUso(plan: TenantPlan): boolean {
  return plan !== 'free';
}
