import { useEffect, useState } from 'react';
import { fetchMe, type SessionUserInfo } from '@/lib/clientApi';

export interface MeState {
  /** `undefined` = ainda carregando; `null` = sessao de MAQUINA (API key, sem pessoa). */
  user: SessionUserInfo | null | undefined;
}

/**
 * Quem esta logado, para fins de EXIBICAO (Milestone 5, Bloco M5G): Header
 * mostra email/cargo; Sidebar esconde links que o cargo nao alcanca. NUNCA e
 * autorizacao — esconder botao e cortesia de UX; quem barra de verdade e a
 * API (requirePermission/hierarquia). Busca uma vez por montagem via
 * `/api/auth/me` (leitura de cookie no BFF, sem custo de API).
 */
export function useMe(): MeState {
  const [user, setUser] = useState<SessionUserInfo | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (!cancelled) setUser(me.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user };
}
