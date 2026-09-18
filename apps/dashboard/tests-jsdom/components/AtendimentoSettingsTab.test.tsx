/**
 * Seção Atendimento de Configurações. B5 (2026-09-18): no plano Disparos (sem
 * IA) o atalho para o Cérebro da IA some — a página de destino não existe
 * nesse plano e devolveria a pessoa para Conversas.
 */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AtendimentoSettingsTab from '../../components/AtendimentoSettingsTab';
import { PlanProvider } from '../../contexts/PlanContext';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../hooks/useSessionsList', () => ({
  useSessionsList: () => ({
    sessions: [{ id: 's1', sessionName: 'vendas' }],
    loading: false,
    errorMessage: null,
  }),
}));

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchTenant: jest.fn(),
}));

const mockFetchTenant = clientApi.fetchTenant as jest.Mock;

beforeEach(() => mockFetchTenant.mockReset());

describe('AtendimentoSettingsTab', () => {
  it('plano com IA: leva ao horário de cada WhatsApp', async () => {
    mockFetchTenant.mockResolvedValue({ tenant: { id: 't1', name: 'Empresa', plan: 'pro' } });
    render(
      <PlanProvider>
        <AtendimentoSettingsTab />
      </PlanProvider>,
    );

    await waitFor(() => expect(mockFetchTenant).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: /vendas/ })).toHaveAttribute(
      'href',
      '/sessions/vendas/ai',
    );
  });

  it('plano Disparos: sem atalho para o Cérebro da IA', async () => {
    mockFetchTenant.mockResolvedValue({ tenant: { id: 't1', name: 'Empresa', plan: 'broadcast' } });
    render(
      <PlanProvider>
        <AtendimentoSettingsTab />
      </PlanProvider>,
    );

    expect(await screen.findByText('Sem horário para configurar no seu plano')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
