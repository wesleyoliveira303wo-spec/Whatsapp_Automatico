import { runSsePoller, SSE_MAX_LIFETIME_MS } from '../../lib/sse';
import { createFakeReq, createFakeRes } from '../testDoubles';

describe('runSsePoller', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('escreve os headers SSE corretos e faz flushHeaders imediatamente', () => {
    const res = createFakeRes();
    const req = createFakeReq();

    runSsePoller(req, res, async () => ({ ok: true }));

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    expect(res.flushHeaders).toHaveBeenCalled();
  });

  it('faz o primeiro poll imediatamente, sem esperar o intervalo', async () => {
    const res = createFakeRes();
    const req = createFakeReq();
    const poll = jest.fn().mockResolvedValue({ status: 200, body: { sessions: [] } });

    runSsePoller(req, res, poll, 2000);
    await jest.advanceTimersByTimeAsync(0); // deixa a microtask do primeiro tick() resolver

    expect(poll).toHaveBeenCalledTimes(1);
    expect(res.write).toHaveBeenCalledWith(
      `data: ${JSON.stringify({ status: 200, body: { sessions: [] } })}\n\n`,
    );
  });

  it('faz poll novamente a cada intervalMs', async () => {
    const res = createFakeRes();
    const req = createFakeReq();
    const poll = jest.fn().mockResolvedValue({ ok: true });

    runSsePoller(req, res, poll, 2000);
    await jest.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2000);
    expect(poll).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(2000);
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it('quando poll() rejeita, escreve um evento SSE "error" e CONTINUA pollando (não encerra a conexão)', async () => {
    const res = createFakeRes();
    const req = createFakeReq();
    const poll = jest
      .fn()
      .mockRejectedValueOnce(new Error('falha transitória'))
      .mockResolvedValueOnce({ ok: true });

    runSsePoller(req, res, poll, 2000);
    await jest.advanceTimersByTimeAsync(0);

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: error'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('falha transitória'));
    expect(res.end).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('para de pollar e chama res.end() quando o cliente desconecta (req "close")', async () => {
    const res = createFakeRes();
    let closeHandler: (() => void) | undefined;
    const req = createFakeReq({
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'close') closeHandler = handler;
      }) as never,
    });
    const poll = jest.fn().mockResolvedValue({ ok: true });

    runSsePoller(req, res, poll, 2000);
    await jest.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);

    closeHandler?.();
    expect(res.end).toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(10000);
    // Nenhuma chamada nova a poll() depois do close — o interval foi limpo.
    expect(poll).toHaveBeenCalledTimes(1);
  });

  /**
   * HOTFIX 2026-08-25 — achado real: com uma aba aberta por horas, a MESMA
   * conexão SSE seguia pollando com um `session`/access token capturado só
   * na abertura (TTL de 900s) — todo tick depois de ~15 min mandava um
   * Bearer expirado e a API respondia 401 pra sempre, sem o `EventSource`
   * nunca reconectar (não é erro de rede, é uma conexão HTTP que continua
   * "aberta" — só as respostas de dentro dela ficam ruins). Ver docstring
   * de `SSE_MAX_LIFETIME_MS`.
   */
  it('HOTFIX 2026-08-25: encerra a conexão sozinho após maxLifetimeMs, mesmo sem o cliente desconectar', async () => {
    const res = createFakeRes();
    const req = createFakeReq();
    const poll = jest.fn().mockResolvedValue({ ok: true });

    runSsePoller(req, res, poll, 2000, 60_000);
    await jest.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(res.end).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60_000);
    expect(res.end).toHaveBeenCalledTimes(1);

    // Depois do encerramento por tempo de vida máximo, nenhum poll novo —
    // o interval foi limpo junto (mesma garantia do encerramento por close).
    const pollCallsAtStop = poll.mock.calls.length;
    await jest.advanceTimersByTimeAsync(10_000);
    expect(poll).toHaveBeenCalledTimes(pollCallsAtStop);
  });

  it('usa SSE_MAX_LIFETIME_MS como default quando nenhum maxLifetimeMs é passado (10 min, com folga sobre o TTL de 900s do access token)', async () => {
    const res = createFakeRes();
    const req = createFakeReq();
    const poll = jest.fn().mockResolvedValue({ ok: true });

    expect(SSE_MAX_LIFETIME_MS).toBeLessThan(900_000);

    runSsePoller(req, res, poll, 2000);
    await jest.advanceTimersByTimeAsync(0);

    await jest.advanceTimersByTimeAsync(SSE_MAX_LIFETIME_MS - 1);
    expect(res.end).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('desconexão do cliente ANTES do maxLifetimeMs também limpa o timer de tempo de vida (não chama res.end() duas vezes)', async () => {
    const res = createFakeRes();
    let closeHandler: (() => void) | undefined;
    const req = createFakeReq({
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'close') closeHandler = handler;
      }) as never,
    });
    const poll = jest.fn().mockResolvedValue({ ok: true });

    runSsePoller(req, res, poll, 2000, 60_000);
    await jest.advanceTimersByTimeAsync(0);

    closeHandler?.();
    expect(res.end).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(res.end).toHaveBeenCalledTimes(1);
  });
});
