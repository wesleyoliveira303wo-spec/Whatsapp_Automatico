import { createContext, useContext, type ReactNode } from 'react';
import { usePlan, type UsePlanResult } from '@/hooks/usePlan';

const PlanContext = createContext<UsePlanResult | null>(null);

interface PlanProviderProps {
  children: ReactNode;
}

/**
 * T4 (Lançamento suave — Trava de plano): mecanismo COMPARTILHADO para as
 * telas saberem o plano do tenant. Mesmo padrão de `AiToggleProvider` —
 * `usePlan` (dono da lógica) roda UMA vez aqui, montado por `SessionLayout`
 * (ancestral comum de todas as telas de sessão), e todo consumidor lê a
 * MESMA instância via `usePlanContext()` em vez de refazer o fetch.
 */
export function PlanProvider({ children }: PlanProviderProps): JSX.Element {
  const value = usePlan();
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

/** Lê o plano do tenant. Só funciona dentro de `PlanProvider` (montado por `SessionLayout`). */
export function usePlanContext(): UsePlanResult {
  const value = useContext(PlanContext);
  if (!value) {
    throw new Error('usePlanContext deve ser usado dentro de um PlanProvider (ver SessionLayout).');
  }
  return value;
}

/**
 * Versão TOLERANTE para componentes EMBUTIDOS na tela de Conversas (que fica
 * acessível no Plano Grátis, só-leitura) — `ConversationTagPicker`,
 * `ConversationSummarySection`, o botão de respostas rápidas do
 * `MessageComposer`. Sem um `PlanProvider` no ancestral (ou em teste de
 * unidade do componente), devolve `false` — o padrão é mostrar o conteúdo
 * real, nunca esconder por engano.
 */
export function useIsFreePlan(): boolean {
  return useContext(PlanContext)?.isFree ?? false;
}
