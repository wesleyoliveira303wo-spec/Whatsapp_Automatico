import type { GetServerSideProps } from 'next';
import { useState, type FormEvent } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { requirePageSession } from '@/lib/auth';
import { changePassword, ClientApiError } from '@/lib/clientApi';
import { pageTitle } from '@/lib/brand';

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <Head>
        <title>{pageTitle('Trocar senha')}</title>
      </Head>
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold text-gray-800">Trocar senha</h1>

        {mustChange && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            Sua senha atual é provisória. Defina uma nova senha para continuar.
          </p>
        )}

        <div>
          <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-gray-700">
            Senha atual
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            autoComplete="current-password"
            required
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-gray-700">
            Nova senha
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-gray-700">
            Confirmar nova senha
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            autoComplete="new-password"
            required
          />
        </div>

        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {submitting ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  );
}
