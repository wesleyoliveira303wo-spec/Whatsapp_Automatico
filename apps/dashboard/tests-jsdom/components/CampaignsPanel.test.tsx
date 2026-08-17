/**
 * Fase L, Bloco L4 — teste do `CampaignsPanel`: lista campanhas da sessão,
 * estado vazio, erro com retry.
 */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CampaignsPanel from '../../components/CampaignsPanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchCampaigns: jest.fn(),
}));

describe('CampaignsPanel (Fase L, Bloco L4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista só as campanhas DESTA sessão', async () => {
    (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({
      campaigns: [
        {
          id: 'campaign-1',
          sessionName: 'sessao-principal',
          name: 'Promoção A',
          status: 'running',
          createdAt: '2026-08-17T10:00:00.000Z',
        },
        {
          id: 'campaign-2',
          sessionName: 'outra-sessao',
          name: 'Promoção B',
          status: 'draft',
          createdAt: '2026-08-17T10:00:00.000Z',
        },
      ],
    });

    render(<CampaignsPanel sessionName="sessao-principal" />);

    await waitFor(() => {
      expect(screen.getByText('Promoção A')).toBeInTheDocument();
    });
    expect(screen.queryByText('Promoção B')).not.toBeInTheDocument();
  });

  it('estado vazio quando não há campanhas', async () => {
    (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({ campaigns: [] });

    render(<CampaignsPanel sessionName="sessao-principal" />);

    await waitFor(() => {
      expect(screen.getByText('Nenhuma campanha ainda')).toBeInTheDocument();
    });
  });

  it('erro ao carregar: mostra estado de erro com retry', async () => {
    (clientApi.fetchCampaigns as jest.Mock).mockRejectedValue(new Error('falhou'));

    render(<CampaignsPanel sessionName="sessao-principal" />);

    await waitFor(() => {
      expect(screen.getByText('Não foi possível carregar as campanhas.')).toBeInTheDocument();
    });
  });

  it('link de cada campanha aponta para o detalhe dentro da sessão', async () => {
    (clientApi.fetchCampaigns as jest.Mock).mockResolvedValue({
      campaigns: [
        {
          id: 'campaign-1',
          sessionName: 'sessao-principal',
          name: 'Promoção A',
          status: 'draft',
          createdAt: '2026-08-17T10:00:00.000Z',
        },
      ],
    });

    render(<CampaignsPanel sessionName="sessao-principal" />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Promoção A/ })).toHaveAttribute(
        'href',
        '/sessions/sessao-principal/campaigns/campaign-1',
      );
    });
  });
});
