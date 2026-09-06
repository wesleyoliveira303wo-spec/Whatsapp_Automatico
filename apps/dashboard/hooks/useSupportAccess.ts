import { useCallback, useEffect, useRef, useState } from 'react';

import { usePollingRefresh } from './usePollingRefresh';
import {
  ClientApiError,
  fetchActiveSupportAccess,
  respondSupportAccess,
  revokeSupportAccess,
  type ActiveSupportAccess,
} from '@/lib/clientApi';

const POLL_MS = 10_000;

export interface SupportAccessState {
  open: ActiveSupportAccess | null;
  canRespond: boolean;
  /** `true` só até a primeira resposta chegar — evita piscar o banner. */
  loading: boolean;
  /** A chamada `/active` voltou 401 (deslogado) — o consumidor não deve renderizar nada. */
  unauthenticated: boolean;
  respond: (decision: 'accept' | 'deny') => Promise<void>;
  revoke: () => Promise<void>;
  refresh: () => void;
}

/**
 * Estado do acesso assistido para o TENANT logado (Painel `/admin`, Fase 5).
 * Faz polling de `/api/support-access/active` (~10s, pausa com a aba oculta,
 * mesmo padrão de `useWaitingForHuman`). Consumido pelo `SupportAccessBanner`,
 * montado uma vez em `_app.tsx`.
 */
export function useSupportAccess(enabled: boolean): SupportAccessState {
  const [open, setOpen] = useState<ActiveSupportAccess | null>(null);
  const [canRespond, setCanRespond] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const cancelled = useRef(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const { open: current, canRespond: allowed } = await fetchActiveSupportAccess();
      if (cancelled.current) return;
      setOpen(current);
      setCanRespond(allowed);
      setUnauthenticated(false);
    } catch (err) {
      if (cancelled.current) return;
      if (err instanceof ClientApiError && (err.status === 401 || err.status === 403)) {
        setUnauthenticated(true);
        setOpen(null);
      }
      // Outros erros: mantém o estado anterior (rede instável não deve apagar
      // um banner de acesso ativo).
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    cancelled.current = false;
    void load();
    return () => {
      cancelled.current = true;
    };
  }, [load]);

  usePollingRefresh(() => void load(), POLL_MS);

  const respond = useCallback(
    async (decision: 'accept' | 'deny') => {
      if (!open) return;
      await respondSupportAccess(open.id, decision);
      await load();
    },
    [open, load],
  );

  const revoke = useCallback(async () => {
    if (!open) return;
    await revokeSupportAccess(open.id);
    await load();
  }, [open, load]);

  return {
    open,
    canRespond,
    loading,
    unauthenticated,
    respond,
    revoke,
    refresh: () => void load(),
  };
}
