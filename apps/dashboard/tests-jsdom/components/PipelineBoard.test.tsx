/**
 * Pipeline de CRM (Milestone 6, Bloco M6H-5) — teste do `PipelineBoard`.
 * `usePipelineConversations` é mockado (mesma estratégia de outros testes
 * deste projeto que isolam o componente do hook de dados, ex.:
 * `ConversationAnalyticsPanel`) — o hook em si não é jsdom-dependente e
 * já seria coberto por teste próprio se precisasse (é um wrapper fino sobre
 * `fetchConversations`, já testado via `clientApi`).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PipelineBoard from '../../components/PipelineBoard';
import * as clientApi from '../../lib/clientApi';
import { toast } from '../../components/ui/use-toast';
import { usePipelineConversations } from '../../hooks/usePipelineConversations';
import type { ConversationSummary } from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchContactAvatar: jest.fn(),
  updateConversationStage: jest.fn(),
  setConversationExcludedFromPipeline: jest.fn(),
}));

jest.mock('../../components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

jest.mock('../../hooks/usePipelineConversations');

function buildConversation(
  id: string,
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id,
    tenantId: 't1',
    sessionName: 'vendas',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: '2026-07-30T09:00:00.000Z',
    excludedFromPipeline: false,
    tags: [],
    createdAt: '2026-07-30T09:00:00.000Z',
    updatedAt: '2026-07-30T09:00:00.000Z',
    ...overrides,
  };
}

const mockedUsePipelineConversations = usePipelineConversations as jest.Mock;

/**
 * Acha o elemento da coluna pelo rótulo do cabeçalho — mais robusto que casar
 * um regex com todos os rótulos de uma vez (ADR #96 acrescentou "Não
 * cliente"). Usa a classe `.pipeline-column` (hook estável, reskin
 * 2026-08-07) em vez de uma classe de largura/estilo — sobrevive a mudanças
 * puramente visuais no componente.
 */
function findColumn(label: string): HTMLElement {
  // Consulta pelo CABEÇALHO (`<h3>`), não por texto solto: desde que
  // `PipelineCard` ganhou o `<select>` "Mover…" (alternativa por teclado ao
  // arrasto, auditoria de acessibilidade 2026-08-22), cada rótulo de coluna
  // também existe como `<option>` dentro de todo card — `getByText('Novo')`
  // passou a encontrar dois elementos e falhava por ambiguidade.
  return screen
    .getByRole('heading', { name: label, level: 3 })
    .closest('.pipeline-column') as HTMLElement;
}

/** Arrasta o único card do board para a coluna de rótulo `label`. */
function dragCardTo(label: string): void {
  const card = screen
    .getByRole('link', { name: 'Ver conversa' })
    .closest('div[draggable]') as HTMLElement;
  const column = findColumn(label);
  fireEvent.dragStart(card, { dataTransfer: { effectAllowed: '' } });
  fireEvent.dragOver(column);
  fireEvent.drop(column);
}

beforeEach(() => {
  (clientApi.fetchContactAvatar as jest.Mock)
    .mockReset()
    .mockResolvedValue({ avatarUrl: undefined });
  (clientApi.updateConversationStage as jest.Mock).mockReset();
  (clientApi.setConversationExcludedFromPipeline as jest.Mock).mockReset();
  (toast as jest.Mock).mockClear();
  mockedUsePipelineConversations.mockReset();
});

describe('PipelineBoard (pipeline de CRM, Milestone 6, Bloco M6H-5)', () => {
  it('mostra skeletons enquanto carrega', () => {
    mockedUsePipelineConversations.mockReturnValue({
      conversations: [],
      loading: true,
      errorMessage: null,
      refresh: jest.fn(),
      applyLocalUpdate: jest.fn(),
    });
    const { container } = render(<PipelineBoard sessionName="vendas" />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('mostra ErrorState com retry quando falha', () => {
    const refresh = jest.fn();
    mockedUsePipelineConversations.mockReturnValue({
      conversations: [],
      loading: false,
      errorMessage: 'Falha ao carregar as conversas desta sessão. Tente novamente.',
      refresh,
      applyLocalUpdate: jest.fn(),
    });
    render(<PipelineBoard sessionName="vendas" />);
    expect(
      screen.getByText('Falha ao carregar as conversas desta sessão. Tente novamente.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(refresh).toHaveBeenCalled();
  });

  it('mostra EmptyState quando não há conversas', () => {
    mockedUsePipelineConversations.mockReturnValue({
      conversations: [],
      loading: false,
      errorMessage: null,
      refresh: jest.fn(),
      applyLocalUpdate: jest.fn(),
    });
    render(<PipelineBoard sessionName="vendas" />);
    expect(screen.getByText('Nenhuma conversa nesta sessão ainda')).toBeInTheDocument();
  });

  /**
   * Teto de carga do board (auditoria 2026-08-22) — o hook para de paginar ao
   * atingir `MAX_PIPELINE_PAGES` e sinaliza `truncated`. Esconder isso seria a
   * mesma perda silenciosa de dado encontrada na lista de destinatários de
   * campanha; o board precisa dizer que está mostrando um recorte.
   */
  it('avisa quando a sessão tem mais conversas do que cabe no board', () => {
    mockedUsePipelineConversations.mockReturnValue({
      conversations: [buildConversation('a', { stage: 'new' })],
      loading: false,
      errorMessage: null,
      truncated: true,
      refresh: jest.fn(),
      applyLocalUpdate: jest.fn(),
    });
    render(<PipelineBoard sessionName="vendas" />);
    expect(screen.getByRole('status')).toHaveTextContent(/conversas mais recentes desta sessão/i);
  });

  it('não mostra o aviso de recorte quando a sessão inteira coube no board', () => {
    mockedUsePipelineConversations.mockReturnValue({
      conversations: [buildConversation('a', { stage: 'new' })],
      loading: false,
      errorMessage: null,
      truncated: false,
      refresh: jest.fn(),
      applyLocalUpdate: jest.fn(),
    });
    render(<PipelineBoard sessionName="vendas" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renderiza as 6 colunas (5 estágios do funil + Não cliente) com as conversas agrupadas', () => {
    mockedUsePipelineConversations.mockReturnValue({
      conversations: [
        buildConversation('a', { stage: 'new' }),
        buildConversation('b', { stage: 'negotiating' }),
      ],
      loading: false,
      errorMessage: null,
      refresh: jest.fn(),
      applyLocalUpdate: jest.fn(),
    });
    render(<PipelineBoard sessionName="vendas" />);
    // Pelo cabeçalho da coluna, não por texto solto — mesma desambiguação do
    // helper `findColumn` acima (os rótulos também existem como `<option>`
    // dentro do `<select>` "Mover…" de cada card).
    for (const label of ['Novo', 'Contatado', 'Negociando', 'Fechado', 'Perdido', 'Não cliente']) {
      expect(screen.getByRole('heading', { name: label, level: 3 })).toBeInTheDocument();
    }
  });

  it('ao soltar um card numa coluna nova, chama updateConversationStage e aplica localmente', async () => {
    const applyLocalUpdate = jest.fn();
    const conversation = buildConversation('a', { stage: 'new' });
    mockedUsePipelineConversations.mockReturnValue({
      conversations: [conversation],
      loading: false,
      errorMessage: null,
      refresh: jest.fn(),
      applyLocalUpdate,
    });
    const updated = { ...conversation, stage: 'contacted', stageSetBy: 'human' };
    (clientApi.updateConversationStage as jest.Mock).mockResolvedValue(updated);

    render(<PipelineBoard sessionName="vendas" />);
    dragCardTo('Contatado');

    await waitFor(() => {
      expect(clientApi.updateConversationStage).toHaveBeenCalledWith('a', 'contacted');
      expect(applyLocalUpdate).toHaveBeenCalledWith(updated);
    });
    // Conversa que já estava no funil: nada de mexer na flag de "Não cliente".
    expect(clientApi.setConversationExcludedFromPipeline).not.toHaveBeenCalled();
  });

  it('mostra toast destrutivo e recarrega quando a chamada de mudança de estágio falha', async () => {
    const refresh = jest.fn();
    const applyLocalUpdate = jest.fn();
    const conversation = buildConversation('a', { stage: 'new' });
    mockedUsePipelineConversations.mockReturnValue({
      conversations: [conversation],
      loading: false,
      errorMessage: null,
      refresh,
      applyLocalUpdate,
    });
    (clientApi.updateConversationStage as jest.Mock).mockRejectedValue(new Error('falhou'));

    render(<PipelineBoard sessionName="vendas" />);
    dragCardTo('Negociando');

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
      expect(refresh).toHaveBeenCalled();
    });
  });

  describe('coluna "Não cliente" (ADR #96)', () => {
    it('entrar em Não cliente só liga a flag — nunca toca o stage', async () => {
      const applyLocalUpdate = jest.fn();
      const conversation = buildConversation('a', { stage: 'negotiating' });
      mockedUsePipelineConversations.mockReturnValue({
        conversations: [conversation],
        loading: false,
        errorMessage: null,
        refresh: jest.fn(),
        applyLocalUpdate,
      });
      const updated = { ...conversation, excludedFromPipeline: true };
      (clientApi.setConversationExcludedFromPipeline as jest.Mock).mockResolvedValue(updated);

      render(<PipelineBoard sessionName="vendas" />);
      dragCardTo('Não cliente');

      await waitFor(() => {
        expect(clientApi.setConversationExcludedFromPipeline).toHaveBeenCalledWith('a', true);
        expect(applyLocalUpdate).toHaveBeenCalledWith(updated);
      });
      expect(clientApi.updateConversationStage).not.toHaveBeenCalled();
    });

    it('sair de Não cliente desliga a flag E grava o estágio de destino, nessa ordem', async () => {
      const conversation = buildConversation('a', {
        stage: 'negotiating',
        excludedFromPipeline: true,
      });
      mockedUsePipelineConversations.mockReturnValue({
        conversations: [conversation],
        loading: false,
        errorMessage: null,
        refresh: jest.fn(),
        applyLocalUpdate: jest.fn(),
      });
      const calls: string[] = [];
      (clientApi.setConversationExcludedFromPipeline as jest.Mock).mockImplementation(async () => {
        calls.push('flag');
        return { ...conversation, excludedFromPipeline: false };
      });
      (clientApi.updateConversationStage as jest.Mock).mockImplementation(async () => {
        calls.push('stage');
        return { ...conversation, excludedFromPipeline: false, stage: 'new' };
      });

      render(<PipelineBoard sessionName="vendas" />);
      dragCardTo('Novo');

      await waitFor(() => {
        expect(clientApi.setConversationExcludedFromPipeline).toHaveBeenCalledWith('a', false);
        expect(clientApi.updateConversationStage).toHaveBeenCalledWith('a', 'new');
      });
      expect(calls).toEqual(['flag', 'stage']);
    });

    it('soltar na coluna em que o card já está é no-op (nenhuma gravação)', async () => {
      mockedUsePipelineConversations.mockReturnValue({
        conversations: [
          buildConversation('a', { stage: 'negotiating', excludedFromPipeline: true }),
        ],
        loading: false,
        errorMessage: null,
        refresh: jest.fn(),
        applyLocalUpdate: jest.fn(),
      });

      render(<PipelineBoard sessionName="vendas" />);
      dragCardTo('Não cliente');

      await waitFor(() => {
        expect(clientApi.setConversationExcludedFromPipeline).not.toHaveBeenCalled();
      });
      expect(clientApi.updateConversationStage).not.toHaveBeenCalled();
    });

    it('agrupa o card marcado na coluna Não cliente, não no stage que ele carrega por baixo', () => {
      mockedUsePipelineConversations.mockReturnValue({
        conversations: [
          buildConversation('a', { stage: 'negotiating', excludedFromPipeline: true }),
        ],
        loading: false,
        errorMessage: null,
        refresh: jest.fn(),
        applyLocalUpdate: jest.fn(),
      });

      render(<PipelineBoard sessionName="vendas" />);

      expect(findColumn('Não cliente').textContent).toContain('IA desligada');
      expect(findColumn('Negociando').textContent).toContain('Nenhum card aqui');
    });

    it('falha ao entrar em Não cliente mostra toast destrutivo e recarrega', async () => {
      const refresh = jest.fn();
      mockedUsePipelineConversations.mockReturnValue({
        conversations: [buildConversation('a', { stage: 'new' })],
        loading: false,
        errorMessage: null,
        refresh,
        applyLocalUpdate: jest.fn(),
      });
      (clientApi.setConversationExcludedFromPipeline as jest.Mock).mockRejectedValue(
        new Error('falhou'),
      );

      render(<PipelineBoard sessionName="vendas" />);
      dragCardTo('Não cliente');

      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
        expect(refresh).toHaveBeenCalled();
      });
    });
  });

  describe('alternativa por teclado ao arrastar-e-soltar (achado de auditoria de acessibilidade, 2026-08-22)', () => {
    it('mover pelo select do card aciona a MESMA gravação que o drag-and-drop', async () => {
      const applyLocalUpdate = jest.fn();
      const conversation = buildConversation('a', { stage: 'new' });
      mockedUsePipelineConversations.mockReturnValue({
        conversations: [conversation],
        loading: false,
        errorMessage: null,
        refresh: jest.fn(),
        applyLocalUpdate,
      });
      const updated = { ...conversation, stage: 'contacted', stageSetBy: 'human' };
      (clientApi.updateConversationStage as jest.Mock).mockResolvedValue(updated);

      render(<PipelineBoard sessionName="vendas" />);
      const select = screen.getByRole('combobox', {
        name: 'Mover conversa para outro estágio do Pipeline',
      });
      fireEvent.change(select, { target: { value: 'contacted' } });

      await waitFor(() => {
        expect(clientApi.updateConversationStage).toHaveBeenCalledWith('a', 'contacted');
        expect(applyLocalUpdate).toHaveBeenCalledWith(updated);
      });
      expect(clientApi.setConversationExcludedFromPipeline).not.toHaveBeenCalled();
    });
  });
});
