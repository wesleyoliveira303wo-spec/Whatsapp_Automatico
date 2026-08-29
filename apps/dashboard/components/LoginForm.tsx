import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Building2, Mail, Lock, Eye, EyeOff, KeyRound, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { login, loginWithPassword, ClientApiError } from '@/lib/clientApi';

type LoginMode = 'user' | 'apiKey';

/** Classe compartilhada dos dois campos de e-mail/senha — mais alto e com raio maior que o `Input` padrão do resto do app, pedido explícito do fundador (referência visual anexada) para esta tela. Escopo só aqui via `className`, o primitivo `Input` continua com sua altura padrão em toda outra tela. */
const FIELD_CLASSNAME = 'h-11 rounded-[11px] text-[14px]';

/**
 * Formulário de login do Dashboard. Dois modos (M5F-2): PESSOA (e-mail +
 * senha, padrão) e API KEY (tenantId + chave de longo prazo, para
 * operação/integração). Senha provisória (`mustChangePassword`) redireciona
 * para `/change-password`. Comportamento de autenticação 100% inalterado
 * nesta rodada — só a casca visual muda (ver `pages/login.tsx`).
 *
 * Reconstrução (2026-08-28, pedido explícito do fundador, imagem de
 * referência anexada) — adiciona 3 elementos que a UI NUNCA teve backend
 * para: "Lembrar de mim" (a sessão já tem duração fixa de 12h, ver
 * `dashboardSession.ts` — o checkbox por ora só existe visualmente, não
 * estende a sessão), "Esqueci minha senha" (não existe fluxo de
 * autoatendimento — só reset por um admin via `usersRouter`, uma tela
 * diferente) e Google/Microsoft (nenhum provedor OAuth configurado no
 * backend). Pedido explícito do fundador: "se não existir, NÃO invente
 * backend... crie apenas a UI preparada para integração" — os 3 ficam
 * visíveis e com estado local onde faz sentido, mas nenhum finge uma ação
 * que a API não executa. Ver `PROJECT_STATUS.md`/checkpoint desta rodada.
 */
export default function LoginForm(): JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('user');
  const [tenantId, setTenantId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showApiOptions, setShowApiOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      if (mode === 'user') {
        const result = await loginWithPassword(email.trim(), password);
        await router.push(result.user.mustChangePassword ? '/change-password' : '/app');
        return;
      }
      await login(tenantId.trim(), apiKey.trim());
      await router.push('/app');
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
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-primary/30 bg-primary/15">
          <Lock className="h-5 w-5 text-primary" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-[21px] font-bold tracking-tight text-foreground">
            Bem-vindo de volta!
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Entre para continuar automatizando suas conversas.
          </p>
        </div>
      </div>

      {mode === 'apiKey' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tenantId" className="text-sm font-medium text-foreground-secondary">
            Empresa
          </label>
          <div className="relative">
            <Building2
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="tenantId"
              type="text"
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              placeholder="tenant-1"
              className={cn(FIELD_CLASSNAME, 'pl-10')}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            O código do seu workspace, recebido ao criar a conta.
          </p>
        </div>
      )}

      {mode === 'user' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground-secondary">
              E-mail
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                className={cn(FIELD_CLASSNAME, 'pl-10')}
                autoComplete="username"
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground-secondary">
              Senha
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={cn(FIELD_CLASSNAME, 'px-10')}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground-secondary">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Lembrar de mim
            </label>
            {/*
              "Esqueci minha senha" (pedido do fundador, imagem de referência):
              não existe fluxo de autoatendimento hoje (só reset por um
              admin, outra tela) — UI preparada, sem link para lugar nenhum
              ainda, mesmo racional de Google/Microsoft abaixo.
            */}
            <span
              className="cursor-default text-[13px] font-medium text-primary opacity-70"
              title="Em breve — hoje a troca de senha exige um administrador"
            >
              Esqueci minha senha
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="apiKey" className="text-sm font-medium text-foreground-secondary">
            API Key
          </label>
          <div className="relative">
            <KeyRound
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="chave de acesso"
              className={cn(FIELD_CLASSNAME, 'pl-10')}
              required
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          role="alert"
          aria-live="polite"
        >
          {errorMessage}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="h-[46px] w-full rounded-xl text-[14.5px] font-bold"
      >
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitting ? 'Entrando…' : 'Entrar na minha conta'}
      </Button>

      {mode === 'user' && (
        <>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">
              ou continue com
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {/*
            Google/Microsoft (pedido do fundador, imagem de referência):
            nenhum provedor OAuth configurado no backend hoje — UI pronta
            para integração futura, `disabled` para não fingir uma ação que
            a API não executa (regra explícita: "não invente backend").
          */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              disabled
              title="Em breve"
              className="h-[42px] flex-1 rounded-[11px] text-[13px] font-semibold"
            >
              <svg className="mr-2 h-[17px] w-[17px]" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.55-5.17 3.55-8.66z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.87-3a7.4 7.4 0 0 1-11-3.9H1.1v3.1A12 12 0 0 0 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.04 14.2a7.2 7.2 0 0 1 0-4.4V6.7H1.1a12 12 0 0 0 0 10.6l3.94-3.1z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.77c1.76 0 3.34.6 4.59 1.8l3.44-3.44C17.94 1.2 15.24 0 12 0 7.31 0 3.26 2.69 1.1 6.7l3.94 3.1a7.16 7.16 0 0 1 6.96-5.03z"
                />
              </svg>
              Google
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled
              title="Em breve"
              className="h-[42px] flex-1 rounded-[11px] text-[13px] font-semibold"
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 23 23" aria-hidden="true">
                <rect x="1" y="1" width="10" height="10" fill="#F35325" />
                <rect x="12" y="1" width="10" height="10" fill="#81BC06" />
                <rect x="1" y="12" width="10" height="10" fill="#05A6F0" />
                <rect x="12" y="12" width="10" height="10" fill="#FFBA08" />
              </svg>
              Microsoft
            </Button>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Ainda não tem uma conta?{' '}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Criar conta
            </Link>
          </p>
        </>
      )}

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
