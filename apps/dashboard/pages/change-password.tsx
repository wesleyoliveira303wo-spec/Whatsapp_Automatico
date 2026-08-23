import type { GetServerSideProps } from 'next';
import { useState, type FormEvent } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { requirePageSession } from '@/lib/auth';
import { changePassword, ClientApiError } from '@/lib/clientApi';
import { BRAND, pageTitle } from '@/lib/brand';
import FrancisLogo from '@/components/brand/FrancisLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ChangePasswordPageProps {
  mustChange: boolean;
}

/**
 * Troca da própria senha (Milestone 5, Bloco M5F-2). Dois usos:
 * - OBRIGATÓRIO: primeira entrada com senha provisória (`mustChangePassword`)
 *   — o guard das páginas protegidas manda para cá e não deixa sair.
 * - VOLUNTÁRIO: o usuário quer trocar a senha a qualquer momento.
 *
 * Sessão de API key não tem senha — redireciona para `/`.
 *
 * Onda 3 do redesign (2026-08-23) — até esta rodada, esta era a ÚNICA tela
 * do produto inteiro fora do Design System: `bg-gray-100`/`border-gray-200`/
 * `focus:border-blue-500` (azul, num produto verde) e `<input>` cru — 9
 * classes fora de token, confirmado por auditoria. Reescrita reaproveitando
 * `Input`/`Button` (mesmos primitivos de `LoginForm.tsx`) e o mesmo padrão
 * de card (`bg-muted/30` + card branco com sombra) da tela de login — é a
 * tela mais parecida em propósito (formulário centralizado, sem navegação),
 * então herda a mesma casca em vez de inventar uma terceira.
 */
export const getServerSideProps: GetServerSideProps<ChangePasswordPageProps> = async (context) => {
  const session = requirePageSession(context);
  if (!session) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  if (!session.user) {
    return { redirect: { destination: '/', permanent: false } };
  }
  return { props: { mustChange: session.user.mustChangePassword } };
};

const MIN_PASSWORD_LENGTH = 8;

export default function ChangePasswordPage({ mustChange }: ChangePasswordPageProps): JSX.Element {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('A confirmação não confere com a nova senha.');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      await router.push('/');
    } catch (error) {
      if (error instanceof ClientApiError && error.status === 401) {
        setErrorMessage('Senha atual incorreta.');
      } else if (error instanceof ClientApiError && error.status === 422) {
        setErrorMessage(`A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      } else {
        setErrorMessage('Não foi possível trocar a senha. Tente novamente.');
      }
      setSubmitting(false);
    }
  }

  const passwordFieldType = showPasswords ? 'text' : 'password';

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Head>
        <title>{pageTitle('Trocar senha')}</title>
      </Head>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <FrancisLogo size={32} />
          <span className="text-base font-medium text-foreground">{BRAND.name}</span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-7 shadow-lg sm:p-8"
        >
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Trocar senha</h1>
            {mustChange && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Sua senha atual é provisória. Defina uma nova senha para continuar.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="currentPassword" className="text-sm font-medium text-foreground">
              Senha atual
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="currentPassword"
                type={passwordFieldType}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="pl-9"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="newPassword" className="text-sm font-medium text-foreground">
              Nova senha
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="newPassword"
                type={passwordFieldType}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="px-9"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPasswords((current) => !current)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}
              >
                {showPasswords ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
              Confirmar nova senha
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="confirmPassword"
                type={passwordFieldType}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="pl-9"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          {errorMessage && (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
            </p>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {submitting ? 'Salvando…' : 'Salvar nova senha'}
          </Button>
        </form>
      </div>
    </div>
  );
}
