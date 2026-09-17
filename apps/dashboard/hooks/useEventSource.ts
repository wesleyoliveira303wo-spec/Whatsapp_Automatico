import { useEffect, useState } from 'react';
import { parseJsonSafely } from '../lib/parseJsonSafely';

export interface UseEventSourceResult<T> {
  /** Último payload decodificado com sucesso. `null` até o primeiro frame chegar (o poller do BFF, `runSsePoller`, envia o primeiro tick imediatamente ao abrir — Fase 3 — então isso normalmente resolve em uma única viagem de rede, não em ~2s). */
  data: T | null;
  /** Mensagem do último frame `event: error` recebido (falha transitória do poller no BFF, ex.: API momentaneamente fora do ar) — a conexão SSE continua aberta; `null` assim que um novo `data:` chega com sucesso. */
  errorMessage: string | null;
  /** `true` desde o evento `open` nativo do `EventSource` até uma falha de conexão real (rede, servidor fora do ar). Não reflete falhas transitórias reportadas via `event: error` — essas mantêm `connected === true` (a conexão SSE em si nunca caiu, só uma chamada individual falhou do lado do BFF). */
  connected: boolean;
}

interface SourceEntry {
  source: EventSource;
  state: UseEventSourceResult<unknown>;
  listeners: Set<() => void>;
}

/**
 * Uma conexão por URL, não por componente (2026-09-17): `SessionHeader`,
 * `SessionRail` e `SessionConnectionPanel` abriam cada um o seu
 * `EventSource` para `/api/sessions/:nome/stream` — e cada conexão SSE faz o
 * BFF consultar a API a cada 2s. Três conexões iguais triplicavam essa carga
 * e ocupavam três das seis conexões HTTP/1.1 que o navegador permite por
 * origem. Agora a primeira inscrição abre a conexão, as demais recebem o mesmo
 * estado, e a última a sair fecha.
 */
const sources = new Map<string, SourceEntry>();

const INITIAL_STATE: UseEventSourceResult<never> = {
  data: null,
  errorMessage: null,
  connected: false,
};

function acquireSource(url: string): SourceEntry {
  const existing = sources.get(url);
  if (existing) return existing;

  const entry: SourceEntry = {
    source: new EventSource(url),
    state: INITIAL_STATE,
    listeners: new Set(),
  };
  const update = (patch: Partial<UseEventSourceResult<unknown>>): void => {
    entry.state = { ...entry.state, ...patch };
    for (const listener of entry.listeners) listener();
  };

  entry.source.onopen = () => {
    update({ connected: true });
  };

  entry.source.onmessage = (event: MessageEvent) => {
    const parsed = parseJsonSafely<unknown>(event.data);
    if (parsed !== null) {
      update({ data: parsed, errorMessage: null });
    }
  };

  entry.source.addEventListener('error', (event: Event) => {
    const messageEvent = event as MessageEvent;
    if (typeof messageEvent.data === 'string') {
      const parsed = parseJsonSafely<{ message?: string }>(messageEvent.data);
      update({ errorMessage: parsed?.message ?? 'Falha ao atualizar os dados.' });
      return;
    }
    update({ connected: false });
  });

  sources.set(url, entry);
  return entry;
}

function releaseSource(url: string, entry: SourceEntry, listener: () => void): void {
  entry.listeners.delete(listener);
  if (entry.listeners.size > 0) return;
  entry.source.close();
  if (sources.get(url) === entry) sources.delete(url);
}

/**
 * Hook cliente (M2, Fase 4 — UI-3) que consome um endpoint SSE do próprio
 * BFF (`/api/sessions/stream`, `/api/sessions/:sessionName/stream` — Fase
 * 3, BFF-3) via `EventSource` nativo do browser. Pura cola de framework:
 * decodifica cada frame com `parseJsonSafely` (a única parte testável sem
 * jsdom, já coberta por `tests/lib/parseJsonSafely.test.ts`) e expõe o
 * último valor conhecido como estado do React.
 *
 * Distinção entre os dois "erros" possíveis num `EventSource`, ambos
 * entregues como um evento de tipo `'error'`:
 * - Frame nomeado `event: error` que o SERVIDOR envia de propósito (nosso
 *   `runSsePoller`) — chega como `MessageEvent` (tem `.data`). Falha de UMA
 *   chamada; a conexão continua.
 * - Erro de CONEXÃO de verdade (rede caiu, servidor não respondeu) — chega
 *   como `Event` puro (sem `.data`). O `EventSource` nativo tenta reconectar
 *   sozinho (comportamento padrão do protocolo SSE); aqui só marcamos
 *   `connected = false` enquanto isso não acontece.
 *
 * `url === null` desliga o hook (não abre conexão nenhuma) — usado por
 * `useSessionDetail` quando `sessionName` ainda não está disponível (ex.:
 * primeira renderização de uma rota dinâmica antes do router hidratar).
 */
export function useEventSource<T>(url: string | null): UseEventSourceResult<T> {
  const [state, setState] = useState<UseEventSourceResult<T>>(
    () => ((url && sources.get(url)?.state) as UseEventSourceResult<T> | undefined) ?? INITIAL_STATE,
  );

  useEffect(() => {
    if (!url) {
      setState(INITIAL_STATE);
      return;
    }
    const entry = acquireSource(url);
    const listener = (): void => setState(entry.state as UseEventSourceResult<T>);
    entry.listeners.add(listener);
    listener();
    return () => releaseSource(url, entry, listener);
  }, [url]);

  return state;
}
