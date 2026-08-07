import { runSsePoller } from '../../lib/sse';
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
});
