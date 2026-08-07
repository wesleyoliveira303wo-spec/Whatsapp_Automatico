/**
 * Cérebro da IA v2 — "Assistente Guiado" (ADR #71/#85). Teste do
 * `AiProfileQuizWizard`: navegação passo a passo, progresso, e geração do
 * texto final na última pergunta.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiProfileQuizWizard from '../../components/AiProfileQuizWizard';

describe('AiProfileQuizWizard (Cérebro da IA v2 — Assistente Guiado)', () => {
  it('começa na primeira pergunta (Nome), com progresso 0/8', () => {
    render(<AiProfileQuizWizard onGenerate={jest.fn()} />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('Pergunta 1 de 8')).toBeInTheDocument();
    expect(screen.getByText('0/8 respondidas')).toBeInTheDocument();
  });

  it('botão Voltar fica desabilitado na primeira pergunta', () => {
    render(<AiProfileQuizWizard onGenerate={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Voltar/ })).toBeDisabled();
  });

  it('avança para a próxima pergunta ao clicar em Próxima, e atualiza o progresso', () => {
    render(<AiProfileQuizWizard onGenerate={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Salão da Maria' } });
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));

    expect(screen.getByText('O que vendemos')).toBeInTheDocument();
    expect(screen.getByText('Pergunta 2 de 8')).toBeInTheDocument();
    expect(screen.getByText('1/8 respondidas')).toBeInTheDocument();
  });

  it('volta para a pergunta anterior preservando a resposta já digitada', () => {
    render(<AiProfileQuizWizard onGenerate={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Salão da Maria' } });
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));

    expect(screen.getByLabelText('Nome')).toHaveValue('Salão da Maria');
  });

  it('mostra "Avançado (opcional)" na última pergunta (Observações)', () => {
    render(<AiProfileQuizWizard onGenerate={jest.fn()} />);
    for (let i = 0; i < 8; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    }
    expect(screen.getByText('Observações')).toBeInTheDocument();
    expect(screen.getByText('Avançado (opcional)')).toBeInTheDocument();
  });

  it('o botão da última pergunta diz "Gerar texto" e chama onGenerate com o texto formatado', () => {
    const onGenerate = jest.fn();
    render(<AiProfileQuizWizard onGenerate={onGenerate} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Salão da Maria' } });
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    fireEvent.change(screen.getByLabelText('O que vendemos'), {
      target: { value: 'Cortes e coloração' },
    });
    for (let i = 0; i < 7; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Próxima|Gerar texto/ }));
    }

    expect(screen.getByRole('button', { name: /Gerar texto/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Gerar texto/ }));

    expect(onGenerate).toHaveBeenCalledWith(
      '- Nome: Salão da Maria\n- O que vendemos: Cortes e coloração',
    );
  });

  it('pré-carrega respostas iniciais quando fornecidas via initialAnswers', () => {
    render(
      <AiProfileQuizWizard initialAnswers={{ businessName: 'Loja X' }} onGenerate={jest.fn()} />,
    );
    expect(screen.getByLabelText('Nome')).toHaveValue('Loja X');
    expect(screen.getByText('1/8 respondidas')).toBeInTheDocument();
  });
});
