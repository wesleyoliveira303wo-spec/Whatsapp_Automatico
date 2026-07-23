/**
 * Parse defensivo de JSON (M2, Fase 4) — usado por `hooks/useEventSource.ts`
 * para decodificar o `event.data` que o `EventSource` nativo do browser já
 * separou do protocolo SSE (o browser cuida de `data:`/`event:`/`\n\n`;
 * este módulo só cuida do parse do payload). Extraído como função pura
 * (sem tocar `EventSource`/DOM) para ser testável no ambiente de testes
 * atual (`testEnvironment: 'node'`) — mesmo racional de `formatters.ts`.
 * Nunca lança: um frame malformado não deveria derrubar a UI inteira, só
 * ser ignorado (o próximo tick do poller, ~2s depois, corrige sozinho).
 */
export function parseJsonSafely<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
