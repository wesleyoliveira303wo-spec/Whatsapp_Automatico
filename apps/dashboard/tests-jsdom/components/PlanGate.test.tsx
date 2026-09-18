/**
 * T4 (Lançamento suave — Trava de plano): prova o contrato do `PlanGate` e da
 * versão tolerante `useIsFreePlan` — o bloco de upgrade substitui o conteúdo
 * real só para tenant `free`; os planos pagos (e sem provider) veem o conteúdo
 * real.
 *
 * B5 (2026-09-18): tela de IA (`requires="ai"`) no plano Disparos não existe —
 * nada é renderizado e a pessoa é levada de volta (decisão do fundador: o que o
 * plano não tem some, em vez de aparecer bloqueado).
 */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PlanProvider, useHidesAi, useIsFreePlan } from '../../contexts/PlanContext';
import PlanGate from '../../components/PlanGate';
import * as clientApi from '../../lib/clientApi';

const mockReplace = jest.fn();

jest.mock('next/router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchTenant: jest.fn(),
}));

const mockFetchTenant = clientApi.fetchTenant as jest.Mock;

function Real(): JSX.Element {
  return <div>CONTEUDO REAL</div>;
}

beforeEach(() => {
  mockFetchTenant.mockReset();
  mockReplace.mockReset();
});

describe('PlanGate', () => {
  it('tenant free: mostra o bloco de upgrade e NÃO o conteúdo real', async () => {
    mockFetchTenant.mockResolvedValue({ tenant: { id: 't1', name: 'Empresa', plan: 'free' } });

    render(
      <PlanProvider>
        <PlanGate feature="O Pipeline">
          <Real />
        </PlanGate>
      </PlanProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('O Pipeline: a partir do plano Disparos')).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /falar com o comercial/i })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/5521982925941'),
    );
    expect(screen.queryByText('CONTEUDO REAL')).not.toBeInTheDocument();
  });

  it.each(['broadcast', 'pro', 'enterprise'] as const)('tenant %s: mostra o conteúdo real', async (plan) => {
    mockFetchTenant.mockResolvedValue({ tenant: { id: 't1', name: 'Empresa', plan } });

    render(
      <PlanProvider>
        <PlanGate feature="O Pipeline">
          <Real />
        </PlanGate>
      </PlanProvider>,
    );

    await waitFor(() => expect(screen.getByText('CONTEUDO REAL')).toBeInTheDocument());
    expect(screen.queryByText(/a partir do plano Disparos/i)).not.toBeInTheDocument();
  });

  it('tela de IA no Grátis: vitrine que fala do Pro e do Enterprise', async () => {
    mockFetchTenant.mockResolvedValue({ tenant: { id: 't1', name: 'Empresa', plan: 'free' } });

    render(
      <PlanProvider>
        <PlanGate feature="O Cérebro da IA" requires="ai" unavailableRedirectTo="/volta">
          <Real />
        </PlanGate>
      </PlanProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('O Cérebro da IA: nos planos Pro e Enterprise')).toBeInTheDocument(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('tela de IA no Disparos: não mostra nada e leva a pessoa de volta', async () => {
    mockFetchTenant.mockResolvedValue({ tenant: { id: 't1', name: 'Empresa', plan: 'broadcast' } });

    render(
      <PlanProvider>
        <PlanGate feature="O Cérebro da IA" requires="ai" unavailableRedirectTo="/volta">
          <Real />
        </PlanGate>
      </PlanProvider>,
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/volta'));
    expect(screen.queryByText('CONTEUDO REAL')).not.toBeInTheDocument();
    expect(screen.queryByText(/nos planos Pro e Enterprise/)).not.toBeInTheDocument();
  });

  it('tela de IA no Pro: mostra o conteúdo real, sem redirecionar', async () => {
    mockFetchTenant.mockResolvedValue({ tenant: { id: 't1', name: 'Empresa', plan: 'pro' } });

    render(
      <PlanProvider>
        <PlanGate feature="O Cérebro da IA" requires="ai" unavailableRedirectTo="/volta">
          <Real />
        </PlanGate>
      </PlanProvider>,
    );

    await waitFor(() => expect(screen.getByText('CONTEUDO REAL')).toBeInTheDocument());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('leitura de plano falha: NÃO bloqueia (mostra o conteúdo real)', async () => {
    mockFetchTenant.mockRejectedValue(new Error('offline'));

    render(
      <PlanProvider>
        <PlanGate feature="O Pipeline">
          <Real />
        </PlanGate>
      </PlanProvider>,
    );

    await waitFor(() => expect(screen.getByText('CONTEUDO REAL')).toBeInTheDocument());
  });
});

describe('useIsFreePlan (versão tolerante)', () => {
  function FreeProbe(): JSX.Element {
    return <span>{useIsFreePlan() ? 'GRATIS' : 'PAGO/DESCONHECIDO'}</span>;
  }

  it('sem PlanProvider no ancestral: devolve false (não esconde nada)', () => {
    render(<FreeProbe />);
    expect(screen.getByText('PAGO/DESCONHECIDO')).toBeInTheDocument();
  });

  it('dentro de PlanProvider com tenant free: devolve true', async () => {
    mockFetchTenant.mockResolvedValue({ tenant: { id: 't1', name: 'Empresa', plan: 'free' } });
    render(
      <PlanProvider>
        <FreeProbe />
      </PlanProvider>,
    );
    await waitFor(() => expect(screen.getByText('GRATIS')).toBeInTheDocument());
  });
});

describe('useHidesAi (versão tolerante)', () => {
  function Probe(): JSX.Element {
    return <span>{useHidesAi() ? 'ESCONDE' : 'MOSTRA'}</span>;
  }

  it('sem PlanProvider no ancestral: nunca esconde', () => {
    render(<Probe />);
    expect(screen.getByText('MOSTRA')).toBeInTheDocument();
  });

  it.each([
    ['broadcast', 'ESCONDE'],
    ['free', 'MOSTRA'],
    ['pro', 'MOSTRA'],
  ] as const)('plano %s: %s', async (plan, expected) => {
    mockFetchTenant.mockResolvedValue({ tenant: { id: 't1', name: 'Empresa', plan } });
    render(
      <PlanProvider>
        <Probe />
      </PlanProvider>,
    );
    await waitFor(() => expect(screen.getByText(expected)).toBeInTheDocument());
  });
});
