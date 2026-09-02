import { useEffect, useState } from 'react';
import { fetchTenant, type TenantPlan } from '@/lib/clientApi';

export interface UsePlanResult {
  /** `null` enquanto carrega OU se a leitura falhar. */
  plan: TenantPlan | null;
  /** `true` só quando o plano foi RESOLVIDO como `free` — nunca durante o carregamento. */
  isFree: boolean;
  /** `pro`/`enterprise`. Durante o carregamento é `false`. */
  isPaid: boolean;
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

  return {
    plan,
    isFree: !loading && plan === 'free',
    isPaid: plan === 'pro' || plan === 'enterprise',
    loading,
  };
}
