import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { User, Mail, Lock, Building2, Eye, EyeOff, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { registerAccount, ClientApiError } from '@/lib/clientApi';

/** Mesma classe de `LoginForm.tsx` (`FIELD_CLASSNAME`) — as duas telas de autenticação usam campos idênticos (altura/raio), pedido do fundador: "use a mesma regra" no registro. */
const FIELD_CLASSNAME = 'h-11 rounded-[11px] text-[14px]';

/**
 * Registro self-service (Fase Auth/Registro, 2026-08-26): 4 campos — nome,
 * e-mail, senha, nome da empresa. Sucesso já autentica e leva ao onboarding
 * (Workspace, que hoje conduz a conectar o primeiro WhatsApp). Lógica de
 * submit 100% inalterada nesta rodada — só a casca visual muda.
 *
 * RECONSTRUÇÃO 2026-08-28 (pedido explícito do fundador: "a aba de registro
 * ainda é a antiga, use a mesma regra nela") — mesma linguagem visual de
 * `LoginForm` (cabeçalho com ícone, campos mais altos/arredondados, botão
 * cheio) para as duas telas de entrada nunca parecerem produtos diferentes.
 */
export default function RegisterForm(): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await registerAccount(name.trim(), email.trim(), password, companyName.trim());
      await router.push('/app');
    } catch (error) {
      if (error instanceof ClientApiError && error.status === 409) {
        setErrorMessage('Este e-mail já está em uso. Tente entrar ou use outro e-mail.');
      } else if (error instanceof ClientApiError && error.status === 422) {
        setErrorMessage('A senha deve ter pelo menos 8 caracteres.');
      } else {
        setErrorMessage('Não foi possível criar sua conta. Tente novamente.');
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-primary/30 bg-primary/15">
          <UserPlus className="h-5 w-5 text-primary" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-[21px] font-bold tracking-tight text-foreground">Criar sua conta</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Comece a atender pelo Francis em menos de um minuto.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-foreground-secondary">
          Nome
        </label>
        <div className="relative">
          <User
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Seu nome…"
            className={cn(FIELD_CLASSNAME, 'pl-10')}
            autoComplete="name"
            required
          />
        </div>
      </div>

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
            placeholder="voce@empresa.com"
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
            autoComplete="new-password"
            minLength={8}
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
        <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="companyName" className="text-sm font-medium text-foreground-secondary">
          Empresa
        </label>
        <div className="relative">
          <Building2
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="companyName"
            type="text"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="Nome do seu negócio…"
            className={cn(FIELD_CLASSNAME, 'pl-10')}
            required
          />
        </div>
      </div>

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
        {submitting ? 'Criando conta…' : 'Criar minha conta'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Já tem uma conta?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
