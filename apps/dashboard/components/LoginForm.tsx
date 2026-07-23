import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { login, loginWithPassword, ClientApiError } from '@/lib/clientApi';

type LoginMode = 'user' | 'apiKey';

/**
 * Formulário de login do Dashboard. A partir do M5F-2 tem DOIS modos:
 *
 * - PESSOA (padrão): e-mail + senha — a conta criada pelo RH (M5E). Se a
 *   senha é provisória (`mustChangePassword`), vai direto para
 *   `/change-password` antes de qualquer outra tela.
 * - API KEY (alternativo): o modo original da M2 (`tenantId` + API key de
 *   longo prazo), mantido para operação/integração — nada quebrou.
 */
export default function LoginForm(): JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('user');
  const [tenantId, setTenantId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      if (mode === 'user') {
        const result = await loginWithPassword(tenantId.trim(), email.trim(), password);
        await router.push(result.user.mustChangePassword ? '/change-password' : '/');
        return;
      }
      await login(tenantId.trim(), apiKey.trim());
      await router.push('/');
    } catch (error) {
      if (error instanceof ClientApiError && error.status === 401) {
        setErrorMessage(mode === 'user' ? 'E-mail ou senha inválidos.' : 'tenantId ou API Key inválidos.');
      } else {
        setErrorMessage('Não foi possível entrar. Tente novamente.');
      }
      setSubmitting(false);
    }
  }

  function toggleMode(): void {
    setMode((current) => (current === 'user' ? 'apiKey' : 'user'));
    setErrorMessage(null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-gray-800">Entrar no Dashboard</h1>

      <div>
        <label htmlFor="tenantId" className="mb-1 block text-sm font-medium text-gray-700">
          Tenant ID
        </label>
        <input
          id="tenantId"
          type="text"
          value={tenantId}
          onChange={(event) => setTenantId(event.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          required
        />
      </div>

      {mode === 'user' ? (
        <>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              autoComplete="current-password"
              required
            />
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="apiKey" className="mb-1 block text-sm font-medium text-gray-700">
            API Key
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            required
          />
        </div>
      )}

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {submitting ? 'Entrando…' : 'Entrar'}
      </button>

      <button type="button" onClick={toggleMode} className="text-sm text-blue-600 hover:underline">
        {mode === 'user' ? 'Entrar com API Key' : 'Entrar com e-mail e senha'}
      </button>
    </form>
  );
}
