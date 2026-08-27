/**
 * Cérebro da IA v3, Fase 2 (2026-08-25) — teste do `AiFaqPanel`: painel de
 * gestão da FAQ estruturada de uma sessão (lista + buscar/filtrar por
 * categoria + criar + editar inline + toggle ativo/inativo + remover).
 * Mesma casca de `QuickRepliesPanel`.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiFaqPanel from '../../components/AiFaqPanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchAiFaqEntries: jest.fn(),
  createAiFaqEntry: jest.fn(),
  updateAiFaqEntry: jest.fn(),
  deleteAiFaqEntry: jest.fn(),
}));

function faqEntry(over: Partial<clientApi.AiFaqEntry> = {}): clientApi.AiFaqEntry {
  return {
    id: 'faq-1',
    tenantId: 'tenant-1',
    sessionName: 'vendas',
    question: 'Qual o preço?',
    answer: 'R$ 990',
    category: 'Preços',
    active: true,
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    ...over,
  };
}

describe('AiFaqPanel (Cérebro da IA v3, Fase 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carrega e lista as FAQs ao montar', async () => {
    (clientApi.fetchAiFaqEntries as jest.Mock).mockResolvedValue({ faqEntries: [faqEntry()] });

    render(<AiFaqPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByText('Qual o preço?')).toBeInTheDocument();
    });
    expect(screen.getByText('R$ 990')).toBeInTheDocument();
    expect(clientApi.fetchAiFaqEntries).toHaveBeenCalledWith('vendas');
  });

  it('mostra estado vazio quando não há nenhuma FAQ', async () => {
    (clientApi.fetchAiFaqEntries as jest.Mock).mockResolvedValue({ faqEntries: [] });

    render(<AiFaqPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByText('Nenhuma pergunta cadastrada ainda')).toBeInTheDocument();
    });
  });

  it('cria uma nova FAQ ao submeter o formulário', async () => {
    (clientApi.fetchAiFaqEntries as jest.Mock).mockResolvedValue({ faqEntries: [] });
    (clientApi.createAiFaqEntry as jest.Mock).mockResolvedValue({
      faqEntry: faqEntry({ question: 'Vocês entregam?', answer: 'Sim', category: null }),
    });

    render(<AiFaqPanel sessionName="vendas" />);
    await waitFor(() => expect(clientApi.fetchAiFaqEntries).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Pergunta'), {
      target: { value: 'Vocês entregam?' },
    });
    fireEvent.change(screen.getByLabelText('Resposta'), { target: { value: 'Sim' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar pergunta' }));

    await waitFor(() => {
      expect(clientApi.createAiFaqEntry).toHaveBeenCalledWith(
        'vendas',
        'Vocês entregam?',
        'Sim',
        null,
      );
    });
    expect(await screen.findByText('Vocês entregam?')).toBeInTheDocument();
  });

  it('BUGFIX 2026-08-27: cria a FAQ normalmente mesmo renderizado DENTRO de outro <form> (AiProfilePanel) — nunca usa <form>/onSubmit próprio, só onClick', async () => {
    (clientApi.fetchAiFaqEntries as jest.Mock).mockResolvedValue({ faqEntries: [] });
    (clientApi.createAiFaqEntry as jest.Mock).mockResolvedValue({
      faqEntry: faqEntry({ question: 'Vocês entregam?', answer: 'Sim', category: null }),
    });
    // Reproduz exatamente a estrutura real: AiProfilePanel envolve a aba
    // FAQ num <form> próprio. Um <form> aninhado aqui dentro seria HTML
    // inválido e o clique em "Adicionar pergunta" acabava disparando uma
    // navegação de página inteira em vez do submit — mesmo bug real já
    // corrigido na aba Preferências (`AiPreferencesPanel`).
    render(
      <form>
        <AiFaqPanel sessionName="vendas" />
      </form>,
    );
    await waitFor(() => expect(clientApi.fetchAiFaqEntries).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Pergunta'), {
      target: { value: 'Vocês entregam?' },
    });
    fireEvent.change(screen.getByLabelText('Resposta'), { target: { value: 'Sim' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar pergunta' }));

    await waitFor(() => {
      expect(clientApi.createAiFaqEntry).toHaveBeenCalledWith(
        'vendas',
        'Vocês entregam?',
        'Sim',
        null,
      );
    });
    expect(await screen.findByText('Vocês entregam?')).toBeInTheDocument();
  });

  it('edita uma FAQ existente (inline) e salva', async () => {
    (clientApi.fetchAiFaqEntries as jest.Mock).mockResolvedValue({ faqEntries: [faqEntry()] });
    (clientApi.updateAiFaqEntry as jest.Mock).mockResolvedValue({
      faqEntry: faqEntry({ question: 'Pergunta nova' }),
    });

    render(<AiFaqPanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Qual o preço?')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const questionInput = screen.getByDisplayValue('Qual o preço?');
    fireEvent.change(questionInput, { target: { value: 'Pergunta nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(clientApi.updateAiFaqEntry).toHaveBeenCalledWith('vendas', 'faq-1', {
        question: 'Pergunta nova',
        answer: 'R$ 990',
        category: 'Preços',
      });
    });
    expect(await screen.findByText('Pergunta nova')).toBeInTheDocument();
  });

  it('cancelar a edição não chama updateAiFaqEntry e mantém a pergunta original', async () => {
    (clientApi.fetchAiFaqEntries as jest.Mock).mockResolvedValue({ faqEntries: [faqEntry()] });

    render(<AiFaqPanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Qual o preço?')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(clientApi.updateAiFaqEntry).not.toHaveBeenCalled();
    expect(screen.getByText('Qual o preço?')).toBeInTheDocument();
  });

  it('desativa uma FAQ pelo toggle (sem apagar)', async () => {
    (clientApi.fetchAiFaqEntries as jest.Mock).mockResolvedValue({ faqEntries: [faqEntry()] });
    (clientApi.updateAiFaqEntry as jest.Mock).mockResolvedValue({
      faqEntry: faqEntry({ active: false }),
    });

    render(<AiFaqPanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Qual o preço?')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('switch', { name: 'Desativar pergunta' }));

    await waitFor(() => {
      expect(clientApi.updateAiFaqEntry).toHaveBeenCalledWith('vendas', 'faq-1', { active: false });
    });
    expect(await screen.findByText('Inativa')).toBeInTheDocument();
  });

  it('remove uma FAQ ao clicar em Excluir', async () => {
    (clientApi.fetchAiFaqEntries as jest.Mock).mockResolvedValue({ faqEntries: [faqEntry()] });
    (clientApi.deleteAiFaqEntry as jest.Mock).mockResolvedValue(undefined);

    render(<AiFaqPanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Qual o preço?')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => {
      expect(clientApi.deleteAiFaqEntry).toHaveBeenCalledWith('vendas', 'faq-1');
    });
    await waitFor(() => {
      expect(screen.queryByText('Qual o preço?')).not.toBeInTheDocument();
    });
  });

  it('busca filtra por pergunta/resposta', async () => {
    (clientApi.fetchAiFaqEntries as jest.Mock).mockResolvedValue({
      faqEntries: [
        faqEntry(),
        faqEntry({ id: 'faq-2', question: 'Vocês entregam?', answer: 'Sim' }),
      ],
    });

    render(<AiFaqPanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Qual o preço?')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Buscar pergunta ou resposta'), {
      target: { value: 'entregam' },
    });

    expect(screen.queryByText('Qual o preço?')).not.toBeInTheDocument();
    expect(screen.getByText('Vocês entregam?')).toBeInTheDocument();
  });

  it('filtro por categoria mostra só as FAQs daquela categoria', async () => {
    (clientApi.fetchAiFaqEntries as jest.Mock).mockResolvedValue({
      faqEntries: [
        faqEntry({ category: 'Preços' }),
        faqEntry({ id: 'faq-2', question: 'Entrega?', category: 'Entrega' }),
      ],
    });

    render(<AiFaqPanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('Qual o preço?')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Entrega' }));

    expect(screen.queryByText('Qual o preço?')).not.toBeInTheDocument();
    expect(screen.getByText('Entrega?')).toBeInTheDocument();
  });

  it('erro de carregamento inicial vira ErrorState com retry, nunca a mensagem de lista vazia', async () => {
    (clientApi.fetchAiFaqEntries as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    render(<AiFaqPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByText('Falha ao carregar as perguntas frequentes.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Nenhuma pergunta cadastrada ainda')).not.toBeInTheDocument();

    (clientApi.fetchAiFaqEntries as jest.Mock).mockResolvedValueOnce({
      faqEntries: [faqEntry()],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Qual o preço?')).toBeInTheDocument();
  });

  it('mostra mensagem de erro amigável em caso de 403 ao criar', async () => {
    const { ClientApiError } = jest.requireActual('../../lib/clientApi');
    (clientApi.fetchAiFaqEntries as jest.Mock).mockResolvedValue({ faqEntries: [] });
    (clientApi.createAiFaqEntry as jest.Mock).mockRejectedValue(
      new ClientApiError(403, { error: 'forbidden' }),
    );

    render(<AiFaqPanel sessionName="vendas" />);
    await waitFor(() => expect(clientApi.fetchAiFaqEntries).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Pergunta'), { target: { value: 'P?' } });
    fireEvent.change(screen.getByLabelText('Resposta'), { target: { value: 'R.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar pergunta' }));

    await waitFor(() => {
      expect(screen.getByText('Seu cargo não permite gerenciar a FAQ da IA.')).toBeInTheDocument();
    });
  });
});
