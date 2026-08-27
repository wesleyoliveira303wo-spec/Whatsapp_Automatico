/**
 * Milestone 5 — teste do `UserManagementPanel`: painel de gestão de usuários
 * de um tenant (lista + criar + trocar cargo + suspender/reativar/resetar
 * senha). Gap pré-existente fechado nesta rodada (Onda 1 do redesign,
 * 2026-08-22) — o componente nunca teve teste jsdom dedicado.
 *
 * Escopo deliberadamente FOCADO: carga básica + o bug real corrigido nesta
 * rodada (uma falha no carregamento inicial deixava `loading=false`/
 * `users=[]` ao mesmo tempo, e a tela mostrava CONTRADITORIAMENTE o
 * `panelError` e "Nenhum usuário ainda." juntos — `panelError` também serve
 * a erros de AÇÃO sobre uma lista já carregada, então a correção precisa
 * distinguir os dois casos). Um teste completo de todo o fluxo de
 * reset-de-senha/RBAC fica para quando alguém tocar essa lógica de negócio
 * diretamente.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserManagementPanel from '../../components/UserManagementPanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchUsers: jest.fn(),
  createUser: jest.fn(),
  changeUserRole: jest.fn(),
  suspendUser: jest.fn(),
  reactivateUser: jest.fn(),
  resetUserPassword: jest.fn(),
}));

function managedUser(over: Partial<clientApi.ManagedUser> = {}): clientApi.ManagedUser {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'ana@empresa.com',
    role: 'operator',
    status: 'active',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...over,
  };
}

describe('UserManagementPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carrega e lista os usuários ao montar', async () => {
    (clientApi.fetchUsers as jest.Mock).mockResolvedValue({ users: [managedUser()] });

    render(<UserManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('ana@empresa.com')).toBeInTheDocument();
    });
    expect(clientApi.fetchUsers).toHaveBeenCalledWith({ limit: 50 });
  });

  it('mostra mensagem de lista vazia quando não há usuários', async () => {
    (clientApi.fetchUsers as jest.Mock).mockResolvedValue({ users: [] });

    render(<UserManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('Nenhum usuário ainda.')).toBeInTheDocument();
    });
  });

  /**
   * Onda 1 do redesign (2026-08-22) — trava de regressão do bug real: sem
   * nenhum usuário carregado, o erro vira `ErrorState` com retry, nunca o
   * texto de lista vazia.
   */
  it('erro de carregamento inicial (sem nenhum dado) vira ErrorState com retry, nunca a mensagem de lista vazia', async () => {
    (clientApi.fetchUsers as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    render(<UserManagementPanel />);

    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível concluir a ação. Tente novamente.'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Nenhum usuário ainda.')).not.toBeInTheDocument();

    (clientApi.fetchUsers as jest.Mock).mockResolvedValueOnce({ users: [managedUser()] });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('ana@empresa.com')).toBeInTheDocument();
  });

  it('erro de uma AÇÃO sobre dados já carregados vira banner discreto — a lista continua visível', async () => {
    const { ClientApiError } = jest.requireActual('../../lib/clientApi');
    (clientApi.fetchUsers as jest.Mock).mockResolvedValue({ users: [managedUser()] });
    (clientApi.suspendUser as jest.Mock).mockRejectedValue(
      new ClientApiError(403, { error: 'role_not_allowed' }),
    );

    render(<UserManagementPanel />);
    await waitFor(() => expect(screen.getByText('ana@empresa.com')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Mais ações de ana@empresa.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    // Fase 2 (2026-08-27): "Suspender" passou a ABRIR uma confirmação em vez
    // de executar direto — quem dispara a ação é o botão do diálogo.
    fireEvent.click(await screen.findByRole('button', { name: 'Suspender acesso' }));

    await waitFor(() => {
      expect(
        screen.getByText('Seu cargo não permite esta ação sobre este usuário.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('ana@empresa.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  /**
   * Reestruturação de Configurações, Fase 2 (2026-08-27) — a auditoria
   * encontrou suspender / redefinir senha / alterar cargo executando em UM
   * clique, sem aviso e sem volta. Estes testes travam o comportamento novo:
   * a ação NÃO pode disparar antes da confirmação.
   */
  describe('confirmações de ações administrativas', () => {
    it('suspender: só executa DEPOIS de confirmar, e o diálogo nomeia o alvo', async () => {
      (clientApi.fetchUsers as jest.Mock).mockResolvedValue({ users: [managedUser()] });
      (clientApi.suspendUser as jest.Mock).mockResolvedValue({
        user: { ...managedUser(), status: 'suspended' },
      });

      render(<UserManagementPanel />);
      await waitFor(() => expect(screen.getByText('ana@empresa.com')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Mais ações de ana@empresa.com' }));
      fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));

      // Ainda NÃO pode ter chamado a API.
      expect(clientApi.suspendUser).not.toHaveBeenCalled();
      expect(await screen.findByText('Suspender ana@empresa.com?')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Suspender acesso' }));
      await waitFor(() => expect(clientApi.suspendUser).toHaveBeenCalledTimes(1));
    });

    it('suspender: cancelar NÃO executa a ação', async () => {
      (clientApi.fetchUsers as jest.Mock).mockResolvedValue({ users: [managedUser()] });

      render(<UserManagementPanel />);
      await waitFor(() => expect(screen.getByText('ana@empresa.com')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Mais ações de ana@empresa.com' }));
      fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

      await waitFor(() =>
        expect(screen.queryByText('Suspender ana@empresa.com?')).not.toBeInTheDocument(),
      );
      expect(clientApi.suspendUser).not.toHaveBeenCalled();
    });

    it('alterar cargo: mudar o campo NÃO aplica sozinho — abre confirmação com origem e destino', async () => {
      (clientApi.fetchUsers as jest.Mock).mockResolvedValue({ users: [managedUser()] });
      (clientApi.changeUserRole as jest.Mock).mockResolvedValue({
        user: { ...managedUser(), role: 'manager' },
      });

      render(<UserManagementPanel />);
      await waitFor(() => expect(screen.getByText('ana@empresa.com')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Cargo de ana@empresa.com'), {
        target: { value: 'manager' },
      });

      expect(clientApi.changeUserRole).not.toHaveBeenCalled();
      expect(await screen.findByText('Alterar o cargo de ana@empresa.com?')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Alterar cargo' }));
      await waitFor(() =>
        expect(clientApi.changeUserRole).toHaveBeenCalledWith('user-1', 'manager'),
      );
    });

    it('reativar NÃO pede confirmação (é reversível e devolve acesso)', async () => {
      (clientApi.fetchUsers as jest.Mock).mockResolvedValue({
        users: [{ ...managedUser(), status: 'suspended' }],
      });
      (clientApi.reactivateUser as jest.Mock).mockResolvedValue({ user: managedUser() });

      render(<UserManagementPanel />);
      await waitFor(() => expect(screen.getByText('ana@empresa.com')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Mais ações de ana@empresa.com' }));
      fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));

      await waitFor(() => expect(clientApi.reactivateUser).toHaveBeenCalledTimes(1));
    });
  });
});
