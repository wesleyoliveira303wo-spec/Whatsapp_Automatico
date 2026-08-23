import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { MoreHorizontal } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/** Mesma casca visual dos outros campos do formulário — `<select>` nativo, `Select` (Radix) fica para quando um formulário exigir de fato as features dele (busca, portal). Reskin 2026-08-07: tamanho/raio igual ao resto dos campos do mockup de Configurações (h34, radius9). */
const NATIVE_SELECT_CLASSES =
  'h-[34px] rounded-[9px] border border-border bg-panel px-2.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
interface RowActionsMenuProps {
  user: ManagedUser;
  onSuspend: () => void;
  onReactivate: () => void;
  onResetPassword: () => void;
}

/**
 * Menu "mais ações" por linha (reskin 2026-08-07, Design System) — o mockup
 * mostra só um botão de kebab por linha (`⋮`), não os botões
 * Suspender/Reativar/Resetar senha soltos que existiam antes. Dropdown
 * local (sem Radix novo, mesmo padrão já usado em `AccountMenu`/
 * `MessageComposer`) — nenhuma ação foi removida, só reagrupada atrás do
 * ícone; "Resetar senha" abre o mesmo formulário inline de sempre (linha
 * vira um campo de senha + OK/Cancelar), só que disparado pelo menu.
 */
function RowActionsMenu({
  user,
  onSuspend,
  onReactivate,
  onResetPassword,
}: RowActionsMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} className="relative flex justify-end">
      <button
        type="button"
        title="Mais ações"
        aria-label={`Mais ações de ${user.email}`}
        onClick={() => setOpen((current) => !current)}
        className="grid h-7 w-7 place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="h-[15px] w-[15px]" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-xl border border-border bg-card p-1.5 shadow-menu">
          {user.status === 'active' ? (
            <button
              type="button"
              onClick={() => {
                onSuspend();
                setOpen(false);
              }}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-destructive hover:bg-destructive/10"
            >
              Suspender
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onReactivate();
                setOpen(false);
              }}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-success hover:bg-success/10"
            >
              Reativar
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onResetPassword();
              setOpen(false);
            }}
            className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-foreground hover:bg-muted"
          >
            Resetar senha
          </button>
        </div>
      )}
    </div>
  );
}

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    const code = (error.body as { error?: string } | undefined)?.error;
    if (code === 'email_already_in_use') return 'Já existe um usuário com este e-mail.';
    if (code === 'role_not_allowed') return 'Seu cargo não permite esta ação sobre este usuário.';
    if (code === 'self_management_forbidden')
      return 'Você não pode executar esta ação sobre a própria conta.';
    if (code === 'weak_temporary_password' || code === 'weak_password')
      return 'A senha provisória deve ter pelo menos 8 caracteres.';
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
 *
 * Reskin 2026-08-07 (Design System, tela Configurações — aba "Equipe") —
 * `<table>`/`<select>` crus trocados pelos primitivos `ui/table`
 * (`Table`/`TableRow`/`TableCell`...) e casca própria sem sombra, única
 * refatoração estrutural deliberada deste bloco (os dois primitivos
 * existiam desde o M6C-3 sem nenhum consumidor real). O mockup tem uma
 * coluna "Nome" que `ManagedUser` não tem (só `email`) — não inventada
 * aqui, a tabela usa e-mail como identificador, como sempre foi.
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
    <div>
      <form
        onSubmit={handleCreate}
        className="mb-3.5 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3.5"
      >
        <label htmlFor="newUserEmail" className="sr-only">
          E-mail
        </label>
        <Input
          id="newUserEmail"
          type="email"
          placeholder="E-mail"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          required
          className="h-[34px] min-w-[200px] flex-1 rounded-[9px] border-border bg-panel text-[13px]"
        />
        <label htmlFor="newUserPassword" className="sr-only">
          Senha provisória
        </label>
        <Input
          id="newUserPassword"
          type="text"
          placeholder="Senha provisória"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          minLength={8}
          required
          className="h-[34px] min-w-[180px] rounded-[9px] border-border bg-panel text-[13px]"
        />
        <label htmlFor="newUserRole" className="sr-only">
          Cargo
        </label>
        <select
          id="newUserRole"
          value={newRole}
          onChange={(event) => setNewRole(event.target.value as ManagedUserRole)}
          className={NATIVE_SELECT_CLASSES}
        >
          {ASSIGNABLE_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <Button type="submit" size="cta" className="shrink-0" disabled={creating}>
          {creating ? 'Criando…' : 'Criar usuário'}
        </Button>
        {createdNotice && <p className="w-full text-xs text-success">{createdNotice}</p>}
      </form>

      {/*
        Onda 1 do redesign (2026-08-22) — `panelError` sempre serviu a DOIS
        papeis (erro de carregamento inicial E erro de uma ação de linha,
        ex.: suspender/trocar cargo), e antes o banner aparecia sozinho
        acima da tabela em AMBOS os casos — numa falha de carregamento, a
        tabela renderizava vazia por baixo ("Nenhum usuário ainda."),
        contradizendo a mensagem de erro logo acima. Agora: falha no
        carregamento inicial (`users.length === 0`, nada real para mostrar)
        vira um `ErrorState` de verdade com retry (`load`); falha de uma
        AÇÃO sobre dados já carregados continua um banner discreto acima da
        tabela, que segue visível — é exatamente essa distinção que já
        existe em `TagsPanel.tsx`/`QuickRepliesPanel.tsx`, só que lá com dois
        estados de erro separados em vez de um só reaproveitado.
      */}
      {panelError && users.length > 0 && (
        <p className="mb-3.5 text-sm text-destructive">{panelError}</p>
      )}

      {loading ? (
        <div className="flex flex-col gap-0 overflow-hidden rounded-lg border border-border bg-card">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : panelError && users.length === 0 ? (
        <ErrorState description={panelError} onRetry={() => void load()} />
      ) : (
        /*
          SEM `overflow-x-auto` (auditoria 2026-08-22, achado real: comparar
          este primitivo contra a fonte oficial do shadcn/ui via MCP revelou
          um wrapper `overflow-auto` embutido — medido ao vivo, cortava o
          menu "..." de `RowActionsMenu` (`wrapperBottom: 498, menuBottom:
          524`). Corrigido no PRIMITIVO (`ui/table.tsx`) e aqui: mesma classe
          de bug, mesma causa raiz e mesma correção já aplicadas em
          `CampaignsPanel` (2026-08-18/21) — nenhum ancestral do menu declara
          `overflow` diferente de `visible`. `min-w` sem wrapper de rolagem:
          a página (`fx-scroll h-full overflow-y-auto` em `settings.tsx`) é
          quem rola, se algum dia a tabela precisar de mais espaço do que os
          840px do container.
        */
        <div className="rounded-lg border border-border bg-card">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">E-mail</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[90px] px-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} data-testid={`user-row-${user.email}`}>
                  <TableCell className="px-4 text-[13px] font-medium text-foreground">
                    {user.email}
                    {user.mustChangePassword && (
                      <span className="ml-2 inline-flex h-[19px] items-center rounded-[5px] bg-warning/[.13] px-1.5 text-[10.5px] font-semibold text-warning-emphasis">
                        senha provisória
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.role === 'owner' ? (
                      <span className="text-[13px] text-foreground-secondary">
                        {ROLE_LABELS.owner}
                      </span>
                    ) : (
                      <select
                        value={user.role}
                        onChange={(event) =>
                          void runRowAction(() =>
                            changeUserRole(user.id, event.target.value as ManagedUserRole),
                          )
                        }
                        className={cn(
                          'rounded-[7px] border border-transparent bg-transparent py-1 text-[13px] text-foreground-secondary transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                        aria-label={`Cargo de ${user.email}`}
                      >
                        {ASSIGNABLE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center gap-[5px] text-[11.5px] font-semibold',
                        user.status === 'active'
                          ? 'text-success-emphasis'
                          : 'text-destructive-emphasis',
                      )}
                    >
                      <span
                        className="h-[5px] w-[5px] shrink-0 rounded-full bg-current"
                        aria-hidden="true"
                      />
                      {user.status === 'active' ? 'Ativo' : 'Suspenso'}
                    </span>
                  </TableCell>
                  <TableCell className="px-4">
                    {user.role !== 'owner' &&
                      (resetUserId === user.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="text"
                            value={resetPassword}
                            onChange={(event) => setResetPassword(event.target.value)}
                            placeholder="Nova senha"
                            className="h-7 w-32 rounded-[7px] text-xs"
                            minLength={8}
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => void handleResetPassword(user.id)}
                          >
                            OK
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setResetUserId(null);
                              setResetPassword('');
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <RowActionsMenu
                          user={user}
                          onSuspend={() => void runRowAction(() => suspendUser(user.id))}
                          onReactivate={() => void runRowAction(() => reactivateUser(user.id))}
                          onResetPassword={() => setResetUserId(user.id)}
                        />
                      ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {users.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nenhum usuário ainda.</p>
          )}
          {nextCursor && (
            <div className="border-t border-border p-2.5">
              <button
                type="button"
                onClick={() => void loadMore()}
                className="h-8 w-full rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Carregar mais
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
