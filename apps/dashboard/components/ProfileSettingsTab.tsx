import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Loader2, LogOut, Pencil } from 'lucide-react';
import { useRouter } from 'next/router';
import { useMe } from '@/hooks/useMe';
import {
  fetchTenant,
  updateMyProfile,
  updateTenantName,
  logout,
  ClientApiError,
  type TenantPlan,
} from '@/lib/clientApi';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import EditableAvatar from '@/components/EditableAvatar';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import {
  WorkingHoursSection,
  BusinessSummarySection,
  useAllBusinessProfiles,
} from '@/components/BusinessOverviewSections';
import { fadeInUp, staggerContainer } from '@/lib/motion';
import { formatShortDate, formatDateTime } from '@/lib/formatters';

/**
 * Indicador de plano (2026-09-05). Rótulo e tom por plano — `free` sai em
 * tom neutro (é um estado válido, não um alerta) e os pagos em tom de marca.
 * `null` (não carregou / leitura falhou) não vira "Grátis" por engano: quem
 * decide o que está liberado é sempre a API, nunca esta tela.
 */
const PLAN_BADGE: Record<TenantPlan, { label: string; className: string }> = {
  free: { label: 'Grátis', className: 'bg-muted text-muted-foreground' },
  pro: { label: 'Pro', className: 'bg-primary/10 text-primary' },
  enterprise: { label: 'Enterprise', className: 'bg-success/10 text-success' },
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Dono',
  administrator: 'Administrador',
  manager: 'Gerente',
  operator: 'Operador',
  read_only: 'Somente leitura',
};

/** Um bloco de seção do Perfil — mesmo tratamento visual (cartão + título) nas 2 subseções. */
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
 * Aba "Perfil" (Reorganização Perfil/Configurações, 2026-08-27;
 * RECONSTRUÍDA na Auditoria do Perfil, 2026-08-28 — ver
 * `PERFIL_REDESIGN_PLAN.md`, pedido explícito do fundador). A pessoa +
 * a identidade comercial da empresa que ela representa — nunca
 * administração técnica do workspace (isso é Configurações). 5 subseções:
 *
 * - Minha conta: foto (upload real via `EditableAvatar`) + nome (editável,
 *   `PATCH /auth/me`) + e-mail/cargo (leitura) + membro desde/último acesso
 *   (leitura). O tema (claro/escuro) fica só na barra da esquerda —
 *   removido daqui (2026-08-28) para não ter dois controles da mesma coisa.
 * - Informações da empresa: nome comercial (`Tenant.name`, mesmo campo que
 *   morava em Configurações › Dados da empresa — SAIU de lá nesta rodada,
 *   pedido explícito do fundador, nunca duas telas salvando o mesmo campo).
 *   Editável só por quem tem `tenant:manage` (hoje owner) — `canManageCompany`.
 * - Horário de atendimento: LEITURA, por sessão de WhatsApp — editado só no
 *   Cérebro da IA (`WorkingHoursSection`, mesmo racional de
 *   `AtendimentoSettingsTab`: nunca duas telas salvando o mesmo horário).
 * - Sobre o negócio: resumo cacheado, gerado automaticamente quando o
 *   Cérebro da IA é salvo (`BusinessSummarySection`/`BusinessSummaryService`
 *   — nunca gerado aqui, só exibido).
 * - Segurança: botão que abre `ChangePasswordModal` (era um formulário
 *   sempre visível — pedido explícito do fundador: "não quero mais um
 *   formulário enorme de senha aparecendo permanentemente na página") + Sair.
 *
 * "Status" (sempre "Ativo" — quem está suspenso nunca chega a ver esta
 * tela) foi substituído por membro desde/último acesso, que de fato
 * agregam contexto.
 */
export default function ProfileSettingsTab({
  canManageCompany = false,
}: {
  /** `tenant:manage` — hoje só owner. Controla se o nome comercial é editável aqui. */
  canManageCompany?: boolean;
} = {}): JSX.Element | null {
  const router = useRouter();
  const { user } = useMe();
  const [companyName, setCompanyName] = useState<string | null>(null);
  // Indicador de plano (pedido do fundador, 2026-09-05): vem do MESMO
  // `GET /api/tenant` que já traz o nome — nenhuma requisição nova.
  const [plan, setPlan] = useState<TenantPlan | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
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

  // --- "Informações da empresa" (mudou de Configurações para cá, 2026-08-28) ---
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyNameDraft, setCompanyNameDraft] = useState('');
  const [companySubmitting, setCompanySubmitting] = useState(false);
  const [companyErrorMessage, setCompanyErrorMessage] = useState<string | null>(null);
  const [companySuccessMessage, setCompanySuccessMessage] = useState<string | null>(null);

  const businessProfiles = useAllBusinessProfiles();

  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
    }
  }, [user]);

  useEffect(() => {
    fetchTenant()
      .then(({ tenant }) => {
        setCompanyName(tenant.name);
        setCompanyNameDraft(tenant.name);
        setPlan(tenant.plan ?? null);
      })
      .catch(() => setCompanyName(null));
  }, []);

  async function handleSaveCompanyName(event: FormEvent): Promise<void> {
    event.preventDefault();
    setCompanyErrorMessage(null);
    setCompanySuccessMessage(null);
    if (companyNameDraft.trim() === '') return;

    setCompanySubmitting(true);
    try {
      const { tenant } = await updateTenantName(companyNameDraft.trim());
      setCompanyName(tenant.name);
      setCompanyNameDraft(tenant.name);
      setCompanySuccessMessage('Nome da empresa atualizado.');
      setEditingCompany(false);
    } catch (error) {
      setCompanyErrorMessage(
        error instanceof ClientApiError && error.status === 403
          ? 'Só o dono da conta pode alterar o nome da empresa.'
          : 'Não foi possível salvar. Tente novamente.',
      );
    } finally {
      setCompanySubmitting(false);
    }
  }

  async function handleSaveProfile(event: FormEvent): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setSubmitting(true);
    try {
      const { user: updated } = await updateMyProfile({ name });
      setSavedName(updated.name ?? '');
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

  /**
   * Upload de foto (`EditableAvatar`) salva SOZINHO, assim que o arquivo é
   * processado — independente do formulário de nome (`editing`) e do botão
   * "Salvar" dele. Erros de rede/API aqui viram o mesmo texto de erro
   * genérico do formulário; `EditableAvatar` é quem exibe (estado dele, não
   * deste componente — ver docstring lá).
   */
  async function handleAvatarChange(dataUrl: string): Promise<void> {
    try {
      const { user: updated } = await updateMyProfile({ avatarUrl: dataUrl });
      setSavedAvatarUrl(updated.avatarUrl ?? '');
    } catch (error) {
      // `EditableAvatar` exibe `error.message` — mensagens específicas por
      // tipo de falha, mesmo padrão de `handleSaveProfile` acima.
      throw new Error(
        error instanceof ClientApiError
          ? 'Não foi possível salvar. Tente novamente.'
          : 'Não foi possível salvar. Verifique sua conexão.',
      );
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
          <EditableAvatar
            email={user.email}
            name={displayName}
            avatarUrl={displayAvatarUrl}
            onChange={handleAvatarChange}
          />
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{displayName || user.email}</p>
            <p className="truncate text-sm text-muted-foreground">
              {ROLE_LABELS[user.role] ?? user.role}
            </p>
          </div>
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto shrink-0"
              onClick={() => setEditing(true)}
              aria-label="Editar nome"
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
                placeholder="Seu nome…"
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

        {user.mustChangePassword && (
          <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2.5 text-sm text-warning">
            Senha provisória pendente — troque-a na seção Segurança abaixo.
          </p>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="mt-0.5 truncate text-foreground">{user.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Último acesso</dt>
            <dd className="mt-0.5 text-foreground">{formatDateTime(user.lastLoginAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Membro desde</dt>
            <dd className="mt-0.5 text-foreground">{formatShortDate(user.createdAt)}</dd>
          </div>
        </dl>
      </ProfileSection>

      <ProfileSection title="Informações da empresa">
        {editingCompany ? (
          <form onSubmit={handleSaveCompanyName} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="companyName" className="text-sm font-medium text-foreground">
                Nome comercial
              </label>
              <Input
                id="companyName"
                name="organization"
                autoComplete="organization"
                value={companyNameDraft}
                onChange={(event) => setCompanyNameDraft(event.target.value)}
                required
              />
            </div>
            {companyErrorMessage && (
              <p
                role="alert"
                aria-live="polite"
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
              >
                {companyErrorMessage}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={companySubmitting}>
                {companySubmitting && (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                )}
                {companySubmitting ? 'Salvando…' : 'Salvar'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingCompany(false);
                  setCompanyNameDraft(companyName ?? '');
                  setCompanyErrorMessage(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Nome comercial</p>
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate font-medium text-foreground">{companyName ?? '—'}</p>
                {plan && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PLAN_BADGE[plan].className}`}
                    title={`Esta empresa está no plano ${PLAN_BADGE[plan].label}`}
                  >
                    {PLAN_BADGE[plan].label}
                  </span>
                )}
              </div>
            </div>
            {canManageCompany && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setEditingCompany(true)}
                aria-label="Editar nome comercial"
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Editar
              </Button>
            )}
          </div>
        )}
        {!editingCompany && !canManageCompany && (
          <p className="mt-2 text-xs text-muted-foreground">
            Só o dono da conta pode alterar o nome da empresa.
          </p>
        )}
        {!editingCompany && companySuccessMessage && (
          <p
            role="status"
            aria-live="polite"
            className="mt-4 rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 text-sm text-success"
          >
            {companySuccessMessage}
          </p>
        )}
      </ProfileSection>

      <ProfileSection
        title="Horário de atendimento"
        description="Definido no Cérebro da IA de cada WhatsApp — aqui é só leitura."
      >
        <WorkingHoursSection {...businessProfiles} />
      </ProfileSection>

      <ProfileSection
        title="Sobre o negócio"
        description="Resumo gerado automaticamente a partir do que está configurado no Cérebro da IA."
      >
        <BusinessSummarySection {...businessProfiles} />
      </ProfileSection>

      <ProfileSection title="Segurança" description="Gerencie a segurança da sua conta.">
        {passwordMessage && (
          <p
            role="status"
            aria-live="polite"
            className="mb-4 rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 text-sm text-success"
          >
            {passwordMessage}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <ChangePasswordModal onSuccess={() => setPasswordMessage('Senha atualizada.')} />
          <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Sair
          </Button>
        </div>
      </ProfileSection>
    </motion.div>
  );
}
