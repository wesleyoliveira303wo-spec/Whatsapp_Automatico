import { useEffect, useState } from 'react';
import { fetchTenant, type TenantPlan } from '@/lib/clientApi';
import { planAllows, type PlanCapability } from '@/lib/plans';

export interface UsePlanResult {
  /** `null` enquanto carrega OU se a leitura falhar. */
  plan: TenantPlan | null;
  /** `true` só quando o plano foi RESOLVIDO como `free` — nunca durante o carregamento. */
  isFree: boolean;
  /** Qualquer plano pago (Disparos, Pro, Enterprise). Durante o carregamento é `false`. */
  isPaid: boolean;
  /**
   * O plano libera o recurso? (B5, 2026-09-18 — espelho de `planAllows` da
   * API.) Enquanto o plano não chegou, responde `true`: a tela nunca some por
   * engano durante o carregamento.
   */
  allows: (capability: PlanCapability) => boolean;
  /**
   * `true` só num plano PAGO sem IA (hoje, o Disparos): ali o que depende de
   * IA some da tela. No Grátis a IA continua visível como vitrine (com aviso
   * de upgrade), então aqui é `false` — decisão do fundador.
   */
  hideAi: boolean;
  loading: boolean;
}

/**
 * T4 (Lançamento suave — Trava de plano): o Dashboard descobre o `plan` do
 * tenant logado para decidir o que liberar/bloquear na UI. Uma única leitura
 * de `GET /api/tenant` (que já devolve `plan` desde o #2) por montagem.
 *
 * NUNCA é autorização — esconder/trocar tela é cortesia de UX; quem barra de
 * verdade é a API (`shouldAutoRespond` para a IA, `CampaignRequiresPaidPlanError`
 * para campanha, etc.). Em caso de falha de leitura, `isFree` fica `false`
 * (a UI NÃO bloqueia por engano; o backend segue sendo a trava real).
 *
 * Normalmente consumido via `usePlanContext()` (montado uma vez por
 * `SessionLayout`), não diretamente — ver `contexts/PlanContext.tsx`.
 */
export function usePlan(): UsePlanResult {
  const [plan, setPlan] = useState<TenantPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTenant()
      .then(({ tenant }) => {
        if (!cancelled) setPlan(tenant.plan ?? null);
      })
      .catch(() => {
        if (!cancelled) setPlan(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolved = !loading && plan !== null;
  return {
    plan,
    isFree: resolved && plan === 'free',
    isPaid: resolved && plan !== 'free',
    allows: (capability) => (plan ? planAllows(plan, capability) : true),
    hideAi: resolved && plan !== 'free' && !planAllows(plan, 'ai'),
    loading,
  };
}
