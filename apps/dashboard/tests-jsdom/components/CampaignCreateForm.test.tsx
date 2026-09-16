/**
 * Task 8 (edição de campanhas, 2026-09-15) — `CampaignCreateForm` em modo
 * edição: nasce preenchido e chama `updateCampaign` com o payload esperado.
 */
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CampaignCreateForm from '../../components/CampaignCreateForm';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchContacts: jest.fn(),
  createCampaign: jest.fn(),
  updateCampaign: jest.fn(),
  attachCampaignMedia: jest.fn(),
}));

const EDITING = {
  campaign: {
    id: 'campaign-1',
    tenantId: 'tenant-1',
    sessionName: 'sessao',
    name: 'Campanha existente',
    messageTemplate: 'Texto já cadastrado',
    status: 'draft' as const,
    intervalSeconds: 75,
    dailyLimit: 30,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  recipients: [
    {
      id: 'recipient-1',
      tenantId: 'tenant-1',
      campaignId: 'campaign-1',
      contactId: 'contact-1',
      contact: { name: 'Maria Salva', phoneE164: '5521988887777' },
      status: 'pending' as const,
      createdAt: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'recipient-2',
      tenantId: 'tenant-1',
      campaignId: 'campaign-1',
      phoneE164: '5521977776666',
      name: 'Solto',
      status: 'pending' as const,
      createdAt: '2026-09-01T00:00:00.000Z',
    },
  ],
};

beforeEach(() => {
  jest.resetAllMocks();
  (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });
});

describe('CampaignCreateForm — modo edição (2026-09-15)', () => {
  it('nasce preenchido com nome e texto da campanha já existente', () => {
    render(<CampaignCreateForm sessionName="sessao" editing={EDITING as never} />);

    expect(screen.getByDisplayValue('Campanha existente')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Texto já cadastrado')).toBeInTheDocument();
  });

  it('salvar chama updateCampaign com o payload esperado (contato salvo + destinatário solto preservados)', async () => {
    (clientApi.updateCampaign as jest.Mock).mockResolvedValue({
      campaign: EDITING.campaign,
      summary: { total: 2, pending: 2, skipped: 0, skipReasons: {} },
    });

    render(<CampaignCreateForm sessionName="sessao" editing={EDITING as never} />);

    const saveButton = await screen.findByRole('button', { name: 'Salvar alterações' });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => expect(clientApi.updateCampaign).toHaveBeenCalledTimes(1));
    const [campaignId, payload] = (clientApi.updateCampaign as jest.Mock).mock.calls[0];
    expect(campaignId).toBe('campaign-1');
    expect(payload.name).toBe('Campanha existente');
    expect(payload.messageTemplate).toBe('Texto já cadastrado');
    expect(payload.contactIds).toEqual(['contact-1']);
    expect(payload.phoneRecipients).toEqual([{ rawPhone: '5521977776666', name: 'Solto' }]);

    expect(clientApi.createCampaign).not.toHaveBeenCalled();
    expect(await screen.findByText('Alterações salvas')).toBeInTheDocument();
  });
});
