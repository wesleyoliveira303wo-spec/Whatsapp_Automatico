/**
 * T4 (Lançamento suave — Trava de plano): prova o contrato do `PlanGate` e da
 * versão tolerante `useIsFreePlan` — o bloco "Disponível no Plano Pro"
 * substitui o conteúdo real só para tenant `free`; `pro`/`enterprise` (e sem
 * provider) veem o conteúdo real.
 */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PlanProvider, useIsFreePlan } from '../../contexts/PlanContext';
import PlanGate from '../../components/PlanGate';
import * as clientApi from '../../lib/clientApi';

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

    await waitFor(() => expect(screen.getByText(/é um recurso do Plano Pro/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /falar com o comercial/i })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/5521982925941'),
    );
    expect(screen.queryByText('CONTEUDO REAL')).not.toBeInTheDocument();
  });

  it.each(['pro', 'enterprise'] as const)('tenant %s: mostra o conteúdo real', async (plan) => {
    mockFetchTenant.mockResolvedValue({ tenant: { id: 't1', name: 'Empresa', plan } });

    render(
      <PlanProvider>
        <PlanGate feature="O Pipeline">
          <Real />
        </PlanGate>
      </PlanProvider>,
    );

    await waitFor(() => expect(screen.getByText('CONTEUDO REAL')).toBeInTheDocument());
    expect(screen.queryByText(/é um recurso do Plano Pro/i)).not.toBeInTheDocument();
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
