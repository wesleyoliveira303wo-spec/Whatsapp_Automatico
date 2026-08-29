import { useEffect, useState } from 'react';
import { useSessionsList } from './useSessionsList';
import { fetchAiProfile, type AiBusinessProfile } from '../lib/clientApi';

export interface SessionBusinessProfile {
  sessionName: string;
  profile: AiBusinessProfile | null;
}

export interface UseAllBusinessProfilesResult {
  items: SessionBusinessProfile[];
  loading: boolean;
  errorMessage: string | null;
}

/**
 * Auditoria do Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fases 8/15) —
 * busca o `AiBusinessProfile` (horário + resumo cacheado) de CADA sessão do
 * tenant, para as seções "Horário de atendimento" e "Sobre o negócio" do
 * Perfil (leitura pura — nenhuma das duas GERA nada aqui; o resumo já vem
 * pronto do backend, cacheado por `BusinessSummaryService`).
 *
 * Uma requisição por sessão (`fetchAiProfile`, já existente — reaproveitado
 * do Cérebro da IA, nenhum endpoint novo), disparadas em paralelo. Tenants
 * têm poucas sessões (a UI de Configurações já assume isso, ver
 * `AtendimentoSettingsTab`), então N chamadas pequenas em paralelo é
 * aceitável — não há paginação/lazy-load aqui de propósito (YAGNI).
 *
 * `profile: null` é um resultado válido (sessão nunca configurou o Cérebro
 * da IA) — só uma falha de rede/API vira `errorMessage`.
 */
/**
 * O resumo (`summary`) é gerado no backend de forma assíncrona (fire-and-forget
 * após um `PUT` no Cérebro da IA, ~15-25s com a chamada à IA). Se um perfil
 * tem texto mas ainda não tem resumo, a busca é repetida algumas vezes até
 * ele aparecer — sem isso, o usuário só veria o resumo novo depois de um
 * F5 (bug do fundador, 2026-08-28).
 */
const SUMMARY_POLL_INTERVAL_MS = 6000;
const SUMMARY_POLL_MAX_ATTEMPTS = 8;

function someSummaryPending(items: SessionBusinessProfile[]): boolean {
  return items.some(
    ({ profile }) => profile !== null && profile.content.trim() !== '' && !profile.summary,
  );
}

export function useAllBusinessProfiles(): UseAllBusinessProfilesResult {
  const { sessions, loading: loadingSessions } = useSessionsList();
  const [items, setItems] = useState<SessionBusinessProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (loadingSessions) return;
    if (sessions.length === 0) {
      setItems([]);
      setLoadingProfiles(false);
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const sessionNames = sessions.map((session) => session.sessionName);

    const fetchAll = async (): Promise<SessionBusinessProfile[]> =>
      Promise.all(
        sessionNames.map(async (sessionName) => {
          try {
            const { profile } = await fetchAiProfile(sessionName);
            return { sessionName, profile };
          } catch {
            return { sessionName, profile: null };
          }
        }),
      );

    const runOnce = (isInitial: boolean): void => {
      if (isInitial) setLoadingProfiles(true);
      fetchAll()
        .then((results) => {
          if (cancelled) return;
          setItems(results);
          attempts += 1;
          if (someSummaryPending(results) && attempts < SUMMARY_POLL_MAX_ATTEMPTS) {
            pollTimer = setTimeout(() => runOnce(false), SUMMARY_POLL_INTERVAL_MS);
          }
        })
        .catch(() => {
          if (!cancelled && isInitial) {
            setErrorMessage('Não foi possível carregar os dados do Cérebro da IA.');
          }
        })
        .finally(() => {
          if (!cancelled && isInitial) setLoadingProfiles(false);
        });
    };

    runOnce(true);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
    // `sessions` é um array novo a cada frame do SSE (`useSessionsList`);
    // refazer as N chamadas a cada frame seria caro e não muda quase nunca
    // (uma sessão nova/removida é rara) — refaz só pela QUANTIDADE de
    // sessões, sinal suficiente de que a lista mudou de verdade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingSessions, sessions.length]);

  return { items, loading: loadingSessions || loadingProfiles, errorMessage };
}
