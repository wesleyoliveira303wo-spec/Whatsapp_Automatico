/**
 * Retrofit visual 2026-08-18 — botão "Salvar contato" do painel de contexto
 * da conversa: abrir/fechar, nome pré-preenchido, salvar com sucesso,
 * falhas (422 sem telefone real, erro genérico), e ausência do botão numa
 * conversa `@lid` sem `contactId`.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SaveContactButton from '../../components/SaveContactButton';
import * as clientApi from '../../lib/clientApi';
import { toast } from '../../components/ui/use-toast';
import type { ConversationSummary } from '../../lib/clientApi';

function buildConversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'c1',
    tenantId: 't1',
    sessionName: 'vendas',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: '2026-08-18T09:00:00.000Z',
    excludedFromPipeline: false,
    tags: [],
    aiSummaryMessageCount: 0,
    createdAt: '2026-08-18T09:00:00.000Z',
    updatedAt: '2026-08-18T09:00:00.000Z',
    ...overrides,
  };
}

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  saveConversationContact: jest.fn(),
}));

jest.mock('../../components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

/** Abre o modal clicando no botão-ícone (trigger); o confirmar é um botão separado ("Salvar"). */
function openDialog(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));
}

function confirm(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
}

describe('SaveContactButton (retrofit visual 2026-08-18)', () => {
  const onUpdated = jest.fn();

  beforeEach(() => {
    onUpdated.mockClear();
    (toast as jest.Mock).mockClear();
    (clientApi.saveConversationContact as jest.Mock).mockReset();
  });

  it('não mostra o modal antes de clicar no botão', () => {
    render(<SaveContactButton conversation={buildConversation()} onUpdated={onUpdated} />);
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  });

  it('abre o modal ao clicar no botão, com o campo Nome pré-preenchido pelo contactName', () => {
    render(
      <SaveContactButton
        conversation={buildConversation({ contactName: 'Maria Costa' })}
        onUpdated={onUpdated}
      />,
    );
    openDialog();
    expect(screen.getByLabelText('Nome')).toHaveValue('Maria Costa');
  });

  it('salva com sucesso: chama a API com o nome digitado, onUpdated e toast de sucesso', async () => {
    const updated = buildConversation({ contactId: 'contact-1', contactName: 'Maria Costa' });
    (clientApi.saveConversationContact as jest.Mock).mockResolvedValue(updated);

    render(<SaveContactButton conversation={buildConversation()} onUpdated={onUpdated} />);
    openDialog();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Maria Costa' } });
    confirm();

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
    expect(clientApi.saveConversationContact).toHaveBeenCalledWith('c1', 'Maria Costa');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  });

  it('salva sem nome (campo vazio) com undefined, não string vazia', async () => {
    (clientApi.saveConversationContact as jest.Mock).mockResolvedValue(buildConversation());

    render(<SaveContactButton conversation={buildConversation()} onUpdated={onUpdated} />);
    openDialog();
    confirm();

    await waitFor(() =>
      expect(clientApi.saveConversationContact).toHaveBeenCalledWith('c1', undefined),
    );
  });

  it('cancelar fecha o modal sem chamar a API', () => {
    render(<SaveContactButton conversation={buildConversation()} onUpdated={onUpdated} />);
    openDialog();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Rascunho' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(clientApi.saveConversationContact).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  });

  it('em falha 422 (conversa @lid sem telefone), mostra toast de erro específico', async () => {
    (clientApi.saveConversationContact as jest.Mock).mockRejectedValue(
      new clientApi.ClientApiError(422, { error: 'conversation_contact_unavailable' }),
    );

    render(<SaveContactButton conversation={buildConversation()} onUpdated={onUpdated} />);
    openDialog();
    confirm();

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: expect.stringMatching(/número privado/i),
      }),
    );
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('em falha genérica, mostra toast de erro genérico', async () => {
    (clientApi.saveConversationContact as jest.Mock).mockRejectedValue(new Error('rede fora'));

    render(<SaveContactButton conversation={buildConversation()} onUpdated={onUpdated} />);
    openDialog();
    confirm();

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: expect.stringMatching(/não foi possível salvar/i),
      }),
    );
  });

  it('desabilita os botões e mostra "Salvando…" enquanto a chamada está pendente', async () => {
    let resolvePromise: (value: ConversationSummary) => void = () => {};
    (clientApi.saveConversationContact as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    render(<SaveContactButton conversation={buildConversation()} onUpdated={onUpdated} />);
    openDialog();
    confirm();

    expect(await screen.findByRole('button', { name: /Salvando/i })).toBeDisabled();

    resolvePromise(buildConversation());
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it('conversa @lid SEM contactId: o botão não é renderizado (sem telefone a derivar)', () => {
    render(
      <SaveContactButton
        conversation={buildConversation({
          contactId: undefined,
          contactJid: '225236742053984@lid',
        })}
        onUpdated={onUpdated}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Salvar contato' })).not.toBeInTheDocument();
  });

  it('conversa @lid COM contactId já vinculado: o botão aparece (permite renomear)', () => {
    render(
      <SaveContactButton
        conversation={buildConversation({
          contactId: 'contact-1',
          contactJid: '225236742053984@lid',
        })}
        onUpdated={onUpdated}
      />,
    );
    expect(screen.getByRole('button', { name: 'Salvar contato' })).toBeInTheDocument();
  });
});
