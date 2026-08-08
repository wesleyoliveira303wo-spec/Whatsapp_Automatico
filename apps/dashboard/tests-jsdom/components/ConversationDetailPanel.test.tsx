/**
 * Correção de UX 2026-08-01 (validação Fase 1, pedido do fundador): o
 * `ConversationDetailPanel` reposicionava o scroll para o fim a cada poll de
 * ~4s (`usePollingRefresh`), mesmo sem mensagem nova — impossibilitando ler
 * o histórico. Este arquivo cobre o comportamento corrigido:
 *   1. abertura da conversa → pula para o fim;
 *   2. poll SEM mensagem nova, mesmo com o operador tendo rolado pra cima →
 *      NÃO reposiciona o scroll;
 *   3. mensagem nova chegando com o operador perto do fim → acompanha;
 *   4. mensagem nova chegando com o operador longe do fim (lendo histórico)
 *      → NÃO reposiciona, e mostra o botão "Ir para mensagens recentes".
 *
 * `scrollTo`/`scrollHeight`/`scrollTop`/`clientHeight` não existem de verdade
 * no jsdom — cada teste define esses valores manualmente no elemento.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationDetailPanel from '../../components/ConversationDetailPanel';
import * as clientApi from '../../lib/clientApi';
import type { ConversationMessage, ConversationSummary } from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  // Fase 1, Bloco F1.10: `useConversationDetail` passou a usar
  // `fetchConversation` (singular, `GET /conversations/:id`) em vez de
  // varrer `fetchConversations` (listagem paginada).
  fetchConversation: jest.fn(),
  fetchConversationMessages: jest.fn(),
  fetchAiInteractions: jest.fn(),
  fetchContactAvatar: jest.fn(),
  markConversationAsRead: jest.fn(),
  // Fase 1, Bloco F1.10 — pop-up de handoff: reusa as MESMAS funções já
  // usadas por `ConversationActions`/`ConversationSummarySection`.
  escalateConversation: jest.fn(),
  generateConversationSummary: jest.fn(),
}));

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
    stageUpdatedAt: '2026-08-01T09:00:00.000Z',
    excludedFromPipeline: false,
    tags: [],
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

function buildMessage(id: string, content: string): ConversationMessage {
  return {
    id,
    tenantId: 't1',
    conversationId: 'c1',
    direction: 'inbound',
    content,
    contentType: 'text',
    occurredAt: '2026-08-01T09:00:00.000Z',
  };
}

/**
 * Simula um container com muito conteúdo (precisa rolar) e uma posição de
 * scroll controlável.
 *
 * Usa `get:` em vez de `value:` para `scrollHeight` e `clientHeight` porque
 * essas propriedades têm apenas getter no protótipo do HTMLElement no jsdom —
 * redefini-las com `value:` falha silenciosamente (o getter nativo continua
 * retornando 0). `scrollTop` aceita `value: + writable: true` normalmente.
 */
function stubScrollMetrics(
  container: HTMLElement,
  { scrollTop, scrollHeight }: { scrollTop: number; scrollHeight: number },
): void {
  let _scrollTop = scrollTop;
  Object.defineProperty(container, 'scrollHeight', { get: () => scrollHeight, configurable: true });
  Object.defineProperty(container, 'clientHeight', { get: () => 400, configurable: true });
  Object.defineProperty(container, 'scrollTop', {
    get: () => _scrollTop,
    set: (v: number) => {
      _scrollTop = v;
    },
    configurable: true,
  });
  container.scrollTo = jest.fn(({ top }: { top: number }) => {
    _scrollTop = top;
  }) as unknown as typeof container.scrollTo;
}

beforeEach(() => {
  jest.useFakeTimers();
  (clientApi.fetchConversation as jest.Mock).mockResolvedValue(buildConversation());
  (clientApi.fetchAiInteractions as jest.Mock).mockResolvedValue({ interactions: [] });
  (clientApi.fetchContactAvatar as jest.Mock).mockResolvedValue({ avatarUrl: undefined });
  (clientApi.markConversationAsRead as jest.Mock).mockResolvedValue(buildConversation());
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ConversationDetailPanel — scroll', () => {
  it('ao abrir a conversa, o efeito de scroll roda e não deixa o botão "recentes" visível', async () => {
    (clientApi.fetchConversationMessages as jest.Mock).mockResolvedValue({
      messages: [buildMessage('m1', 'oi'), buildMessage('m2', 'tudo bem?')],
    });

    render(<ConversationDetailPanel sessionName="vendas" conversationId="c1" />);
    await flushMicrotasks();

    expect(screen.getByText('oi')).toBeInTheDocument();
    // Estado inicial: nunca mostra o botão de "ir para recentes" — a
    // abertura já posiciona no fim.
    expect(screen.queryByText('Ir para mensagens recentes')).not.toBeInTheDocument();
  });

  it('NÃO reposiciona o scroll num poll sem mensagem nova, mesmo com o operador tendo rolado pra cima', async () => {
    const messages = [buildMessage('m1', 'primeira'), buildMessage('m2', 'segunda')];
    (clientApi.fetchConversationMessages as jest.Mock).mockResolvedValue({ messages });

    render(<ConversationDetailPanel sessionName="vendas" conversationId="c1" />);
    await flushMicrotasks();

    const container = screen
      .getByText('primeira')
      .closest('div[class*="overflow-y-auto"]') as HTMLElement;
    // Operador está no topo (200px) de um container bem alto (2000px) —
    // distanceFromBottom = 2000 - 200 - 400 = 1400 > 150 → isNearBottom=false.
    stubScrollMetrics(container, { scrollTop: 200, scrollHeight: 2000 });
    await act(async () => {
      container.dispatchEvent(new Event('scroll'));
    });

    // Poll de 4s dispara — mesma lista de mensagens, nova referência de array.
    (clientApi.fetchConversationMessages as jest.Mock).mockResolvedValue({
      messages: [...messages],
    });
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
      await Promise.resolve();
    });

    // O scroll do operador não deve ter sido tocado pelo poll.
    expect(container.scrollTop).toBe(200);
    // E o botão de retomar deve estar visível (ele saiu da zona "perto do fim").
    expect(screen.getByText('Ir para mensagens recentes')).toBeInTheDocument();
  });

  it('acompanha mensagem nova quando o operador já está perto do fim', async () => {
    const initialMessages = [buildMessage('m1', 'primeira')];
    (clientApi.fetchConversationMessages as jest.Mock).mockResolvedValue({
      messages: initialMessages,
    });

    render(<ConversationDetailPanel sessionName="vendas" conversationId="c1" />);
    await flushMicrotasks();

    const container = screen
      .getByText('primeira')
      .closest('div[class*="overflow-y-auto"]') as HTMLElement;
    // Operador está perto do fim: distanceFromBottom = 2000 - 1900 - 400 = -300 < 150 → isNearBottom=true.
    stubScrollMetrics(container, { scrollTop: 1900, scrollHeight: 2000 });
    container.dispatchEvent(new Event('scroll'));

    const withNewMessage = [...initialMessages, buildMessage('m2', 'chegou agora')];
    (clientApi.fetchConversationMessages as jest.Mock).mockResolvedValue({
      messages: withNewMessage,
    });

    // Simula crescimento do container após a nova mensagem ser renderizada.
    stubScrollMetrics(container, { scrollTop: 1900, scrollHeight: 2200 });
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('chegou agora')).toBeInTheDocument());
    expect(container.scrollTop).toBe(2200);
  });

  it('NÃO some o botão nem reposiciona quando mensagem nova chega com o operador lendo o histórico', async () => {
    const initialMessages = [buildMessage('m1', 'primeira')];
    (clientApi.fetchConversationMessages as jest.Mock).mockResolvedValue({
      messages: initialMessages,
    });

    render(<ConversationDetailPanel sessionName="vendas" conversationId="c1" />);
    await flushMicrotasks();

    const container = screen
      .getByText('primeira')
      .closest('div[class*="overflow-y-auto"]') as HTMLElement;
    stubScrollMetrics(container, { scrollTop: 100, scrollHeight: 2000 });
    await act(async () => {
      container.dispatchEvent(new Event('scroll'));
    });

    const withNewMessage = [...initialMessages, buildMessage('m2', 'nova mensagem enquanto lia')];
    (clientApi.fetchConversationMessages as jest.Mock).mockResolvedValue({
      messages: withNewMessage,
    });

    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('nova mensagem enquanto lia')).toBeInTheDocument());
    expect(container.scrollTop).toBe(100);
    expect(screen.getByText('Ir para mensagens recentes')).toBeInTheDocument();
  });
});

describe('ConversationDetailPanel — pop-up de handoff humano (Fase 1, Bloco F1.10)', () => {
  beforeEach(() => {
    (clientApi.fetchConversationMessages as jest.Mock).mockResolvedValue({ messages: [] });
  });

  it('(a) conversa escalada COM resumo já existente: pop-up abre mostrando o resumo pronto, sem chamar a IA', async () => {
    (clientApi.fetchConversation as jest.Mock).mockResolvedValue(
      buildConversation({
        status: 'bot',
        escalatedAt: '2026-08-08T10:00:00.000Z',
        aiSummary: 'Cliente perguntou sobre parcelamento em 12x.',
        aiSummaryUpdatedAt: '2026-08-08T10:00:00.000Z',
      }),
    );

    render(<ConversationDetailPanel sessionName="vendas" conversationId="c1" />);
    await flushMicrotasks();

    expect(screen.getByText('A IA pediu atendimento humano')).toBeInTheDocument();
    expect(screen.getByText('Cliente perguntou sobre parcelamento em 12x.')).toBeInTheDocument();
    expect(clientApi.generateConversationSummary).not.toHaveBeenCalled();
  });

  it('(b) conversa escalada SEM resumo ainda: pop-up abre com "Nenhum resumo gerado ainda" + botão para gerar', async () => {
    (clientApi.fetchConversation as jest.Mock).mockResolvedValue(
      buildConversation({ status: 'bot', escalatedAt: '2026-08-08T10:00:00.000Z' }),
    );

    render(<ConversationDetailPanel sessionName="vendas" conversationId="c1" />);
    await flushMicrotasks();

    expect(screen.getByText('A IA pediu atendimento humano')).toBeInTheDocument();
    expect(screen.getByText('Nenhum resumo gerado ainda.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar resumo' })).toBeInTheDocument();
  });

  it('(c) conversa normal, não escalada: pop-up nunca abre', async () => {
    (clientApi.fetchConversation as jest.Mock).mockResolvedValue(
      buildConversation({ status: 'bot', escalatedAt: undefined }),
    );

    render(<ConversationDetailPanel sessionName="vendas" conversationId="c1" />);
    await flushMicrotasks();

    expect(screen.queryByText('A IA pediu atendimento humano')).not.toBeInTheDocument();
  });

  it('conversa já assumida por um humano (status="human"): pop-up nunca abre, mesmo com escalatedAt antigo no dado', async () => {
    (clientApi.fetchConversation as jest.Mock).mockResolvedValue(
      buildConversation({ status: 'human', assignedToUserId: 'op-1', escalatedAt: undefined }),
    );

    render(<ConversationDetailPanel sessionName="vendas" conversationId="c1" />);
    await flushMicrotasks();

    expect(screen.queryByText('A IA pediu atendimento humano')).not.toBeInTheDocument();
  });

  it('(d) operador clica "Assumir atendimento": chama escalateConversation, fecha o pop-up e reflete o novo status', async () => {
    (clientApi.fetchConversation as jest.Mock).mockResolvedValue(
      buildConversation({ status: 'bot', escalatedAt: '2026-08-08T10:00:00.000Z' }),
    );
    (clientApi.escalateConversation as jest.Mock).mockResolvedValue(
      buildConversation({ status: 'human', assignedToUserId: 'op-1', escalatedAt: undefined }),
    );

    render(<ConversationDetailPanel sessionName="vendas" conversationId="c1" />);
    await flushMicrotasks();

    expect(screen.getByText('A IA pediu atendimento humano')).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: 'Assumir atendimento' }).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(clientApi.escalateConversation).toHaveBeenCalledWith('c1');
    expect(screen.queryByText('A IA pediu atendimento humano')).not.toBeInTheDocument();
  });

  it('fechar sem assumir ("Fechar") não reabre o pop-up sozinho no próximo poll da mesma conversa', async () => {
    (clientApi.fetchConversation as jest.Mock).mockResolvedValue(
      buildConversation({ status: 'bot', escalatedAt: '2026-08-08T10:00:00.000Z' }),
    );

    render(<ConversationDetailPanel sessionName="vendas" conversationId="c1" />);
    await flushMicrotasks();
    expect(screen.getByText('A IA pediu atendimento humano')).toBeInTheDocument();

    // Duas coisas se chamam "Fechar" aqui (o X do Dialog, com texto
    // sr-only, e o botão de texto do rodapé) — pega o último (o do rodapé).
    const closeButtons = screen.getAllByRole('button', { name: 'Fechar' });
    await act(async () => {
      closeButtons[closeButtons.length - 1].click();
    });
    expect(screen.queryByText('A IA pediu atendimento humano')).not.toBeInTheDocument();

    // Poll de 4s — mesmos dados (ainda escalada, ninguém assumiu ainda).
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText('A IA pediu atendimento humano')).not.toBeInTheDocument();
  });

  it('(e) Botão POWER desligado (aiEnabled=false) não interfere na condição de abertura do pop-up', async () => {
    (clientApi.fetchConversation as jest.Mock).mockResolvedValue(
      buildConversation({ status: 'bot', escalatedAt: '2026-08-08T10:00:00.000Z' }),
    );

    render(
      <ConversationDetailPanel sessionName="vendas" conversationId="c1" aiEnabled={false} />,
    );
    await flushMicrotasks();

    // O pop-up continua abrindo pela mesma condição (status+escalatedAt) —
    // o Botão POWER só afeta o badge de status, nunca esta decisão.
    expect(screen.getByText('A IA pediu atendimento humano')).toBeInTheDocument();
  });
});
