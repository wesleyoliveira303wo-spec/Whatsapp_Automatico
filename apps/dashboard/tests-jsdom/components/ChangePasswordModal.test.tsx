/**
 * Auditoria do Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fase 13) —
 * pedido explícito do fundador: "não quero mais um formulário enorme de
 * senha aparecendo permanentemente na página". Cobre só a ORQUESTRAÇÃO do
 * modal (abre/fecha/chama onSuccess) — `ChangePasswordForm` já tem os
 * próprios testes de validação/erro/API.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChangePasswordModal from '../../components/ChangePasswordModal';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  changePassword: jest.fn(),
}));

describe('ChangePasswordModal', () => {
  it('o formulário de senha NÃO está visível até clicar em "Alterar senha"', () => {
    render(<ChangePasswordModal onSuccess={jest.fn()} />);
    expect(screen.queryByLabelText('Senha atual')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alterar senha' })).toBeInTheDocument();
  });

  it('clicar em "Alterar senha" abre o modal com o formulário', () => {
    render(<ChangePasswordModal onSuccess={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));
    expect(screen.getByLabelText('Senha atual')).toBeInTheDocument();
    expect(screen.getByLabelText('Nova senha')).toBeInTheDocument();
  });

  it('sucesso: fecha o modal e chama onSuccess (quem mostra a confirmação é o chamador)', async () => {
    (clientApi.changePassword as jest.Mock).mockResolvedValue(undefined);
    const onSuccess = jest.fn();
    render(<ChangePasswordModal onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'antiga123' } });
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'nova12345' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), {
      target: { value: 'nova12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByLabelText('Senha atual')).not.toBeInTheDocument(),
    );
  });
});
