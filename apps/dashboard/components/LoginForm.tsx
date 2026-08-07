import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { Building2, Mail, Lock, Eye, EyeOff, KeyRound, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { login, loginWithPassword, ClientApiError } from '@/lib/clientApi';

type LoginMode = 'user' | 'apiKey';

/**
 * Formulário de login do Dashboard. Dois modos (M5F-2): PESSOA (e-mail +
 * senha, padrão) e API KEY (tenantId + chave de longo prazo, para
 * operação/integração). Senha provisória (`mustChangePassword`) redireciona
 * para `/change-password`.
 *
 * Milestone 6, Bloco M6F (revisão de Product Design): campos com ícone,
 * mostrar/ocultar senha, spinner no botão, campo "Empresa" com texto
 * auxiliar (antes "Identificação da empresa", que gerava dúvida), e o acesso
 * por API Key recolhido num toggle discreto ("Outras formas de acesso") para
 * não competir com o login principal. Comportamento (validação, redirect)
 * 100% inalterado.
 */
export default function LoginForm(): JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('user');
  const [tenantId, setTenantId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showApiOptions, setShowApiOptions] = useState(false);
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
        setErrorMessage(
          mode === 'user' ? 'E-mail ou senha inválidos.' : 'Empresa ou API Key inválidas.',
        );
      } else {
        setErrorMessage('Não foi possível entrar. Tente novamente.');
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Bem-vindo de volta
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Entre para continuar atendendo pelo Francis.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tenantId" className="text-sm font-medium text-foreground">
          Empresa
        </label>
        <div className="relative">
          <Building2
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="tenantId"
            type="text"
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            placeholder="tenant-1"
            className="pl-9"
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          O código do seu workspace, recebido ao criar a conta.
        </p>
      </div>

      {mode === 'user' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              E-mail
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@empresa.com"
                className="pl-9"
                autoComplete="username"
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Senha
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="px-9"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="apiKey" className="text-sm font-medium text-foreground">
            API Key
          </label>
          <div className="relative">
            <KeyRound
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="chave de acesso"
              className="pl-9"
              required
            />
          </div>
        </div>
      )}

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
        {submitting ? 'Entrando…' : 'Entrar'}
      </Button>

      {/* Acesso por API Key — recolhido, discreto, sem competir com o login principal */}
      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setShowApiOptions((v) => !v)}
          className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={showApiOptions}
        >
          Outras formas de acesso
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', showApiOptions && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
        {showApiOptions && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setMode((current) => (current === 'user' ? 'apiKey' : 'user'));
                setErrorMessage(null);
              }}
              className="text-sm text-primary transition-colors hover:underline"
            >
              {mode === 'user' ? 'Entrar com API Key (integração)' : 'Voltar para e-mail e senha'}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
