import type { ReactNode } from 'react';

import { usePlanContext } from '@/contexts/PlanContext';
import UpgradeState from '@/components/states/UpgradeState';

interface PlanGateProps {
  /** O que está bloqueado — repassado a `UpgradeState`. Ex.: "O Pipeline". */
  feature?: string;
  description?: string;
  className?: string;
  /** Conteúdo real da tela paga (renderizado para tenant `pro`/`enterprise`). */
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
  children,
}: PlanGateProps): JSX.Element {
  const { isFree } = usePlanContext();

  if (isFree) {
    return <UpgradeState feature={feature} description={description} className={className} />;
  }

  return <>{children}</>;
}
