/**
 * `useEventSource` compartilha a conexão por URL (2026-09-17): cabeçalho, rail
 * e painel de conexão abriam cada um o seu `EventSource` para a mesma sessão,
 * e cada conexão faz o BFF consultar a API a cada 2s.
 */
import { act, renderHook } from '@testing-library/react';
import { useEventSource } from '../../hooks/useEventSource';

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  onopen: (() => void) | null = null;

  onmessage: ((event: MessageEvent) => void) | null = null;

  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(): void {}

  close(): void {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  (global as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
});

describe('useEventSource', () => {
  it('dois componentes na mesma URL abrem UMA conexão e recebem o mesmo dado', () => {
    const header = renderHook(() => useEventSource<{ ok: boolean }>('/api/sessions/vendas/stream'));
    const rail = renderHook(() => useEventSource<{ ok: boolean }>('/api/sessions/vendas/stream'));

    expect(FakeEventSource.instances).toHaveLength(1);

    act(() => {
      FakeEventSource.instances[0].onopen?.();
      FakeEventSource.instances[0].onmessage?.({ data: '{"ok":true}' } as MessageEvent);
    });

    expect(header.result.current).toMatchObject({ data: { ok: true }, connected: true });
    expect(rail.result.current).toMatchObject({ data: { ok: true }, connected: true });

    header.unmount();
    rail.unmount();
  });

  it('a conexão só fecha quando o último componente sai', () => {
    const header = renderHook(() => useEventSource('/api/sessions/vendas/stream'));
    const rail = renderHook(() => useEventSource('/api/sessions/vendas/stream'));
    const [source] = FakeEventSource.instances;

    header.unmount();
    expect(source.closed).toBe(false);

    rail.unmount();
    expect(source.closed).toBe(true);
  });

  it('um componente que chega depois já recebe o último dado, sem abrir outra conexão', () => {
    const header = renderHook(() => useEventSource<{ n: number }>('/api/sessions/vendas/stream'));
    act(() => {
      FakeEventSource.instances[0].onmessage?.({ data: '{"n":7}' } as MessageEvent);
    });

    const late = renderHook(() => useEventSource<{ n: number }>('/api/sessions/vendas/stream'));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(late.result.current.data).toEqual({ n: 7 });

    header.unmount();
    late.unmount();
  });

  it('url nula não abre conexão', () => {
    const { result } = renderHook(() => useEventSource(null));

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current).toEqual({ data: null, errorMessage: null, connected: false });
  });
});
