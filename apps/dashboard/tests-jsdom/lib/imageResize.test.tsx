/**
 * Auditoria do Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fase 4) —
 * `resizeImageToDataUrl` roda inteiramente no navegador (canvas, `Image`),
 * ausentes no jsdom por padrão. Mocka as 3 pontas do browser que a função
 * usa (`Image`, `HTMLCanvasElement#getContext`/`#toDataURL`,
 * `URL.createObjectURL`) — não testa se o RECORTE visual está certo (jsdom
 * não renderiza pixel nenhum), só a lógica: recusa arquivo não-imagem,
 * tenta qualidades decrescentes até caber no teto, desiste com erro
 * legível se nem a pior qualidade coube.
 */
import { resizeImageToDataUrl, ImageResizeError } from '../../lib/imageResize';

/** Fábrica de um "arquivo de imagem" falso — `File` real do jsdom, conteúdo irrelevante (a leitura de pixel é toda mockada). */
function fakeImageFile(type = 'image/png'): File {
  return new File([new Uint8Array([1, 2, 3])], 'foto.png', { type });
}

describe('resizeImageToDataUrl', () => {
  let originalImage: typeof Image;
  let getContextSpy: jest.SpyInstance;
  let toDataUrlSpy: jest.SpyInstance;

  beforeEach(() => {
    originalImage = global.Image;
    // `Image` do jsdom nunca decodifica de verdade — `onload`/`onerror`
    // nunca disparam sozinhos. Este fake simula uma imagem 400x300 válida
    // (ou falha, se `src` contiver o marcador `#broken`) assim que `src` é
    // atribuído — mesmo contrato assíncrono do `Image` real.
    class FakeImage {
      naturalWidth = 400;
      naturalHeight = 300;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      set src(value: string) {
        this._src = value;
        queueMicrotask(() => {
          if (value.includes('#broken')) this.onerror?.();
          else this.onload?.();
        });
      }
      get src(): string {
        return this._src;
      }
    }
    // @ts-expect-error -- substitui `Image` global só para este teste, não é o construtor real do DOM.
    global.Image = FakeImage;

    if (!URL.createObjectURL) {
      // @ts-expect-error -- jsdom não implementa isto nativamente.
      URL.createObjectURL = jest.fn();
    }
    if (!URL.revokeObjectURL) {
      // @ts-expect-error -- idem.
      URL.revokeObjectURL = jest.fn();
    }
    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage: jest.fn() } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    global.Image = originalImage;
    jest.restoreAllMocks();
  });

  it('recusa um arquivo que não é imagem, sem nem tentar ler', async () => {
    const notAnImage = new File(['oi'], 'nota.txt', { type: 'text/plain' });
    await expect(resizeImageToDataUrl(notAnImage)).rejects.toThrow(ImageResizeError);
    await expect(resizeImageToDataUrl(notAnImage)).rejects.toThrow(/imagem/i);
  });

  it('imagem que falha ao carregar (arquivo corrompido): erro legível, não trava', async () => {
    // Nome do arquivo não importa pro fake — o marcador vai no `src`
    // gerado por `createObjectURL`, então mocka-o especificamente aqui.
    (URL.createObjectURL as jest.Mock).mockReturnValue('blob:fake#broken');
    await expect(resizeImageToDataUrl(fakeImageFile())).rejects.toThrow(ImageResizeError);
  });

  it('cabe na melhor qualidade: devolve na primeira tentativa', async () => {
    toDataUrlSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue(`data:image/jpeg;base64,${'A'.repeat(100)}`);

    const result = await resizeImageToDataUrl(fakeImageFile());
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    expect(toDataUrlSpy).toHaveBeenCalledTimes(1);
    expect(toDataUrlSpy).toHaveBeenCalledWith('image/jpeg', 0.85);
  });

  it('grande na melhor qualidade: recomprime em qualidades menores até caber', async () => {
    let call = 0;
    toDataUrlSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockImplementation((..._args: unknown[]) => {
        call += 1;
        // Só a 3ª tentativa (qualidade 0.55) "cabe" — simula um payload
        // grande demais nas duas primeiras.
        const big = call < 3 ? 'A'.repeat(300_000) : 'A'.repeat(100);
        return `data:image/jpeg;base64,${big}`;
      });

    const result = await resizeImageToDataUrl(fakeImageFile());
    expect(toDataUrlSpy).toHaveBeenCalledTimes(3);
    expect(toDataUrlSpy).toHaveBeenNthCalledWith(3, 'image/jpeg', 0.55);
    expect(result).toContain('AAAA');
  });

  it('grande demais em toda qualidade: erro legível em vez de mandar um payload enorme', async () => {
    jest
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue(`data:image/jpeg;base64,${'A'.repeat(300_000)}`);

    await expect(resizeImageToDataUrl(fakeImageFile())).rejects.toThrow(ImageResizeError);
    await expect(resizeImageToDataUrl(fakeImageFile())).rejects.toThrow(/grande demais/i);
  });

  it('sem contexto 2D disponível: erro legível em vez de estourar', async () => {
    getContextSpy.mockReturnValue(null);
    await expect(resizeImageToDataUrl(fakeImageFile())).rejects.toThrow(ImageResizeError);
  });
});
