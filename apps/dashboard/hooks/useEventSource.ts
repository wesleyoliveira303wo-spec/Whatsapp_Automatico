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
  const [data, setData] = useState<T | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!url) {
      setData(null);
      setConnected(false);
      return;
    }

    const source = new EventSource(url);

    source.onopen = () => {
      setConnected(true);
    };

    source.onmessage = (event: MessageEvent) => {
      const parsed = parseJsonSafely<T>(event.data);
      if (parsed !== null) {
        setData(parsed);
        setErrorMessage(null);
      }
    };

    source.addEventListener('error', (event: Event) => {
      const messageEvent = event as MessageEvent;
      if (typeof messageEvent.data === 'string') {
        const parsed = parseJsonSafely<{ message?: string }>(messageEvent.data);
        setErrorMessage(parsed?.message ?? 'Falha ao atualizar os dados.');
        return;
      }
      setConnected(false);
    });

    return () => {
      source.close();
    };
  }, [url]);

  return { data, errorMessage, connected };
}
