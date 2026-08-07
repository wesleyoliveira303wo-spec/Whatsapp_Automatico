/**
 * Redesign 2026-08-05 (R5) — teste do `ConversationSummarySection` (painel
 * de contexto da conversa): estado vazio, resumo existente, "desatualizado",
 * geração com sucesso/erro. Mesmo padrão de `ConversationActions.test.tsx`
 * (mocka `clientApi`/`toast`, `onUpdated` como spy).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationSummarySection from '../../components/ConversationSummarySection';
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
    stageUpdatedAt: '2026-08-06T09:00:00.000Z',
    excludedFromPipeline: false,
    tags: [],
    aiSummaryMessageCount: 0,
    createdAt: '2026-08-06T09:00:00.000Z',
    updatedAt: '2026-08-06T09:05:00.000Z',
    ...overrides,
  };
}

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  generateConversationSummary: jest.fn(),
}));

jest.mock('../../components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

describe('ConversationSummarySection (Redesign 2026-08-05, R5)', () => {
  const onUpdated = jest.fn();

  beforeEach(() => {
    onUpdated.mockClear();
    (toast as jest.Mock).mockClear();
    (clientApi.generateConversationSummary as jest.Mock).mockReset();
  });

  it('mostra "Nenhum resumo gerado ainda" quando aiSummary está ausente', () => {
    render(<ConversationSummarySection conversation={buildConversation()} onUpdated={onUpdated} />);
    expect(screen.getByText('Nenhum resumo gerado ainda.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gerar resumo/i })).toBeInTheDocument();
  });

  it('mostra o texto do resumo e "Atualizar resumo" quando aiSummary está presente', () => {
    render(
      <ConversationSummarySection
        conversation={buildConversation({
          aiSummary: 'Cliente perguntou o preço.',
          aiSummaryUpdatedAt: '2026-08-06T09:00:00.000Z',
        })}
        onUpdated={onUpdated}
      />,
    );
    expect(screen.getByText('Cliente perguntou o preço.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atualizar resumo/i })).toBeInTheDocument();
  });

  it('mostra o selo "Desatualizado" quando lastMessageAt é posterior a aiSummaryUpdatedAt', () => {
    render(
      <ConversationSummarySection
        conversation={buildConversation({
          aiSummary: 'Resumo antigo.',
          aiSummaryUpdatedAt: '2026-08-06T09:00:00.000Z',
          lastMessageAt: '2026-08-06T10:00:00.000Z',
        })}
        onUpdated={onUpdated}
      />,
    );
    expect(screen.getByText('Desatualizado')).toBeInTheDocument();
  });

  it('não mostra "Desatualizado" quando o resumo já cobre a última mensagem', () => {
    render(
      <ConversationSummarySection
        conversation={buildConversation({
          aiSummary: 'Resumo atual.',
          aiSummaryUpdatedAt: '2026-08-06T10:00:00.000Z',
          lastMessageAt: '2026-08-06T09:00:00.000Z',
        })}
        onUpdated={onUpdated}
      />,
    );
    expect(screen.queryByText('Desatualizado')).not.toBeInTheDocument();
  });

  it('gera o resumo com sucesso: chama onUpdated e mostra toast de sucesso', async () => {
    const updated = buildConversation({
      aiSummary: 'Novo resumo.',
      aiSummaryUpdatedAt: '2026-08-06T11:00:00.000Z',
    });
    (clientApi.generateConversationSummary as jest.Mock).mockResolvedValue(updated);

    render(<ConversationSummarySection conversation={buildConversation()} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole('button', { name: /Gerar resumo/i }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
  });

  it('em falha (400, sem mensagens), mostra toast de erro específico', async () => {
    (clientApi.generateConversationSummary as jest.Mock).mockRejectedValue(
      new clientApi.ClientApiError(400, { error: 'conversation_summary_unavailable' }),
    );

    render(<ConversationSummarySection conversation={buildConversation()} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole('button', { name: /Gerar resumo/i }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: expect.stringMatching(/não tem mensagens suficientes/i),
      }),
    );
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('em falha (503, provider não configurado), mostra toast de erro específico', async () => {
    (clientApi.generateConversationSummary as jest.Mock).mockRejectedValue(
      new clientApi.ClientApiError(503, { error: 'ai_provider_not_configured' }),
    );

    render(<ConversationSummarySection conversation={buildConversation()} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole('button', { name: /Gerar resumo/i }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: expect.stringMatching(/provedor de IA não está configurado/i),
      }),
    );
  });

  it('desabilita o botão e mostra "Gerando…" enquanto a chamada está pendente', async () => {
    let resolvePromise: (value: ConversationSummary) => void = () => {};
    (clientApi.generateConversationSummary as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    render(<ConversationSummarySection conversation={buildConversation()} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole('button', { name: /Gerar resumo/i }));

    expect(await screen.findByRole('button', { name: /Gerando/i })).toBeDisabled();

    resolvePromise(buildConversation({ aiSummary: 'x' }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });
});
