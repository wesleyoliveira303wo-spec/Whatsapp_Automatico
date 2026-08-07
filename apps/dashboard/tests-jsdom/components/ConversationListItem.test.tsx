/**
 * Milestone 6, Bloco M6H-2 — teste do `ConversationListItem`, redesenhado
 * como linha compacta de inbox (WhatsApp/Telegram: avatar + nome + hora),
 * sem mais `Card`/"Sessão: X" (redundante dentro do painel de uma sessão).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationListItem from '../../components/ConversationListItem';
import * as clientApi from '../../lib/clientApi';
import type { ConversationSummary } from '../../lib/clientApi';

// Milestone 6, Bloco M6H-2b: a linha agora renderiza `ContactAvatar`, que
// busca a foto de perfil via `fetchContactAvatar` — mockado (mesmo padrão de
// `ConversationActions.test.tsx`) para o teste não depender de rede real.
jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchContactAvatar: jest.fn(),
}));

beforeEach(() => {
  (clientApi.fetchContactAvatar as jest.Mock)
    .mockReset()
    .mockResolvedValue({ avatarUrl: undefined });
});

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
    stageUpdatedAt: '2026-07-24T09:00:00.000Z',
    excludedFromPipeline: false,
    tags: [],
    createdAt: '2026-07-24T09:00:00.000Z',
    updatedAt: '2026-07-24T09:05:00.000Z',
    ...overrides,
  };
}

describe('ConversationListItem (Milestone 6, Bloco M6H-2)', () => {
  it('renderiza o contato e o status, sem destaque quando não está aguardando humano', () => {
    render(<ConversationListItem conversation={buildConversation()} />);
    expect(screen.getByText('5511999999999')).toBeInTheDocument();
    expect(screen.getByText('Bot respondendo')).toBeInTheDocument();
    expect(screen.queryByText('Aguardando atendente')).not.toBeInTheDocument();
  });

  it('leva ao detalhe dentro da sessão', () => {
    render(<ConversationListItem conversation={buildConversation()} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sessions/vendas/conversations/c1');
  });

  it('mostra "Aguardando atendente" quando escalatedAt está definido, mesmo com status=bot (reforma do escalonamento, 2026-07-25)', () => {
    render(
      <ConversationListItem
        conversation={buildConversation({ status: 'bot', escalatedAt: '2026-07-25T10:00:00.000Z' })}
      />,
    );
    expect(screen.getByText('Aguardando atendente')).toBeInTheDocument();
  });

  it('não mostra "Aguardando atendente" quando não há escalatedAt, mesmo com status=human (humano já assumiu)', () => {
    render(
      <ConversationListItem
        conversation={buildConversation({ status: 'human', assignedToUserId: 'u1' })}
      />,
    );
    expect(screen.queryByText('Aguardando atendente')).not.toBeInTheDocument();
    expect(screen.getByText('Atendimento humano')).toBeInTheDocument();
  });

  it('aplica destaque visual quando active=true', () => {
    render(<ConversationListItem conversation={buildConversation()} active />);
    expect(screen.getByRole('link')).toHaveClass('bg-muted');
  });

  it('mostra o contactName (pushName) em vez do número quando presente (Milestone 6, Bloco M6H-2b)', () => {
    render(
      <ConversationListItem conversation={buildConversation({ contactName: 'Maria Silva' })} />,
    );
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.queryByText('5511999999999')).not.toBeInTheDocument();
  });

  it('cai para o número formatado quando não há contactName', () => {
    render(<ConversationListItem conversation={buildConversation()} />);
    expect(screen.getByText('5511999999999')).toBeInTheDocument();
  });

  it('mostra o círculo com a contagem quando unreadCount > 0 (indicador de não lidas, 2026-07-25)', () => {
    render(<ConversationListItem conversation={buildConversation({ unreadCount: 3 })} />);
    expect(screen.getByTitle('3 mensagem(ns) não lida(s)')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('não mostra o círculo de não lidas quando unreadCount é 0', () => {
    render(<ConversationListItem conversation={buildConversation({ unreadCount: 0 })} />);
    expect(screen.queryByTitle(/mensagem\(ns\) não lida\(s\)/)).not.toBeInTheDocument();
  });

  describe('selo "Não cliente" (ADR #96)', () => {
    it('mostra o selo quando a conversa está marcada como fora do funil comercial', () => {
      render(
        <ConversationListItem conversation={buildConversation({ excludedFromPipeline: true })} />,
      );
      expect(screen.getByText('Não cliente')).toBeInTheDocument();
    });

    it('não mostra o selo numa conversa dentro do funil', () => {
      render(
        <ConversationListItem conversation={buildConversation({ excludedFromPipeline: false })} />,
      );
      expect(screen.queryByText('Não cliente')).not.toBeInTheDocument();
    });
  });

  describe('chips de tags (Redesign 2026-08-05, R4)', () => {
    it('mostra os chips das tags atribuídas', () => {
      render(
        <ConversationListItem
          conversation={buildConversation({
            tags: [{ id: 'tag-1', name: 'Urgente', color: 'red' }],
          })}
        />,
      );
      expect(screen.getByText('Urgente')).toBeInTheDocument();
    });

    it('não mostra nenhum chip quando a conversa não tem tags', () => {
      const { container } = render(
        <ConversationListItem conversation={buildConversation({ tags: [] })} />,
      );
      expect(container.querySelector('[title]')).toBeNull();
    });

    it('resume em "+N" quando há mais tags do que o teto exibido', () => {
      render(
        <ConversationListItem
          conversation={buildConversation({
            tags: [
              { id: 'tag-1', name: 'Um', color: 'red' },
              { id: 'tag-2', name: 'Dois', color: 'blue' },
              { id: 'tag-3', name: 'Três', color: 'green' },
              { id: 'tag-4', name: 'Quatro', color: 'purple' },
            ],
          })}
        />,
      );
      expect(screen.getByText('+1')).toBeInTheDocument();
    });
  });

  describe('prévia da última mensagem (Fase 1, Bloco F1.7)', () => {
    it('mostra lastMessagePreview no lugar do rótulo de status quando presente', () => {
      render(
        <ConversationListItem
          conversation={buildConversation({ lastMessagePreview: 'Oi, qual o horário de vocês?' })}
        />,
      );
      expect(screen.getByText('Oi, qual o horário de vocês?')).toBeInTheDocument();
      expect(screen.queryByText('Bot respondendo')).not.toBeInTheDocument();
    });

    it('cai para o rótulo de status quando não há lastMessagePreview ainda', () => {
      render(<ConversationListItem conversation={buildConversation()} />);
      expect(screen.getByText('Bot respondendo')).toBeInTheDocument();
    });

    it('mostra a prévia real mesmo aguardando atendente — o selo (não a prévia) sinaliza a escalada (Design System, reskin 2026-08-06)', () => {
      render(
        <ConversationListItem
          conversation={buildConversation({
            escalatedAt: '2026-07-25T10:00:00.000Z',
            lastMessagePreview: 'Alguma dúvida sobre o pedido',
          })}
        />,
      );
      expect(screen.getByText('Alguma dúvida sobre o pedido')).toBeInTheDocument();
      expect(screen.getByText('Aguardando atendente')).toBeInTheDocument();
    });
  });
});
