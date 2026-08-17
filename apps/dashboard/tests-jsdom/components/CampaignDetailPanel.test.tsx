/**
 * Fase L, Bloco L4 — teste do `CampaignDetailPanel`: resumo, destinatários,
 * e as ações start/pause/cancel (com confirmação via Dialog para start/cancel).
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CampaignDetailPanel from '../../components/CampaignDetailPanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchCampaign: jest.fn(),
  fetchCampaignRecipients: jest.fn(),
  startCampaign: jest.fn(),
  pauseCampaign: jest.fn(),
  cancelCampaign: jest.fn(),
}));

function mockDetail(overrides: Partial<clientApi.Campaign> = {}): void {
  (clientApi.fetchCampaign as jest.Mock).mockResolvedValue({
    campaign: {
      id: 'campaign-1',
      sessionName: 'sessao-principal',
      name: 'Promoção de agosto',
      messageTemplate: 'Olá!',
      status: 'draft',
      createdAt: '2026-08-17T10:00:00.000Z',
      ...overrides,
    },
    summary: { total: 3, pending: 2, skipped: 1, skipReasons: { opt_out: 1 } },
  });
  (clientApi.fetchCampaignRecipients as jest.Mock).mockResolvedValue({
    recipients: [
      { id: 'r1', contactId: 'contact-1', status: 'pending', createdAt: '2026-08-17T10:00:00.000Z' },
      {
        id: 'r2',
        contactId: 'contact-2',
        status: 'skipped',
        skipReason: 'opt_out',
        createdAt: '2026-08-17T10:00:00.000Z',
      },
    ],
  });
}

async function renderPanel(): Promise<void> {
  render(<CampaignDetailPanel sessionName="sessao-principal" campaignId="campaign-1" />);
  await waitFor(() => {
    expect(screen.getByText('Promoção de agosto')).toBeInTheDocument();
  });
}

describe('CampaignDetailPanel (Fase L, Bloco L4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mostra o resumo (total/pendentes/suprimidos) e os motivos de supressão', async () => {
    mockDetail();
    await renderPanel();

    expect(screen.getByText('Pediram para não receber mais campanhas:')).toBeInTheDocument();
  });

  it('lista os destinatários com status', async () => {
    mockDetail();
    await renderPanel();

    expect(screen.getByText('contact-1')).toBeInTheDocument();
    expect(screen.getByText('contact-2')).toBeInTheDocument();
  });

  it('DRAFT: botão "Iniciar envio" habilitado, "Pausar" desabilitado', async () => {
    mockDetail({ status: 'draft' });
    await renderPanel();

    expect(screen.getByRole('button', { name: /Iniciar envio/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeDisabled();
  });

  it('iniciar: pede confirmação antes de chamar a API', async () => {
    mockDetail({ status: 'draft' });
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Iniciar envio/ }));
    expect(clientApi.startCampaign).not.toHaveBeenCalled();
    expect(screen.getByText('Confirmar disparo real')).toBeInTheDocument();

    (clientApi.startCampaign as jest.Mock).mockResolvedValue({
      campaign: { id: 'campaign-1', status: 'running' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e enviar' }));

    await waitFor(() => {
      expect(clientApi.startCampaign).toHaveBeenCalledWith('campaign-1');
    });
  });

  it('cancelar dentro do modal de confirmação NÃO chama a API', async () => {
    mockDetail({ status: 'draft' });
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Iniciar envio/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(clientApi.startCampaign).not.toHaveBeenCalled();
    expect(screen.queryByText('Confirmar disparo real')).not.toBeInTheDocument();
  });

  it('RUNNING: "Pausar" habilitado, chama a API direto (sem confirmação)', async () => {
    mockDetail({ status: 'running' });
    (clientApi.pauseCampaign as jest.Mock).mockResolvedValue({
      campaign: { id: 'campaign-1', status: 'paused' },
    });
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));

    await waitFor(() => {
      expect(clientApi.pauseCampaign).toHaveBeenCalledWith('campaign-1');
    });
  });

  it('cancelar campanha: pede confirmação antes de chamar a API', async () => {
    mockDetail({ status: 'running' });
    (clientApi.cancelCampaign as jest.Mock).mockResolvedValue({
      campaign: { id: 'campaign-1', status: 'cancelled' },
    });
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar campanha' }));
    expect(clientApi.cancelCampaign).not.toHaveBeenCalled();
    expect(screen.getByText('Cancelar esta campanha?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() => {
      expect(clientApi.cancelCampaign).toHaveBeenCalledWith('campaign-1');
    });
  });

  it('COMPLETED: nenhuma ação fica habilitada', async () => {
    mockDetail({ status: 'completed' });
    await renderPanel();

    expect(screen.getByRole('button', { name: /Iniciar envio/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar campanha' })).toBeDisabled();
  });

  it('erro ao carregar: mostra estado de erro', async () => {
    (clientApi.fetchCampaign as jest.Mock).mockRejectedValue(new Error('falhou'));
    (clientApi.fetchCampaignRecipients as jest.Mock).mockResolvedValue({ recipients: [] });

    render(<CampaignDetailPanel sessionName="sessao-principal" campaignId="campaign-1" />);

    await waitFor(() => {
      expect(screen.getByText('Não foi possível carregar esta campanha.')).toBeInTheDocument();
    });
  });
});
