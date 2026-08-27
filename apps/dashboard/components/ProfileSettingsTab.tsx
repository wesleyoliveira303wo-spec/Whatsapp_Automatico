import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Loader2, LogOut, Pencil } from 'lucide-react';
import { useRouter } from 'next/router';
import { useMe } from '@/hooks/useMe';
import { fetchTenant, updateMyProfile, logout, ClientApiError } from '@/lib/clientApi';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import UserAvatar from '@/components/UserAvatar';
import ChangePasswordForm from '@/components/ChangePasswordForm';
import ThemeToggle from '@/components/ThemeToggle';
import { fadeInUp, staggerContainer } from '@/lib/motion';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Dono',
  administrator: 'Administrador',
  manager: 'Gerente',
  operator: 'Operador',
  read_only: 'Somente leitura',
};

/** Um bloco de seção do Perfil — mesmo tratamento visual (cartão + título) nas 3 subseções. */
function ProfileSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <motion.section
      variants={fadeInUp}
      className="rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}

/**
 * Aba "Perfil" de Configurações (Reorganização Perfil/Configurações,
 * 2026-08-27) — a pessoa, não o workspace. Três subseções, conforme
 * auditoria (só o que o backend de fato suporta):
 *
 * - Minha conta: nome/foto (editável, `PATCH /auth/me`) + e-mail/cargo/
 *   empresa/status (somente leitura — identidade e RBAC não se editam
 *   aqui, isso é `UserManagementService`/RH).
 * - Segurança: `ChangePasswordForm` reaproveitado (mesma lógica de
 *   `/change-password`) + Sair.
 * - Preferências: tema (`ThemeToggle`, já existente — por navegador, não
 *   por conta, ver auditoria). Notificações NÃO existem no backend hoje —
 *   não inventadas aqui.
 *
 * A seção "Empresa" que existia aqui SAIU na Reestruturação de
 * Configurações, Fase 4 (2026-08-27): o nome do tenant é dado da EMPRESA,
 * não da pessoa, e agora vive em Configurações › Dados da empresa. Mantê-lo
 * nos dois lugares criaria duas telas salvando o mesmo campo. O nome da
 * empresa continua VISÍVEL aqui (linha "Cargo · Empresa"), como contexto de
 * leitura — só não é editável por aqui.
 *
 * `canManageCompany` continua no contrato (opcional, sem uso interno) para
 * não quebrar chamadores; será removido quando não houver mais nenhum.
 */
export default function ProfileSettingsTab(_props: {
  /** @deprecated Fase 4 (2026-08-27) — a edição do nome da empresa migrou para Configurações › Dados da empresa. */
  canManageCompany?: boolean;
} = {}): JSX.Element | null {
  const router = useRouter();
  const { user } = useMe();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  /**
   * `useMe()` busca uma vez por montagem e não recarrega sozinho — sem
   * isto, salvar o nome mostraria "Perfil atualizado." mas o cabeçalho
   * (nome/avatar) continuaria com o valor ANTIGO até um F5 (achado real,
   * testado manualmente nesta sessão). Sobrepõe a exibição com o que a API
   * de fato confirmou salvar — `undefined` = ainda não editou, usa `user`.
   */
  const [savedName, setSavedName] = useState<string | undefined>(undefined);
  const [savedAvatarUrl, setSavedAvatarUrl] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setAvatarUrl(user.avatarUrl ?? '');
    }
  }, [user]);

  useEffect(() => {
    fetchTenant()
      .then(({ tenant }) => setCompanyName(tenant.name))
      .catch(() => setCompanyName(null));
  }, []);

  async function handleSaveProfile(event: FormEvent): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setSubmitting(true);
    try {
      const { user: updated } = await updateMyProfile({ name, avatarUrl });
      setSavedName(updated.name ?? '');
      setSavedAvatarUrl(updated.avatarUrl ?? '');
      setSuccessMessage('Perfil atualizado.');
      setEditing(false);
    } catch (error) {
      setErrorMessage(
        error instanceof ClientApiError
          ? 'Não foi possível salvar. Tente novamente.'
          : 'Não foi possível salvar. Verifique sua conexão.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout(): Promise<void> {
    await logout();
    await router.push('/login');
  }

  if (user === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }
  if (!user) {
    return null;
  }

  const displayName = savedName !== undefined ? savedName : user.name;
  const displayAvatarUrl = savedAvatarUrl !== undefined ? savedAvatarUrl : user.avatarUrl;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex max-w-xl flex-col gap-5"
    >
      <ProfileSection title="Minha conta">
        <div className="flex items-center gap-4">
          <UserAvatar
            email={user.email}
            name={displayName}
            avatarUrl={displayAvatarUrl}
            className="h-14 w-14 text-base"
          />
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{displayName || user.email}</p>
            <p className="truncate text-sm text-muted-foreground">
              {ROLE_LABELS[user.role] ?? user.role}
              {companyName && ` · ${companyName}`}
            </p>
          </div>
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto shrink-0"
              onClick={() => setEditing(true)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Editar
            </Button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSaveProfile} className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profileName" className="text-sm font-medium text-foreground">
                Nome
              </label>
              <Input
                id="profileName"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Seu nome"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profileAvatarUrl" className="text-sm font-medium text-foreground">
                URL da foto
              </label>
              <Input
                id="profileAvatarUrl"
                name="avatarUrl"
                type="url"
                autoComplete="photo"
                spellCheck={false}
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://…"
              />
            </div>
            {errorMessage && (
              <p
                role="alert"
                aria-live="polite"
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
              >
                {errorMessage}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {submitting ? 'Salvando…' : 'Salvar'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setName(user.name ?? '');
                  setAvatarUrl(user.avatarUrl ?? '');
                  setErrorMessage(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          successMessage && (
            <p
              role="status"
              aria-live="polite"
              className="mt-4 rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 text-sm text-success"
            >
              {successMessage}
            </p>
          )
        )}

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="mt-0.5 truncate text-foreground">{user.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="mt-0.5 text-foreground">
              {user.mustChangePassword ? 'Senha provisória pendente' : 'Ativo'}
            </dd>
          </div>
        </dl>
      </ProfileSection>

      <ProfileSection title="Segurança" description="Troque sua senha ou saia da conta.">
        {passwordMessage && (
          <p
            role="status"
            aria-live="polite"
            className="mb-4 rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 text-sm text-success"
          >
            {passwordMessage}
          </p>
        )}
        <ChangePasswordForm onSuccess={() => setPasswordMessage('Senha atualizada.')} />
        <div className="mt-5 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Sair
          </Button>
        </div>
      </ProfileSection>


      <ProfileSection title="Preferências" description="Aparência do Dashboard, neste navegador.">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">Tema escuro</span>
          <ThemeToggle />
        </div>
      </ProfileSection>
    </motion.div>
  );
}
