/**
 * Redesign 2026-08-05 (R3) — teste do `ConversationContextPanel` (3ª coluna
 * nova da tela de Conversas). Mocka `useConversationDetail`/
 * `useAiInteractions` diretamente (mesmo padrão de `SessionSidebar.test.tsx`
 * ao mockar `useSessionDetail`) — o componente busca os próprios dados, sem
 * depender de props de um pai.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationContextPanel from '../../components/ConversationContextPanel';
import * as useConversationDetailModule from '../../hooks/useConversationDetail';
import * as useAiInteractionsModule from '../../hooks/useAiInteractions';
import type { ConversationSummary } from '../../lib/clientApi';

jest.mock('../../hooks/useConversationDetail');
jest.mock('../../hooks/useAiInteractions');
jest.mock('../../hooks/useContactAvatar', () => ({
  useContactAvatar: () => undefined,
}));
// Redesign 2026-08-05 (R4) — `ConversationTagPicker` (dentro do painel) usa
// `useTags` para o catálogo da sessão; mockado aqui pelo mesmo motivo de
// `useContactAvatar` acima — sem isso, o hook real dispararia `fetch()`.
jest.mock('../../hooks/useTags', () => ({
  useTags: () => ({
    tags: [],
    loading: false,
    errorMessage: null,
    refresh: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  }),
}));

const mockUseConversationDetail = useConversationDetailModule.useConversationDetail as jest.Mock;
const mockUseAiInteractions = useAiInteractionsModule.useAiInteractions as jest.Mock;

function buildConversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'c1',
    tenantId: 't1',
    sessionName: 'vendas',
    contactJid: '5511981224471@s.whatsapp.net',
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: '2026-08-05T00:00:00.000Z',
    excludedFromPipeline: false,
    tags: [],
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('ConversationContextPanel (Redesign 2026-08-05, R3)', () => {
  beforeEach(() => {
    mockUseAiInteractions.mockReturnValue({
      interactions: [],
      errorMessage: null,
      refresh: jest.fn(),
    });
  });

  it('mostra skeleton enquanto carrega', () => {
    mockUseConversationDetail.mockReturnValue({
      conversation: null,
      loading: true,
      errorMessage: null,
      refresh: jest.fn(),
      applyUpdate: jest.fn(),
    });
    const { container } = render(
      <ConversationContextPanel sessionName="vendas" conversationId="c1" />,
    );
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('sem contato salvo, mostra telefone + apelido no cabeçalho (em partes) e o telefone de novo na linha auxiliar', () => {
    mockUseConversationDetail.mockReturnValue({
      conversation: buildConversation({ contactName: 'Maria Costa' }),
      loading: false,
      errorMessage: null,
      refresh: jest.fn(),
      applyUpdate: jest.fn(),
    });
    render(<ConversationContextPanel sessionName="vendas" conversationId="c1" />);
    // O telefone aparece duas vezes (cabeçalho + linha auxiliar do "Salvar
    // contato") — `DisplayNameParts` bota cada parte num `<span>` próprio.
    expect(screen.getAllByText('+55 (11) 98122-4471')).toHaveLength(2);
    expect(screen.getByText('Maria Costa')).toBeInTheDocument();
    expect(screen.getByText(/Cliente há/)).toBeInTheDocument();
  });

  it('mostra só o savedContactName no cabeçalho quando o contato está salvo (regra 2026-08-20)', () => {
    mockUseConversationDetail.mockReturnValue({
      conversation: buildConversation({
        contactName: 'Apelido WhatsApp',
        savedContactName: 'Maria Salva',
      }),
      loading: false,
      errorMessage: null,
      refresh: jest.fn(),
      applyUpdate: jest.fn(),
    });
    render(<ConversationContextPanel sessionName="vendas" conversationId="c1" />);
    expect(screen.getByText('Maria Salva')).toBeInTheDocument();
    expect(screen.queryByText(/Apelido WhatsApp/)).not.toBeInTheDocument();
  });

  /**
   * BUGFIX (achado real do fundador, 2026-08-27): sem contato salvo, o
   * "nome" exibido no cabeçalho vira o TELEFONE (mais longo que um nome
   * salvo curto) e podia quebrar para 2 linhas — o painel inteiro (largura
   * fixa) ficava mais ALTO só por causa disso, um contato salvo e um não
   * salvo produzindo cabeçalhos de tamanhos visivelmente diferentes.
   * `truncate` (1 linha sempre, com reticências) fecha essa variação.
   */
  it('o nome do cabeçalho sempre trunca em 1 linha, salvo ou não (a altura do painel não pode variar)', () => {
    mockUseConversationDetail.mockReturnValue({
      conversation: buildConversation({ contactName: 'Maria Costa' }),
      loading: false,
      errorMessage: null,
      refresh: jest.fn(),
      applyUpdate: jest.fn(),
    });
    const { rerender, container } = render(
      <ConversationContextPanel sessionName="vendas" conversationId="c1" />,
    );
    const unsavedName = container.querySelector('p.truncate.text-\\[15\\.5px\\]');
    expect(unsavedName).toHaveClass('truncate');
    expect(unsavedName).toHaveClass('w-full');

    mockUseConversationDetail.mockReturnValue({
      conversation: buildConversation({ savedContactName: 'Maria Salva' }),
      loading: false,
      errorMessage: null,
      refresh: jest.fn(),
      applyUpdate: jest.fn(),
    });
    rerender(<ConversationContextPanel sessionName="vendas" conversationId="c1" />);
    const savedName = container.querySelector('p.truncate.text-\\[15\\.5px\\]');
    expect(savedName).toHaveClass('truncate');
    expect(savedName).toHaveClass('w-full');
  });

  it('mostra o chip "Aguardando atendente" quando escalatedAt está presente', () => {
    mockUseConversationDetail.mockReturnValue({
      conversation: buildConversation({ escalatedAt: '2026-08-05T10:00:00.000Z' }),
      loading: false,
      errorMessage: null,
      refresh: jest.fn(),
      applyUpdate: jest.fn(),
    });
    render(<ConversationContextPanel sessionName="vendas" conversationId="c1" />);
    expect(screen.getByText('Aguardando atendente')).toBeInTheDocument();
  });

  it('mostra o estágio quando diferente de "new"', () => {
    mockUseConversationDetail.mockReturnValue({
      conversation: buildConversation({ stage: 'negotiating' }),
      loading: false,
      errorMessage: null,
      refresh: jest.fn(),
      applyUpdate: jest.fn(),
    });
    render(<ConversationContextPanel sessionName="vendas" conversationId="c1" />);
    expect(screen.getByText('Negociando')).toBeInTheDocument();
  });

  it('mostra "Últimas interações" com a lista vinda de useAiInteractions', () => {
    mockUseConversationDetail.mockReturnValue({
      conversation: buildConversation(),
      loading: false,
      errorMessage: null,
      refresh: jest.fn(),
      applyUpdate: jest.fn(),
    });
    mockUseAiInteractions.mockReturnValue({
      interactions: [
        {
          id: 'i1',
          tenantId: 't1',
          conversationId: 'c1',
          provider: 'gemini',
          model: 'gemini-3.5-flash',
          promptVersion: 'v1',
          tokensInput: 10,
          tokensOutput: 20,
          costUsd: '0.0001',
          latencyMs: 500,
          status: 'success',
          createdAt: '2026-08-05T10:00:00.000Z',
        },
      ],
      errorMessage: null,
      refresh: jest.fn(),
    });
    render(<ConversationContextPanel sessionName="vendas" conversationId="c1" />);
    expect(screen.getByText('Últimas interações')).toBeInTheDocument();
    expect(screen.getByText(/gemini-3.5-flash/)).toBeInTheDocument();
  });
});
