/**
 * Bloco B3 (issue #14) — a seção que mostra as perguntas em que a IA
 * sinalizou "não sei responder" (Fase 1, Bloco F1.4/ADR #95) dentro da aba
 * FAQ do Cérebro da IA. Mocka `clientApi` (mesmo padrão de
 * `ConversationSummarySection.test.tsx`), nunca o hook — assim o teste
 * exercita o hook de verdade junto com o componente.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import UnansweredQuestionsSection from '../../components/UnansweredQuestionsSection';
import * as clientApi from '../../lib/clientApi';
import type { UnansweredQuestionSummary } from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchUnansweredQuestions: jest.fn(),
}));

function buildQuestion(
  overrides: Partial<UnansweredQuestionSummary> = {},
): UnansweredQuestionSummary {
  return {
    interactionId: 'ai-1',
    conversationId: 'conv-1',
    sessionName: 'vendas',
    questionText: 'Vocês parcelam em quantas vezes?',
    contactJid: '5511999999999@s.whatsapp.net',
    savedContactName: 'Dona Ana',
    occurredAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('UnansweredQuestionsSection', () => {
  const onAnswer = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('não renderiza nada quando não há nenhuma lacuna', async () => {
    (clientApi.fetchUnansweredQuestions as jest.Mock).mockResolvedValue({ questions: [] });

    const { container } = render(
      <UnansweredQuestionsSection sessionName="vendas" answeredQuestions={[]} onAnswer={onAnswer} />,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('lista a pergunta, quem perguntou e o botão de ensinar', async () => {
    (clientApi.fetchUnansweredQuestions as jest.Mock).mockResolvedValue({
      questions: [buildQuestion()],
    });

    render(
      <UnansweredQuestionsSection sessionName="vendas" answeredQuestions={[]} onAnswer={onAnswer} />,
    );

    expect(await screen.findByText(/Vocês parcelam em quantas vezes\?/)).toBeInTheDocument();
    expect(screen.getByText('Dona Ana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ensinar a IA/ })).toBeInTheDocument();
  });

  it('clicar em "Ensinar a IA" devolve o texto da pergunta para quem chamou', async () => {
    (clientApi.fetchUnansweredQuestions as jest.Mock).mockResolvedValue({
      questions: [buildQuestion()],
    });

    render(
      <UnansweredQuestionsSection sessionName="vendas" answeredQuestions={[]} onAnswer={onAnswer} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Ensinar a IA/ }));

    expect(onAnswer).toHaveBeenCalledWith('Vocês parcelam em quantas vezes?');
  });

  it('marca "Já respondida" (e esconde o botão) quando a FAQ já tem aquela pergunta', async () => {
    (clientApi.fetchUnansweredQuestions as jest.Mock).mockResolvedValue({
      questions: [buildQuestion()],
    });

    render(
      <UnansweredQuestionsSection
        sessionName="vendas"
        // Mesma pergunta com caixa/pontuação diferentes — a comparação é
        // tolerante de propósito, senão o selo quase nunca apareceria.
        answeredQuestions={['voces parcelam em quantas vezes']}
        onAnswer={onAnswer}
      />,
    );

    expect(await screen.findByText('Já respondida')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ensinar a IA/ })).not.toBeInTheDocument();
  });

  it('interação antiga sem a mensagem de origem aparece, mas sem botão de ensinar', async () => {
    (clientApi.fetchUnansweredQuestions as jest.Mock).mockResolvedValue({
      questions: [buildQuestion({ questionText: undefined })],
    });

    render(
      <UnansweredQuestionsSection sessionName="vendas" answeredQuestions={[]} onAnswer={onAnswer} />,
    );

    expect(await screen.findByText('Pergunta original não registrada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ensinar a IA/ })).not.toBeInTheDocument();
  });

  it('falha ao carregar vira um aviso discreto, sem um segundo botão de "Tentar de novo"', async () => {
    (clientApi.fetchUnansweredQuestions as jest.Mock).mockRejectedValue(new Error('rede'));

    render(
      <UnansweredQuestionsSection sessionName="vendas" answeredQuestions={[]} onAnswer={onAnswer} />,
    );

    expect(await screen.findByText(/Falha ao carregar as perguntas/)).toBeInTheDocument();
    // Trava de regressão: a FAQ (que envolve esta seção) tem o `ErrorState`
    // dela; um segundo botão igual aqui deixaria ambíguo o que falhou.
    expect(screen.queryByRole('button', { name: /Tentar de novo/ })).not.toBeInTheDocument();
  });
});
