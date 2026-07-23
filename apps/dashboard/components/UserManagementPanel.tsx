import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  changeUserRole,
  createUser,
  fetchUsers,
  reactivateUser,
  resetUserPassword,
  suspendUser,
  ClientApiError,
  type ManagedUser,
  type ManagedUserRole,
} from '@/lib/clientApi';

/** Cargos oferecidos no formulario — 'owner' fica de fora de proposito (ninguem cria owner pela UI; a API recusaria de qualquer jeito — hierarquia do M5E-2). */
const ASSIGNABLE_ROLES: ManagedUserRole[] = ['administrator', 'manager', 'operator', 'read_only'];

const ROLE_LABELS: Record<ManagedUserRole, string> = {
  owner: 'Dono',
  administrator: 'Administrador',
  manager: 'Gerente',
  operator: 'Operador',
  read_only: 'Somente leitura',
};

/** Traduz os erros de negocio da API (usersErrorHandler, M5E-3) para mensagens de UI. */
function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    const code = (error.body as { error?: string } | undefined)?.error;
    if (code === 'email_already_in_use') return 'Já existe um usuário com este e-mail.';
    if (code === 'role_not_allowed') return 'Seu cargo não permite esta ação sobre este usuário.';
    if (code === 'self_management_forbidden') return 'Você não pode executar esta ação sobre a própria conta.';
    if (code === 'weak_temporary_password' || code === 'weak_password') return 'A senha provisória deve ter pelo menos 8 caracteres.';
    if (code === 'human_required') return 'Gestão de usuários exige login de pessoa (não API key).';
    if (error.status === 403) return 'Sem permissão para esta ação.';
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

/**
 * Painel de gestao de usuarios (Milestone 5, Bloco M5F-3 — a cara do RH).
 * Lista + criar + mudar cargo + suspender/reativar + resetar senha. Toda
 * regra (hierarquia, auto-gestao, e-mail unico) vive na API — este painel so
 * traduz os erros dela para mensagens; nao reimplementa nada.
 */
export default function UserManagementPanel(): JSX.Element {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [panelError, setPanelError] = useState<string | null>(null);

  // Formulario de criacao
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<ManagedUserRole>('operator');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);

  // Reset de senha por linha (um de cada vez)
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setPanelError(null);
    try {
      const page = await fetchUsers({ limit: 50 });
      setUsers(page.users);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setPanelError(errorMessageFor(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore(): Promise<void> {
    if (!nextCursor) return;
    try {
      const page = await fetchUsers({ limit: 50, cursor: nextCursor });
      setUsers((current) => [...current, ...page.users]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setPanelError(errorMessageFor(error));
    }
  }

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    setCreating(true);
    setPanelError(null);
    setCreatedNotice(null);
    try {
      const { user } = await createUser(newEmail.trim(), newRole, newPassword);
      setUsers((current) => [user, ...current]);
      setCreatedNotice(
        `Usuário ${user.email} criado. Entregue a senha provisória a ele — será obrigado a trocá-la no primeiro acesso.`,
      );
      setNewEmail('');
      setNewPassword('');
      setNewRole('operator');
    } catch (error) {
      setPanelError(errorMessageFor(error));
    } finally {
      setCreating(false);
    }
  }

  /** Executa uma acao de linha e substitui o usuario atualizado na lista. */
  async function runRowAction(action: () => Promise<{ user: ManagedUser }>): Promise<void> {
    setPanelError(null);
    try {
      const { user } = await action();
      setUsers((current) => current.map((u) => (u.id === user.id ? user : u)));
    } catch (error) {
      setPanelError(errorMessageFor(error));
    }
  }

  async function handleResetPassword(userId: string): Promise<void> {
    await runRowAction(() => resetUserPassword(userId, resetPassword));
    setResetUserId(null);
    setResetPassword('');
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">Novo usuário</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="newUserEmail" className="mb-1 block text-sm font-medium text-gray-700">
              E-mail
            </label>
            <input
              id="newUserEmail"
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label htmlFor="newUserRole" className="mb-1 block text-sm font-medium text-gray-700">
              Cargo
            </label>
            <select
              id="newUserRole"
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as ManagedUserRole)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px]">
            <label htmlFor="newUserPassword" className="mb-1 block text-sm font-medium text-gray-700">
              Senha provisória
            </label>
            <input
              id="newUserPassword"
              type="text"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              minLength={8}
              required
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {creating ? 'Criando…' : 'Criar usuário'}
          </button>
        </div>
        {createdNotice && <p className="mt-3 rounded-md bg-green-50 p-2 text-sm text-green-800">{createdNotice}</p>}
      </form>

      {panelError && <p className="text-sm text-red-600">{panelError}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando usuários…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} data-testid={`user-row-${user.email}`}>
                  <td className="px-4 py-3 text-gray-800">
                    {user.email}
                    {user.mustChangePassword && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">senha provisória</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.role === 'owner' ? (
                      <span className="font-medium text-gray-800">{ROLE_LABELS.owner}</span>
                    ) : (
                      <select
                        value={user.role}
                        onChange={(event) => void runRowAction(() => changeUserRole(user.id, event.target.value as ManagedUserRole))}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        aria-label={`Cargo de ${user.email}`}
                      >
                        {ASSIGNABLE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.status === 'active' ? (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">Ativo</span>
                    ) : (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">Suspenso</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.role !== 'owner' && (
                      <div className="flex flex-wrap items-center gap-2">
                        {user.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => void runRowAction(() => suspendUser(user.id))}
                            className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Suspender
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void runRowAction(() => reactivateUser(user.id))}
                            className="rounded-md border border-green-300 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                          >
                            Reativar
                          </button>
                        )}
                        {resetUserId === user.id ? (
                          <span className="flex items-center gap-1">
                            <input
                              type="text"
                              value={resetPassword}
                              onChange={(event) => setResetPassword(event.target.value)}
                              placeholder="Nova senha provisória"
                              className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                              minLength={8}
                            />
                            <button
                              type="button"
                              onClick={() => void handleResetPassword(user.id)}
                              className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResetUserId(null);
                                setResetPassword('');
                              }}
                              className="px-1 text-xs text-gray-500 hover:text-gray-700"
                            >
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setResetUserId(user.id)}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Resetar senha
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum usuário ainda.</p>}
          {nextCursor && (
            <div className="border-t border-gray-100 p-3">
              <button type="button" onClick={() => void loadMore()} className="text-sm text-blue-600 hover:underline">
                Carregar mais
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
