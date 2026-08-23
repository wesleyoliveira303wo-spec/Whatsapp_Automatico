/**
 * Painel central da inbox de Conversas sem seleção — Onda 1 do redesign
 * (2026-08-22). Substitui o antigo `EmptyState` genérico ("Selecione uma
 * conversa") pela fila do dia (aguardando atendente + não lidas), derivada
 * do array já carregado — ver docstring do componente.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationQueuePanel from '../../components/ConversationQueuePanel';
import * as clientApi from '../../lib/clientApi';
import type { ConversationSummary } from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchContactAvatar: jest.fn(),
}));

beforeEach(() => {
  (clientApi.fetchContactAvatar as jest.Mock).mockReset().mockResolvedValue({
    avatarUrl: undefined,
  });
});

function buildConversation(
  id: string,
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id,
    tenantId: 't1',
    sessionName: 'vendas',
    contactJid: `${id}@s.whatsapp.net`,
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: '2026-08-20T09:00:00.000Z',
    excludedFromPipeline: false,
    tags: [],
    createdAt: '2026-08-20T09:00:00.000Z',
    updatedAt: '2026-08-20T09:00:00.000Z',
    ...overrides,
  };
}

describe('ConversationQueuePanel', () => {
  it('mostra "Tudo em dia" quando não há nenhuma conversa aguardando ou não lida', () => {
    render(
      <ConversationQueuePanel
        sessionName="vendas"
        conversations={[buildConversation('a')]}
      />,
    );

    expect(screen.getByText('Tudo em dia')).toBeInTheDocument();
    expect(screen.queryByText('Fila do dia')).not.toBeInTheDocument();
  });

  it('lista conversas aguardando atendente e com não lidas, cada uma num link para a conversa', () => {
    const waiting = buildConversation('waiting-1', {
      escalatedAt: '2026-08-20T10:00:00.000Z',
      contactName: 'Maria',
    });
    const unread = buildConversation('unread-1', {
      unreadCount: 4,
      contactName: 'João',
    });
    render(
      <ConversationQueuePanel sessionName="vendas" conversations={[waiting, unread]} />,
    );

    expect(screen.getByText('Fila do dia')).toBeInTheDocument();
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getByText('João')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();

    const waitingLink = screen.getByText('Maria').closest('a');
    expect(waitingLink).toHaveAttribute(
      'href',
      '/sessions/vendas/conversations/waiting-1',
    );
  });

  it('mostra mensagem de vazio POR SEÇÃO quando só uma das duas filas tem item', () => {
    const waiting = buildConversation('waiting-1', {
      escalatedAt: '2026-08-20T10:00:00.000Z',
    });
    render(
      <ConversationQueuePanel sessionName="vendas" conversations={[waiting]} />,
    );

    expect(screen.getByText('Nenhuma conversa com mensagem não lida.')).toBeInTheDocument();
  });

  it('respeita o teto de itens por seção, sem quebrar quando a fila é maior', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      buildConversation(`w${i}`, { escalatedAt: `2026-08-20T10:0${i}:00.000Z` }),
    );
    const { container } = render(
      <ConversationQueuePanel sessionName="vendas" conversations={many} />,
    );

    expect(container.querySelectorAll('a[href*="/conversations/"]').length).toBeLessThanOrEqual(6);
  });
});
