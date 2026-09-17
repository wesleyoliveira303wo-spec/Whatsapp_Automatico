import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_POLL_INTERVAL_MS } from './usePollingRefresh';

export interface SharedPollSnapshot<T> {
  /** Último dado bom. Uma falha num poll seguinte NÃO o apaga. */
  data: T | undefined;
  /** Erro da ÚLTIMA tentativa; volta a `undefined` no próximo sucesso. */
  error: unknown;
  /** `true` depois da 1ª resposta (sucesso ou erro) — o fim do "carregando". */
  settled: boolean;
}

export interface UseSharedPollResult<T> extends SharedPollSnapshot<T> {
  /** Busca de novo agora (compartilhado: todos os componentes recebem o resultado). */
  refresh: () => void;
  /** Substitui o dado de todos os componentes inscritos na mesma chave (ex.: resposta de uma ação). */
  setData: (data: T) => void;
}

/** Recebe o dado anterior da MESMA chave (`undefined` na 1ª busca) — útil para detectar o que mudou. */
export type SharedPollFetcher<T> = (previous: T | undefined) => Promise<T>;

interface Entry {
  snapshot: SharedPollSnapshot<unknown>;
  listeners: Set<() => void>;
  fetcher: SharedPollFetcher<unknown>;
  intervalMs: number;
  inFlight: Promise<void> | null;
  timer: ReturnType<typeof setInterval> | undefined;
  onVisibilityChange: () => void;
}

const EMPTY: SharedPollSnapshot<never> = { data: undefined, error: undefined, settled: false };

/**
 * Um poll por CHAVE, não por componente (2026-09-17, medido no navegador):
 * a conversa aberta montava `useConversationDetail` e `useAiInteractions`
 * duas vezes cada (painel central e painel de contexto), e Configurações
 * montava `useWaitingForHuman` duas vezes (rail e aba WhatsApps). Cada cópia
 * tinha o próprio temporizador — ~90 requisições por minuto numa conversa
 * aberta, metade delas repetidas, e o alerta de "atendimento humano" tocava
 * uma vez por cópia.
 *
 * Aqui a primeira inscrição numa chave busca e liga UM temporizador; as
 * seguintes só recebem o mesmo resultado. Quando a última sai, o temporizador
 * para e a entrada é descartada (nada sobrevive entre telas nem entre testes).
 * Pausa com a aba oculta e busca na hora ao voltar — mesmo contrato de
 * `usePollingRefresh`.
 */
const registry = new Map<string, Entry>();

function notify(entry: Entry): void {
  for (const listener of entry.listeners) listener();
}

function runFetch(entry: Entry): Promise<void> {
  if (entry.inFlight) return entry.inFlight;
  entry.inFlight = entry
    .fetcher(entry.snapshot.data)
    .then(
      (data) => {
        entry.snapshot = { data, error: undefined, settled: true };
      },
      (error: unknown) => {
        entry.snapshot = { ...entry.snapshot, error, settled: true };
      },
    )
    .finally(() => {
      entry.inFlight = null;
      notify(entry);
    });
  return entry.inFlight;
}

function startTimer(entry: Entry): void {
  if (entry.timer === undefined) {
    entry.timer = setInterval(() => void runFetch(entry), entry.intervalMs);
  }
}

function stopTimer(entry: Entry): void {
  if (entry.timer !== undefined) {
    clearInterval(entry.timer);
    entry.timer = undefined;
  }
}

function acquire(key: string, fetcher: SharedPollFetcher<unknown>, intervalMs: number): Entry {
  const existing = registry.get(key);
  if (existing) return existing;

  const entry: Entry = {
    snapshot: EMPTY,
    listeners: new Set(),
    fetcher,
    intervalMs,
    inFlight: null,
    timer: undefined,
    onVisibilityChange: () => {
      if (document.visibilityState === 'visible') {
        void runFetch(entry);
        startTimer(entry);
      } else {
        stopTimer(entry);
      }
    },
  };
  registry.set(key, entry);
  void runFetch(entry);
  if (typeof document !== 'undefined') {
    if (document.visibilityState === 'visible') startTimer(entry);
    document.addEventListener('visibilitychange', entry.onVisibilityChange);
  }
  return entry;
}

function release(key: string, entry: Entry, listener: () => void): void {
  entry.listeners.delete(listener);
  if (entry.listeners.size > 0) return;
  stopTimer(entry);
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', entry.onVisibilityChange);
  }
  if (registry.get(key) === entry) registry.delete(key);
}

/**
 * `key === null` desliga o hook. O `fetcher` usado é o da PRIMEIRA inscrição
 * na chave — a mesma chave precisa sempre significar a mesma busca.
 */
export function useSharedPoll<T>(
  key: string | null,
  fetcher: SharedPollFetcher<T>,
  intervalMs: number = DEFAULT_POLL_INTERVAL_MS,
): UseSharedPollResult<T> {
  const [snapshot, setSnapshot] = useState<SharedPollSnapshot<T>>(
    () => ((key && registry.get(key)?.snapshot) as SharedPollSnapshot<T> | undefined) ?? EMPTY,
  );

  useEffect(() => {
    if (!key) {
      setSnapshot(EMPTY);
      return;
    }
    const entry = acquire(key, fetcher as SharedPollFetcher<unknown>, intervalMs);
    const listener = (): void => setSnapshot(entry.snapshot as SharedPollSnapshot<T>);
    entry.listeners.add(listener);
    listener();
    return () => release(key, entry, listener);
    // `fetcher` fica de fora de propósito: uma arrow nova a cada render
    // recriaria a inscrição sem necessidade (ver docstring do hook).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intervalMs]);

  const refresh = useCallback(() => {
    const entry = key ? registry.get(key) : undefined;
    if (entry) void runFetch(entry);
  }, [key]);

  const setData = useCallback(
    (data: T) => {
      const entry = key ? registry.get(key) : undefined;
      if (!entry) return;
      entry.snapshot = { data, error: undefined, settled: true };
      notify(entry);
    },
    [key],
  );

  return { ...snapshot, refresh, setData };
}
