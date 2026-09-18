import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/router';

import { usePlanContext } from '@/contexts/PlanContext';
import UpgradeState from '@/components/states/UpgradeState';
import type { PlanCapability } from '@/lib/plans';

interface PlanGateProps {
  /** O que está bloqueado — repassado a `UpgradeState`. Ex.: "O Pipeline". */
  feature?: string;
  description?: string;
  className?: string;
  /**
   * O que a tela exige (B5, 2026-09-18). `operation` (padrão) libera a
   * partir do Disparos; `ai`, só Pro e Enterprise.
   */
  requires?: PlanCapability;
  /**
   * Para onde ir quando o plano é PAGO mas não inclui o recurso (Disparos
   * numa tela de IA). Ali a tela não existe — decisão do fundador: o que o
   * plano não tem some, em vez de aparecer bloqueado. O Grátis continua
   * vendo a vitrine.
   */
  unavailableRedirectTo?: string;
  /** Conteúdo real da tela paga. */
  children: ReactNode;
}

/**
 * T4 (Lançamento suave — Trava de plano): para um tenant no Plano Grátis,
 * troca o conteúdo de uma tela paga pelo bloco `UpgradeState`. Para
 * `pro`/`enterprise` (e enquanto o plano ainda carrega — o caso comum é
 * pago), renderiza `children` normalmente.
 *
 * NÃO é autorização — o backend é a trava real (IA gated em
 * `shouldAutoRespond`, campanha em `CampaignRequiresPaidPlanError`). Aqui é
 * só a experiência: o cliente grátis vê que o recurso existe e como ativar.
 */
export default function PlanGate({
  feature,
  description,
  className,
  requires = 'operation',
  unavailableRedirectTo,
  children,
}: PlanGateProps): JSX.Element | null {
  const { isFree, hideAi } = usePlanContext();
  const router = useRouter();
  const unavailable = requires === 'ai' && hideAi;

  useEffect(() => {
    if (unavailable && unavailableRedirectTo) {
      void router.replace(unavailableRedirectTo);
    }
    // `router` muda de identidade a cada navegação; só o plano decide aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unavailable, unavailableRedirectTo]);

  if (isFree) {
    return (
      <UpgradeState
        feature={feature}
        description={description}
        className={className}
        requires={requires}
      />
    );
  }

  if (unavailable) {
    return null;
  }

  return <>{children}</>;
}
