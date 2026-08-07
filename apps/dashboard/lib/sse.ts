import type { NextApiRequest, NextApiResponse } from 'next';

/** ~2s — intervalo de polling padrão para as rotas SSE (M2, Fase 3 — BFF-3). Ver decisão de arquitetura da Milestone 2: latência de 1-3s é um trade-off aceito conscientemente (poller no BFF sobre os endpoints REST já existentes, em vez de push real de Domain) para não alterar nenhuma decisão arquitetural já aprovada em `apps/api`. */
export const SSE_POLL_INTERVAL_MS = 2000;

/**
 * Roda um endpoint SSE (Server-Sent Events) via POLLING sobre uma função
 * arbitrária (M2, Fase 3 — BFF-3). Cada rota SSE (`stream.ts` da lista,
 * `[sessionName]/stream.ts` do detalhe) só precisa fornecer o `poll()`
 * específico — toda a mecânica de protocolo (headers, formato `data: ...\n\n`,
 * heartbeat, encerramento limpo ao desconectar) vive só aqui, uma vez.
 *
 * Por que POLLING (não push real): decisão já registrada no documento de
 * arquitetura da Milestone 2 — implementar push real exigiria adicionar um
 * novo membro a `WhatsAppProviderEvent` (`qr_updated` ou similar) e uma nova
 * porta `SessionEventPublisher` em `apps/api`, tocando arquivos
 * ADR-protegidos (`SessionManager`/`WhatsAppConnectionRegistry`) para além
 * do que a Fase 2 (M2-B4) já tocou. Pollar os endpoints REST já existentes
 * fica inteiramente dentro de `apps/dashboard` — zero mudança adicional no
 * backend.
 *
 * Tolerância a falha transitória: se `poll()` rejeitar (ex.: API
 * momentaneamente fora do ar), o erro é enviado como um evento SSE
 * `event: error` e o polling CONTINUA (não encerra a conexão) — uma falha
 * de rede de 1 chamada não deveria forçar o cliente a reconectar do zero.
 *
 * Encerramento: `req.on('close', ...)` (disparado quando o cliente
 * desconecta — fecha a aba, navega para outra página, etc.) limpa o
 * `setInterval` — sem isso, cada conexão SSE abandonada deixaria um timer
 * rodando para sempre (vazamento de memória/CPU idêntico em espírito ao já
 * identificado para o `WhatsAppConnectionRegistry` sem TTL — ver
 * PROJECT_STATUS.md — mas aqui, diferente de lá, é evitável sem custo
 * algum, então é evitado).
 */
export function runSsePoller<T>(
  req: NextApiRequest,
  res: NextApiResponse,
  poll: () => Promise<T>,
  intervalMs: number = SSE_POLL_INTERVAL_MS,
): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  // Alguns proxies/reverse-proxies (e o próprio Node em certas condições)
  // atrasam o primeiro flush até haver bytes suficientes no buffer —
  // `flushHeaders` garante que o cliente recebe os headers (e a conexão SSE
  // "abre" de fato, disparando `EventSource.onopen`) imediatamente, mesmo
  // antes do primeiro `poll()` resolver.
  res.flushHeaders?.();

  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const data = await poll();
      if (stopped) return;
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      if (stopped) return;
      res.write(`event: error\ndata: ${JSON.stringify({ message: (error as Error).message })}\n\n`);
    }
  };

  // Primeiro tick imediato (não espera o primeiro `intervalMs`) — o cliente
  // vê o estado atual assim que a conexão abre, não só depois de ~2s.
  void tick();
  const interval = setInterval(() => {
    void tick();
  }, intervalMs);

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    res.end();
  };

  req.on('close', stop);
}
