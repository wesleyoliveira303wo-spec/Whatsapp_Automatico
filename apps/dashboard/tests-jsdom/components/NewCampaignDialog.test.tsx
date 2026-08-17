/**
 * Fase L, Bloco L3 — teste do `NewCampaignDialog`: botão desabilitado sem
 * seleção, formulário → chamada de `createCampaign`, tela de resultado com o
 * resumo ("63 de 100, eis os motivos"), e "Concluir" chamando `onCreated`
 * (limpar a seleção na tela-mãe).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NewCampaignDialog from '../../components/NewCampaignDialog';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  createCampaign: jest.fn(),
}));

function openDialog(contactIds: string[] = ['contact-1', 'contact-2']): void {
  render(
    <NewCampaignDialog sessionName="sessao-principal" contactIds={contactIds} onCreated={jest.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Novo disparo/ }));
}

describe('NewCampaignDialog (Fase L, Bloco L3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('o botão "Novo disparo" fica desabilitado sem nenhum contato selecionado', () => {
    render(<NewCampaignDialog sessionName="sessao-principal" contactIds={[]} onCreated={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Novo disparo/ })).toBeDisabled();
  });

  it('mostra a contagem de selecionados no botão', () => {
    render(
      <NewCampaignDialog
        sessionName="sessao-principal"
        contactIds={['contact-1', 'contact-2', 'contact-3']}
        onCreated={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Novo disparo \(3\)/ })).toBeInTheDocument();
  });

  it('abre o formulário ao clicar, com o botão de confirmar desabilitado até preencher nome e mensagem', () => {
    openDialog();

    const confirmButton = screen.getByRole('button', { name: 'Calcular destinatários' });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Nome da campanha'), {
      target: { value: 'Promoção' },
    });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá!' } });
    expect(confirmButton).toBeEnabled();
  });

  it('cria a campanha e mostra o resumo com pendentes/suprimidos por motivo', async () => {
    (clientApi.createCampaign as jest.Mock).mockResolvedValue({
      campaign: { id: 'campaign-1', name: 'Promoção', status: 'draft' },
      summary: { total: 3, pending: 1, skipped: 2, skipReasons: { opt_out: 1, active_human_conversation: 1 } },
    });
    openDialog(['contact-1', 'contact-2', 'contact-3']);

    fireEvent.change(screen.getByLabelText('Nome da campanha'), {
      target: { value: 'Promoção' },
    });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular destinatários' }));

    await waitFor(() => {
      expect(screen.getByText('Campanha criada')).toBeInTheDocument();
    });
    expect(clientApi.createCampaign).toHaveBeenCalledWith({
      sessionName: 'sessao-principal',
      name: 'Promoção',
      messageTemplate: 'Olá!',
      contactIds: ['contact-1', 'contact-2', 'contact-3'],
    });
    expect(screen.getByText('2 contato(s) suprimido(s)')).toBeInTheDocument();
    expect(
      screen.getByText('Pediram para não receber mais campanhas:', { exact: false }),
    ).toBeInTheDocument();
  });

  it('mostra mensagem de erro quando a API falha, sem fechar o formulário', async () => {
    (clientApi.createCampaign as jest.Mock).mockRejectedValue(
      new clientApi.ClientApiError(403, { error: 'forbidden' }),
    );
    openDialog();

    fireEvent.change(screen.getByLabelText('Nome da campanha'), {
      target: { value: 'Promoção' },
    });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular destinatários' }));

    await waitFor(() => {
      expect(screen.getByText('Seu cargo não permite criar campanhas.')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Nome da campanha')).toBeInTheDocument();
  });

  it('"Concluir" na tela de resultado fecha o modal e chama onCreated (limpa a seleção)', async () => {
    (clientApi.createCampaign as jest.Mock).mockResolvedValue({
      campaign: { id: 'campaign-1', name: 'Promoção', status: 'draft' },
      summary: { total: 1, pending: 1, skipped: 0, skipReasons: {} },
    });
    const onCreated = jest.fn();
    render(
      <NewCampaignDialog sessionName="sessao-principal" contactIds={['contact-1']} onCreated={onCreated} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Novo disparo/ }));
    fireEvent.change(screen.getByLabelText('Nome da campanha'), {
      target: { value: 'Promoção' },
    });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular destinatários' }));

    await waitFor(() => {
      expect(screen.getByText('Campanha criada')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Campanha criada')).not.toBeInTheDocument();
  });

  it('cancelar o formulário fecha o modal sem chamar createCampaign nem onCreated', () => {
    const onCreated = jest.fn();
    render(
      <NewCampaignDialog sessionName="sessao-principal" contactIds={['contact-1']} onCreated={onCreated} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Novo disparo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(clientApi.createCampaign).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Nome da campanha')).not.toBeInTheDocument();
  });
});
