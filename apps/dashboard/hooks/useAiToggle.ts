import { useCallback, useEffect, useState } from 'react';
import { fetchAiProfile, setAiEnabled as requestSetAiEnabled } from '../lib/clientApi';

export interface UseAiToggleResult {
  /** `null` enquanto o estado inicial ainda não chegou (ver `loading`). */
  aiEnabled: boolean | null;
  loading: boolean;
  errorMessage: string | null;
  /** Alterna o estado com atualização otimista; reverte + seta `errorMessage` se a chamada falhar. */
  toggle: () => Promise<void>;
}

/**
 * Botão POWER (Fase 1, 2026-08-07) — liga/desliga a resposta automática da
 * IA para UMA sessão, sem afetar a conexão do WhatsApp. Estado persistido no
 * backend (`AiBusinessProfile.aiEnabled`, ver `PATCH .../ai-profile`) — este
 * hook só reflete e propõe mudanças, nunca é a fonte de verdade (sobrevive a
 * reload/reconexão porque busca do servidor a cada `sessionName` novo).
 *
 * Busca via `fetchAiProfile` (mesmo endpoint da tela "Cérebro da IA" — sem
 * perfil configurado ainda, `profile` é `null` e o default é sempre
 * "ligado", espelhando o comportamento do backend). `toggle()` chama
 * `PATCH .../ai-profile` (endpoint dedicado — não precisa do formulário
 * completo do Cérebro da IA carregado) com atualização OTIMISTA: o texto ao
 * lado do botão muda na hora do clique, e reverte silenciosamente com um
 * erro visível se a chamada falhar (evita a UI "mentir" sobre o estado real).
 */
export function useAiToggle(sessionName: string | null): UseAiToggleResult {
  const [aiEnabled, setAiEnabledState] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionName) return;
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetchAiProfile(sessionName)
      .then(({ profile }) => {
        if (!cancelled) setAiEnabledState(profile?.aiEnabled ?? true);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Falha ao carregar o estado da IA.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionName]);

  const toggle = useCallback(async (): Promise<void> => {
    if (!sessionName || aiEnabled === null) return;
    const next = !aiEnabled;
    setAiEnabledState(next);
    setErrorMessage(null);
    try {
      await requestSetAiEnabled(sessionName, next);
    } catch {
      setAiEnabledState(!next);
      setErrorMessage('Não foi possível atualizar o estado da IA. Tente novamente.');
    }
  }, [sessionName, aiEnabled]);

  return { aiEnabled, loading, errorMessage, toggle };
}
