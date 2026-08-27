import type { NextApiRequest, NextApiResponse } from 'next';

/** ~2s — intervalo de polling padrão para as rotas SSE (M2, Fase 3 — BFF-3). Ver decisão de arquitetura da Milestone 2: latência de 1-3s é um trade-off aceito conscientemente (poller no BFF sobre os endpoints REST já existentes, em vez de push real de Domain) para não alterar nenhuma decisão arquitetural já aprovada em `apps/api`. */
export const SSE_POLL_INTERVAL_MS = 2000;

/**
 * HOTFIX 2026-08-25 — achado real: com uma aba aberta o dia inteiro, a lista
 * de Conversas passou a mostrar "Falha ao carregar conversas (status 401)"
 * permanentemente, sem nenhuma ação do usuário. Causa raiz medida: o access
 * token embutido no `session` capturado por `requireSession` (chamado só
 * UMA VEZ, na abertura da conexão SSE) tem TTL de 900s (`ACCESS_TOKEN_TTL_SECONDS`,
 * `.env`) — mas a mesma conexão SSE (via `EventSource` nativo, que só
 * reconecta sozinho se a conexão CAIR) fica pollando com esse MESMO
 * `session` capturado indefinidamente, sem nunca reexecutar `requireSession`
 * pra renovar o token. Passados os 15 minutos, todo tick seguinte manda um
 * Bearer expirado pra API real, que devolve 401 pra sempre — até a página
 * ser recarregada manualmente.
 *
 * Não dá pra renovar o cookie NO MEIO da conexão (os headers HTTP já foram
 * enviados via `flushHeaders`/primeiro `res.write` — não é mais possível
 * mandar `Set-Cookie`), e renovar o token só EM MEMÓRIA (sem persistir no
 * cookie) arriscaria o `EventSource` reconectar mais tarde usando o refresh
 * token ANTIGO (já consumido/rotacionado por essa renovação em memória),
 * disparando a detecção de reuso de refresh token (M5A) e derrubando a
 * sessão inteira — pior que o problema original.
 *
 * Correção: encerrar a conexão de propósito bem antes do token expirar. O
 * `EventSource` nativo reconecta sozinho a QUALQUER encerramento do lado do
 * servidor (não só erro de rede) — a reconexão é uma requisição HTTP NOVA,
 * que passa por `requireSession` de novo, com cookie fresco e `Set-Cookie`
 * normal. 10 min dá margem folgada sobre o TTL de 15 min (900s) mesmo
 * somando o tempo de processamento de um tick em andamento.
 */
export const SSE_MAX_LIFETIME_MS = 10 * 60 * 1000;

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
  maxLifetimeMs: number = SSE_MAX_LIFETIME_MS,
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

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    clearTimeout(lifetimeTimer);
    res.end();
  };

  // Primeiro tick imediato (não espera o primeiro `intervalMs`) — o cliente
  // vê o estado atual assim que a conexão abre, não só depois de ~2s.
  void tick();
  const interval = setInterval(() => {
    void tick();
  }, intervalMs);
  // Ver docstring de `SSE_MAX_LIFETIME_MS`: encerra a conexão de propósito
  // bem antes do access token expirar, forçando o `EventSource` do cliente
  // a reconectar (requisição HTTP nova, `requireSession` renova o token de
  // verdade) — em vez de deixar a MESMA conexão pollar por horas com um
  // token que só foi validado uma vez, na abertura.
  const lifetimeTimer = setTimeout(stop, maxLifetimeMs);

  req.on('close', stop);
}
