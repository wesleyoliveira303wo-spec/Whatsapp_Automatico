import { createContext, useContext, type ReactNode } from 'react';
import { useAiToggle, type UseAiToggleResult } from '@/hooks/useAiToggle';

const AiToggleContext = createContext<UseAiToggleResult | null>(null);

interface AiToggleProviderProps {
  sessionName: string;
  children: ReactNode;
}

/**
 * Fase 1 (2026-08-07) — Botão POWER: correção do achado real do fundador
 * ("clico no botão, mas o selo das conversas só muda depois de dar F5").
 * Causa raiz: `AiPowerToggle` (cabeçalho) e `ConversationInbox` (lista/
 * detalhe/contexto) cada um chamava `useAiToggle(sessionName)` na sua
 * própria instância — dois estados independentes, sem nenhuma relação entre
 * si; clicar no botão só atualizava a CÓPIA dele, nunca a da lista.
 *
 * Corrigido com Context: `useAiToggle` continua sendo o dono de toda a
 * lógica (busca inicial + `toggle()` otimista com revert em falha) — só
 * passa a rodar UMA vez aqui, montado por `SessionLayout` (ancestral comum
 * do cabeçalho E do conteúdo da página), e todo consumidor lê a MESMA
 * instância via `useAiToggleContext()`. Um clique atualiza os dois lugares
 * na mesma renderização, sem esperar nenhum fetch novo.
 */
export function AiToggleProvider({ sessionName, children }: AiToggleProviderProps): JSX.Element {
  const value = useAiToggle(sessionName);
  return <AiToggleContext.Provider value={value}>{children}</AiToggleContext.Provider>;
}

/** Lê o estado compartilhado do Botão POWER. Só funciona dentro de `AiToggleProvider` (montado por `SessionLayout`). */
export function useAiToggleContext(): UseAiToggleResult {
  const value = useContext(AiToggleContext);
  if (!value) {
    throw new Error('useAiToggleContext deve ser usado dentro de um AiToggleProvider (ver SessionLayout).');
  }
  return value;
}
