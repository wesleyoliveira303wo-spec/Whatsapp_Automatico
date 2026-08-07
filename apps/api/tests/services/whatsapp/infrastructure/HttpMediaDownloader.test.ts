import { HttpMediaDownloader } from '../../../../src/services/whatsapp/infrastructure/HttpMediaDownloader';
import { Logger } from '../../../../src/shared/domain/Logger';

function buildFakeLogger(): Logger & { warnCalls: unknown[][]; debugCalls: unknown[][] } {
  const logger = {
    warnCalls: [] as unknown[][],
    debugCalls: [] as unknown[][],
    debug(...args: unknown[]) {
      logger.debugCalls.push(args);
    },
    info() {},
    warn(...args: unknown[]) {
      logger.warnCalls.push(args);
    },
    error() {},
    child() {
      return logger;
    },
  };
  return logger;
}

const MEDIA = {
  contentType: 'image' as const,
  mimeType: 'image/jpeg',
  url: 'https://x.enc',
  mediaKeyEncrypted: 'enc:abc',
};

describe('HttpMediaDownloader (Fase 1, Bloco F1.2)', () => {
  it('chama a rota interna com o segredo no header e devolve o binário quando a resposta é 2xx', async () => {
    // Nota: `Buffer.from(str).buffer` NÃO é seguro aqui — o `ArrayBuffer`
    // subjacente de um Buffer pequeno pode vir de um pool compartilhado maior
    // que os bytes reais, incluindo lixo de outras alocações. `Uint8Array.
    // from(...).buffer` isola um ArrayBuffer do tamanho exato do conteúdo,
    // replicando fielmente o que `Response.arrayBuffer()` devolve de verdade.
    const conteudoBuffer = Buffer.from('conteudo');
    const arrayBuffer = Uint8Array.from(conteudoBuffer).buffer;
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => arrayBuffer,
    });
    const downloader = new HttpMediaDownloader(
      'http://api:4000',
      'segredo-123',
      undefined,
      fetchFn as unknown as typeof fetch,
    );

    const result = await downloader.download('tenant-1', 'sessao-1', MEDIA);

    expect(result).toEqual(Buffer.from('conteudo'));
    expect(fetchFn).toHaveBeenCalledWith('http://api:4000/internal/media/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': 'segredo-123' },
      body: JSON.stringify({ tenantId: 'tenant-1', sessionName: 'sessao-1', ...MEDIA }),
    });
  });

  it('resposta não-2xx: devolve undefined e loga debug (não warn — caso esperado)', async () => {
    const logger = buildFakeLogger();
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const downloader = new HttpMediaDownloader(
      'http://api:4000',
      'segredo-123',
      logger,
      fetchFn as unknown as typeof fetch,
    );

    const result = await downloader.download('tenant-1', 'sessao-1', MEDIA);

    expect(result).toBeUndefined();
    expect(logger.debugCalls).toHaveLength(1);
    expect(logger.warnCalls).toHaveLength(0);
  });

  it('falha de rede (fetch lança): devolve undefined e loga warn, nunca propaga a exceção', async () => {
    const logger = buildFakeLogger();
    const fetchFn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const downloader = new HttpMediaDownloader(
      'http://api:4000',
      'segredo-123',
      logger,
      fetchFn as unknown as typeof fetch,
    );

    const result = await downloader.download('tenant-1', 'sessao-1', MEDIA);

    expect(result).toBeUndefined();
    expect(logger.warnCalls).toHaveLength(1);
  });

  it('funciona sem logger configurado (parâmetro opcional)', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('falha'));
    const downloader = new HttpMediaDownloader(
      'http://api:4000',
      'segredo-123',
      undefined,
      fetchFn as unknown as typeof fetch,
    );

    await expect(downloader.download('tenant-1', 'sessao-1', MEDIA)).resolves.toBeUndefined();
  });
});
