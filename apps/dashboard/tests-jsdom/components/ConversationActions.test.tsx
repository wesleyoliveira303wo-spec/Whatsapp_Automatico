/**
 * Milestone 6, Bloco M6E-3 — teste do `ConversationActions` (retrofit
 * M6E-2): feedback migrado de banner inline para `Toast`.
 *
 * ADR #94 (2026-08-01): ganhou o botão de marcar/desmarcar a conversa como
 * fora do funil comercial. ADR #96 (mesmo dia): esse botão foi REMOVIDO — a
 * marcação passou a ser feita arrastando o card para a coluna "Não cliente"
 * do board do Pipeline; aqui sobrou só um indicador de leitura. Ver o
 * describe dedicado no fim do arquivo.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationActions from '../../components/ConversationActions';
import * as clientApi from '../../lib/clientApi';
import { toast } from '../../components/ui/use-toast';
import type { ConversationSummary } from '../../lib/clientApi';

function buildConversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'c1',
    tenantId: 't1',
    sessionName: 'vendas',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'human',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: '2026-07-24T09:00:00.000Z',
    excludedFromPipeline: false,
    tags: [],
    createdAt: '2026-07-24T09:00:00.000Z',
    updatedAt: '2026-07-24T09:05:00.000Z',
    ...overrides,
  };
}

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  escalateConversation: jest.fn(),
  resumeConversation: jest.fn(),
}));

jest.mock('../../components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

describe('ConversationActions (Milestone 6, Bloco M6E-2)', () => {
  const onUpdated = jest.fn();

  beforeEach(() => {
    onUpdated.mockClear();
    (toast as jest.Mock).mockClear();
    (clientApi.escalateConversation as jest.Mock).mockReset();
    (clientApi.resumeConversation as jest.Mock).mockReset();
  });

  it('assume a conversa: chama onUpdated e mostra toast de sucesso', async () => {
    const updated = buildConversation({ status: 'human' });
    (clientApi.escalateConversation as jest.Mock).mockResolvedValue(updated);

    render(
      <ConversationActions
        conversationId="c1"
        status="bot"
        excludedFromPipeline={false}
        onUpdated={onUpdated}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Assumir conversa' }));

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledWith(updated);
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
    });
  });

  it('devolve ao bot: chama onUpdated e mostra toast de sucesso', async () => {
    const updated = buildConversation({ status: 'bot' });
    (clientApi.resumeConversation as jest.Mock).mockResolvedValue(updated);

    render(
      <ConversationActions
        conversationId="c1"
        status="human"
        excludedFromPipeline={false}
        onUpdated={onUpdated}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Devolver ao bot' }));

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledWith(updated);
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
    });
  });

  it('mostra toast de erro (destructive) quando a ação falha', async () => {
    (clientApi.resumeConversation as jest.Mock).mockRejectedValue(new Error('falhou'));

    render(
      <ConversationActions
        conversationId="c1"
        status="human"
        excludedFromPipeline={false}
        onUpdated={onUpdated}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Devolver ao bot' }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

describe('ConversationActions — "Não cliente" virou só leitura (ADR #96, revisão da ADR #94)', () => {
  const onUpdated = jest.fn();

  beforeEach(() => {
    onUpdated.mockClear();
    (toast as jest.Mock).mockClear();
  });

  it('NÃO oferece mais botão de marcar/desmarcar — a marcação passou para o board do Pipeline', () => {
    render(
      <ConversationActions
        conversationId="c1"
        status="bot"
        excludedFromPipeline={false}
        onUpdated={onUpdated}
      />,
    );

    expect(screen.queryByRole('button', { name: /Não é cliente/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Devolver ao funil comercial/ }),
    ).not.toBeInTheDocument();
  });

  it('nem mesmo quando a conversa já está marcada (nenhum caminho de escrita aqui)', () => {
    render(
      <ConversationActions
        conversationId="c1"
        status="bot"
        excludedFromPipeline
        onUpdated={onUpdated}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /Devolver ao funil comercial/ }),
    ).not.toBeInTheDocument();
  });

  it('informa que a IA está desligada quando a conversa está marcada como Não cliente', () => {
    render(
      <ConversationActions
        conversationId="c1"
        status="bot"
        excludedFromPipeline
        onUpdated={onUpdated}
      />,
    );

    expect(screen.getByText(/Não cliente · IA desligada/)).toBeInTheDocument();
  });

  it('não mostra nenhum indicador quando a conversa está dentro do funil', () => {
    render(
      <ConversationActions
        conversationId="c1"
        status="bot"
        excludedFromPipeline={false}
        onUpdated={onUpdated}
      />,
    );

    expect(screen.queryByText(/IA desligada/)).not.toBeInTheDocument();
  });

  it('as ações de escalonamento continuam funcionando numa conversa marcada', () => {
    render(
      <ConversationActions
        conversationId="c1"
        status="bot"
        excludedFromPipeline
        onUpdated={onUpdated}
      />,
    );

    expect(screen.getByRole('button', { name: 'Assumir conversa' })).toBeInTheDocument();
  });
});
