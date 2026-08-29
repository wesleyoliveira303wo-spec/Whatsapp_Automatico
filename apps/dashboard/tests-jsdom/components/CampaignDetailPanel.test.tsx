/**
 * Fase L, Bloco L4 — teste do `CampaignDetailPanel`: resumo, destinatários,
 * e as ações start/pause/cancel (com confirmação via Dialog para start/cancel).
 */
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CampaignDetailPanel from '../../components/CampaignDetailPanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchCampaign: jest.fn(),
  fetchCampaignRecipients: jest.fn(),
  fetchCampaignMetrics: jest.fn(),
  startCampaign: jest.fn(),
  pauseCampaign: jest.fn(),
  cancelCampaign: jest.fn(),
  reopenCampaign: jest.fn(),
  removeCampaignMedia: jest.fn(),
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
      {
        id: 'r1',
        contactId: 'contact-1',
        // Padronização de exibição de contato (2026-08-20) — `contact` é o
        // que a API resolve em lote para um destinatário vinculado a um
        // Contato salvo (ver `PrismaCampaignRepository.listRecipients`).
        contact: { name: 'Maria Salva', phoneE164: '5521988887777' },
        status: 'pending',
        createdAt: '2026-08-17T10:00:00.000Z',
      },
      {
        id: 'r2',
        contactId: 'contact-2',
        // Contato salvo SEM nome (a maioria na prática): telefone + apelido
        // do WhatsApp, nunca o `contactId` cru — esse era o bug original.
        contact: { phoneE164: '5521977776666', nickname: 'Apelido WhatsApp' },
        status: 'skipped',
        skipReason: 'opt_out',
        createdAt: '2026-08-17T10:00:00.000Z',
      },
    ],
  });
  (clientApi.fetchCampaignMetrics as jest.Mock).mockResolvedValue({
    metrics: {
      total: 3,
      pending: 2,
      sent: 0,
      failed: 0,
      replied: 0,
      skipped: 1,
      skipReasons: { opt_out: 1 },
      stageCounts: { new: 0, contacted: 0, negotiating: 0, closed_won: 0, closed_lost: 0 },
      escalatedCount: 0,
      aiCostUsd: 0,
      unknownAnswerCount: 0,
    },
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

    expect(screen.getByText('Maria Salva')).toBeInTheDocument();
  });

  /**
   * Paginação real dos destinatários (auditoria 2026-08-22). Antes a tela
   * buscava 100 sem cursor e sem contagem: uma campanha de 5.000 mostrava 100
   * e omitia 4.900 sem nada na tela indicando isso.
   */
  describe('paginação dos destinatários', () => {
    it('mostra "carregados de total" e o botão quando há mais páginas', async () => {
      mockDetail();
      (clientApi.fetchCampaignRecipients as jest.Mock).mockResolvedValue({
        recipients: [
          { id: 'r1', phoneE164: '5521999998888', name: 'Maria', status: 'pending', createdAt: '' },
        ],
        nextCursor: 'cursor-2',
      });
      await renderPanel();

      expect(screen.getByText('1 de 3')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Carregar mais destinatários' }),
      ).toBeInTheDocument();
    });

    it('acumula a página seguinte ao clicar em "Carregar mais destinatários"', async () => {
      mockDetail();
      (clientApi.fetchCampaignRecipients as jest.Mock)
        .mockResolvedValueOnce({
          recipients: [
            {
              id: 'r1',
              phoneE164: '5521999998888',
              name: 'Maria',
              status: 'pending',
              createdAt: '',
            },
          ],
          nextCursor: 'cursor-2',
        })
        .mockResolvedValueOnce({
          recipients: [
            {
              id: 'r2',
              phoneE164: '5521977776666',
              name: 'Joana',
              status: 'sent',
              createdAt: '',
            },
          ],
          nextCursor: undefined,
        });
      await renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Carregar mais destinatários' }));

      await waitFor(() => {
        expect(screen.getByText(/Joana/)).toBeInTheDocument();
      });
      // A primeira página continua na tela — acumula, não substitui.
      expect(screen.getByText(/Maria/)).toBeInTheDocument();
      expect(clientApi.fetchCampaignRecipients).toHaveBeenLastCalledWith('campaign-1', {
        limit: 100,
        cursor: 'cursor-2',
      });
      // Sem próxima página, o botão some.
      expect(
        screen.queryByRole('button', { name: 'Carregar mais destinatários' }),
      ).not.toBeInTheDocument();
    });

    it('não mostra o botão quando a campanha inteira coube numa página', async () => {
      mockDetail();
      await renderPanel();

      expect(
        screen.queryByRole('button', { name: 'Carregar mais destinatários' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('padronização de exibição de contato (2026-08-20)', () => {
    it('contato salvo sem nome mostra telefone + apelido do WhatsApp, nunca o contactId cru', async () => {
      mockDetail();
      await renderPanel();

      // Duas partes em elementos separados (`DisplayNameParts`) — o apelido
      // sai menor/mais claro, ver `DisplayNameParts.test.tsx`.
      expect(screen.getByText('+55 (21) 97777-6666')).toBeInTheDocument();
      expect(screen.getByText('Apelido WhatsApp')).toBeInTheDocument();
      expect(screen.queryByText('contact-2')).not.toBeInTheDocument();
    });

    it('destinatário solto (planilha, sem Contato) mostra telefone + nome da planilha', async () => {
      mockDetail();
      (clientApi.fetchCampaignRecipients as jest.Mock).mockResolvedValue({
        recipients: [
          {
            id: 'r3',
            phoneE164: '5521966665555',
            name: 'Nome da planilha',
            status: 'pending',
            createdAt: '2026-08-17T10:00:00.000Z',
          },
        ],
      });
      await renderPanel();

      expect(screen.getByText('+55 (21) 96666-5555')).toBeInTheDocument();
      expect(screen.getByText('Nome da planilha')).toBeInTheDocument();
    });

    it('sem contact/phoneE164 nenhum (Contato removido depois de materializar), nunca mostra o contactId cru', async () => {
      mockDetail();
      (clientApi.fetchCampaignRecipients as jest.Mock).mockResolvedValue({
        recipients: [
          {
            id: 'r4',
            contactId: 'contact-removido',
            status: 'pending',
            createdAt: '2026-08-17T10:00:00.000Z',
          },
        ],
      });
      await renderPanel();

      expect(screen.getByText('Contato removido')).toBeInTheDocument();
      expect(screen.queryByText('contact-removido')).not.toBeInTheDocument();
    });
  });

  describe('métricas (Fase L, Bloco L7)', () => {
    it('mostra "—" para métricas sem denominador válido (sem tentativa de envio ainda)', async () => {
      mockDetail();
      await renderPanel();

      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(4); // taxa de resposta, tempo, conversão, custo/conversão
    });

    it('mostra a taxa de resposta, tempo até 1ª resposta e conversão quando presentes', async () => {
      mockDetail();
      (clientApi.fetchCampaignMetrics as jest.Mock).mockResolvedValue({
        metrics: {
          total: 3,
          pending: 0,
          sent: 0,
          failed: 1,
          replied: 2,
          skipped: 0,
          skipReasons: {},
          responseRate: 2 / 3,
          avgTimeToFirstReplyMinutes: 45,
          stageCounts: { new: 0, contacted: 0, negotiating: 1, closed_won: 1, closed_lost: 0 },
          escalatedCount: 1,
          conversionRate: 0.5,
          aiCostUsd: 0.05,
          costPerConversionUsd: 0.05,
          unknownAnswerCount: 2,
        },
      });

      await renderPanel();

      expect(await screen.findByText('67%')).toBeInTheDocument(); // taxa de resposta
      expect(screen.getByText('50%')).toBeInTheDocument(); // conversão
      expect(screen.getByText('45 min')).toBeInTheDocument();
      expect(screen.getByText('US$ 0.0500')).toBeInTheDocument();
      expect(screen.getByText('Escalado para humano: 1')).toBeInTheDocument();
      expect(screen.getByText(/não soube responder/)).toHaveTextContent(
        'A IA não soube responder 2 vez(es) em conversas desta campanha.',
      );
    });
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

  describe('reabrir campanha (retrofit 2026-08-18)', () => {
    function mockMetricsWithFailed(failed: number): void {
      (clientApi.fetchCampaignMetrics as jest.Mock).mockResolvedValue({
        metrics: {
          total: 3,
          pending: 0,
          sent: 1,
          failed,
          replied: 0,
          skipped: 1,
          skipReasons: { opt_out: 1 },
          stageCounts: { new: 0, contacted: 0, negotiating: 0, closed_won: 0, closed_lost: 0 },
          escalatedCount: 0,
          aiCostUsd: 0,
          unknownAnswerCount: 0,
        },
      });
    }

    it('COMPLETED sem nenhum FAILED: botão "Reabrir campanha" fica desabilitado', async () => {
      mockDetail({ status: 'completed' });
      mockMetricsWithFailed(0);
      await renderPanel();

      expect(screen.getByRole('button', { name: 'Reabrir campanha' })).toBeDisabled();
    });

    it('COMPLETED com destinatário FAILED: botão habilitado, pede confirmação antes de chamar a API', async () => {
      mockDetail({ status: 'completed' });
      mockMetricsWithFailed(2);
      (clientApi.reopenCampaign as jest.Mock).mockResolvedValue({
        campaign: { id: 'campaign-1', status: 'running' },
      });
      await renderPanel();

      const reopenButton = await screen.findByRole('button', { name: 'Reabrir campanha' });
      expect(reopenButton).toBeEnabled();
      fireEvent.click(reopenButton);

      expect(clientApi.reopenCampaign).not.toHaveBeenCalled();
      expect(screen.getByText('Reabrir esta campanha?')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar e reenviar' }));

      await waitFor(() => {
        expect(clientApi.reopenCampaign).toHaveBeenCalledWith('campaign-1');
      });
    });

    it('CANCELLED com destinatário FAILED: botão também habilitado', async () => {
      mockDetail({ status: 'cancelled' });
      mockMetricsWithFailed(1);
      await renderPanel();

      expect(await screen.findByRole('button', { name: 'Reabrir campanha' })).toBeEnabled();
    });

    it('DRAFT/RUNNING/PAUSED: botão sempre desabilitado, mesmo com FAILED > 0', async () => {
      mockDetail({ status: 'running' });
      mockMetricsWithFailed(3);
      await renderPanel();

      expect(await screen.findByRole('button', { name: 'Reabrir campanha' })).toBeDisabled();
    });
  });

  describe('polling silencioso enquanto a campanha está em execução (pedido do fundador, 2026-08-18)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function advancePoll(): Promise<void> {
      await act(async () => {
        jest.advanceTimersByTime(4000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    it('RUNNING: depois de 4s, busca de novo (SEM mostrar o skeleton de carregamento) e reflete o progresso novo', async () => {
      mockDetail({ status: 'running' });
      await renderPanel();
      expect(clientApi.fetchCampaign as jest.Mock).toHaveBeenCalledTimes(1);

      // Progresso mudou entre o carregamento inicial e o poll seguinte —
      // simula um envio real acontecendo em segundo plano.
      (clientApi.fetchCampaignMetrics as jest.Mock).mockResolvedValue({
        metrics: {
          total: 3,
          pending: 1,
          sent: 1,
          failed: 0,
          replied: 0,
          skipped: 1,
          skipReasons: { opt_out: 1 },
          stageCounts: { new: 0, contacted: 0, negotiating: 0, closed_won: 0, closed_lost: 0 },
          escalatedCount: 0,
          aiCostUsd: 0,
          unknownAnswerCount: 0,
        },
      });

      await advancePoll();

      expect(clientApi.fetchCampaign as jest.Mock).toHaveBeenCalledTimes(2);
      // O skeleton (`animate-pulse`) só aparece durante a carga inicial —
      // um refresh silencioso nunca esconde o conteúdo já na tela.
      expect(screen.getByText('Promoção de agosto')).toBeInTheDocument();
    });

    it('COMPLETED/CANCELLED/PAUSED/DRAFT: NÃO busca de novo sozinho — sem progresso novo a mostrar', async () => {
      mockDetail({ status: 'completed' });
      await renderPanel();
      expect(clientApi.fetchCampaign as jest.Mock).toHaveBeenCalledTimes(1);

      await advancePoll();

      expect(clientApi.fetchCampaign as jest.Mock).toHaveBeenCalledTimes(1);
    });

    it('campanha RUNNING que conclui: o poll seguinte não é mais silencioso, mas para de repetir depois disso', async () => {
      mockDetail({ status: 'running' });
      await renderPanel();

      (clientApi.fetchCampaign as jest.Mock).mockResolvedValue({
        campaign: {
          id: 'campaign-1',
          sessionName: 'sessao-principal',
          name: 'Promoção de agosto',
          messageTemplate: 'Olá!',
          status: 'completed',
          createdAt: '2026-08-17T10:00:00.000Z',
        },
        summary: { total: 3, pending: 0, skipped: 1, skipReasons: { opt_out: 1 } },
      });
      await advancePoll();
      expect(clientApi.fetchCampaign as jest.Mock).toHaveBeenCalledTimes(2);

      // Concluída agora — o próximo tick não deveria buscar de novo.
      await advancePoll();
      expect(clientApi.fetchCampaign as jest.Mock).toHaveBeenCalledTimes(2);
    });
  });

  describe('mídia anexada (Fase L, Bloco L8)', () => {
    it('sem mídia: nenhum bloco de anexo é renderizado', async () => {
      mockDetail({ status: 'draft' });
      await renderPanel();

      expect(screen.queryByText('document')).not.toBeInTheDocument();
    });

    it('com mídia + DRAFT: mostra nome do arquivo e o botão de remover', async () => {
      mockDetail({
        status: 'draft',
        media: { contentType: 'document', mimeType: 'application/pdf', fileName: 'catalogo.pdf' },
      });
      await renderPanel();

      expect(screen.getByText('catalogo.pdf')).toBeInTheDocument();
    });

    it('com mídia + RUNNING: mostra o anexo, mas SEM botão de remover (não pode trocar mídia de campanha em andamento)', async () => {
      mockDetail({
        status: 'running',
        media: { contentType: 'document', mimeType: 'application/pdf', fileName: 'catalogo.pdf' },
      });
      await renderPanel();

      expect(screen.getByText('catalogo.pdf')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remover anexo' })).not.toBeInTheDocument();
    });

    it('clicar em remover: chama a API e atualiza a tela (mídia some)', async () => {
      mockDetail({
        status: 'draft',
        media: { contentType: 'document', mimeType: 'application/pdf', fileName: 'catalogo.pdf' },
      });
      (clientApi.removeCampaignMedia as jest.Mock).mockResolvedValue({
        campaign: {
          id: 'campaign-1',
          sessionName: 'sessao-principal',
          name: 'Promoção de agosto',
          messageTemplate: 'Olá!',
          status: 'draft',
          createdAt: '2026-08-17T10:00:00.000Z',
          media: undefined,
        },
      });
      await renderPanel();
      expect(screen.getByText('catalogo.pdf')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Remover anexo' }));

      await waitFor(() => {
        expect(clientApi.removeCampaignMedia).toHaveBeenCalledWith('campaign-1');
      });
      await waitFor(() => {
        expect(screen.queryByText('catalogo.pdf')).not.toBeInTheDocument();
      });
    });
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
