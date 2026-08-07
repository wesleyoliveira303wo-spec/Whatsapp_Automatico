/**
 * Cérebro da IA — "Cadastrar pergunta não respondida" (ADR #86). Teste do
 * `AiProfileFaqDialog`: abrir/fechar, validação de campos obrigatórios, e
 * confirmação chamando `onConfirm` com pergunta+resposta.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiProfileFaqDialog from '../../components/AiProfileFaqDialog';

describe('AiProfileFaqDialog (Cérebro da IA — cadastrar pergunta não respondida)', () => {
  it('não mostra o modal antes de clicar no botão', () => {
    render(<AiProfileFaqDialog onConfirm={jest.fn()} />);
    expect(screen.queryByLabelText('Pergunta do cliente')).not.toBeInTheDocument();
  });

  it('abre o modal ao clicar no botão', () => {
    render(<AiProfileFaqDialog onConfirm={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar pergunta não respondida/ }));
    expect(screen.getByLabelText('Pergunta do cliente')).toBeInTheDocument();
    expect(screen.getByLabelText('Resposta correta')).toBeInTheDocument();
  });

  it('botão de confirmar fica desabilitado enquanto pergunta ou resposta estiverem vazias', () => {
    render(<AiProfileFaqDialog onConfirm={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar pergunta não respondida/ }));

    const confirmButton = screen.getByRole('button', { name: 'Adicionar ao Cérebro da IA' });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Pergunta do cliente'), {
      target: { value: 'Vocês entregam?' },
    });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Resposta correta'), {
      target: { value: 'Sim, entregamos.' },
    });
    expect(confirmButton).toBeEnabled();
  });

  it('chama onConfirm com a pergunta e resposta, e fecha o modal', () => {
    const onConfirm = jest.fn();
    render(<AiProfileFaqDialog onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar pergunta não respondida/ }));

    fireEvent.change(screen.getByLabelText('Pergunta do cliente'), {
      target: { value: 'Vocês entregam?' },
    });
    fireEvent.change(screen.getByLabelText('Resposta correta'), {
      target: { value: 'Sim, entregamos.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao Cérebro da IA' }));

    expect(onConfirm).toHaveBeenCalledWith('Vocês entregam?', 'Sim, entregamos.');
    expect(screen.queryByLabelText('Pergunta do cliente')).not.toBeInTheDocument();
  });

  it('cancelar fecha o modal sem chamar onConfirm', () => {
    const onConfirm = jest.fn();
    render(<AiProfileFaqDialog onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar pergunta não respondida/ }));

    fireEvent.change(screen.getByLabelText('Pergunta do cliente'), {
      target: { value: 'Vocês entregam?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Pergunta do cliente')).not.toBeInTheDocument();
  });

  it('reabrir o modal depois de cancelar começa com os campos vazios', () => {
    render(<AiProfileFaqDialog onConfirm={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar pergunta não respondida/ }));
    fireEvent.change(screen.getByLabelText('Pergunta do cliente'), {
      target: { value: 'Rascunho' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar pergunta não respondida/ }));
    expect(screen.getByLabelText('Pergunta do cliente')).toHaveValue('');
  });
});
