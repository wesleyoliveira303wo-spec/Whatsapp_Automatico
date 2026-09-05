import { useState, type FormEvent } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Loader2, ShieldCheck } from 'lucide-react';

import FrancisLogo from '@/components/brand/FrancisLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { readPlatformSessionFromRequest } from '@/lib/platformSession';
import { PlatformApiError, platformLogin } from '@/lib/platformClientApi';
import { pageTitle } from '@/lib/brand';

/**
 * Login do `/admin` — Fase 1 (`ADMIN_PLATFORM_MASTER_PLAN.md` §15).
 *
 * Deliberadamente austera, e sem nada do painel de marketing do login do
 * produto: esta tela não vende nada e não tem "criar conta", "esqueci a
 * senha" nem qualquer outro caminho — o único admin nasce por script
 * (`createPlatformUser.ts`). Menos superfície é o ponto, já que o `/admin`
 * fica publicamente alcançável (risco aceito em §4).
 *
 * Escura de forma fixa (`className="dark"` na raiz, mesmo mecanismo já usado
 * pelo login do produto): quem entra aqui precisa perceber, no primeiro
 * olhar, que NÃO está no painel de um cliente.
 */
export default function AdminLoginPage(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await platformLogin(email, password);
      await router.replace('/admin');
    } catch (caught) {
      setError(messageFor(caught));
      setSubmitting(false);
    }
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <Head>
        <title>{pageTitle('Painel da plataforma')}</title>
        {/* Um painel interno não tem por que aparecer em buscador nenhum. */}
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <FrancisLogo size={44} />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Painel da plataforma</h1>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Acesso restrito
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-lg"
          >
            <div className="space-y-1.5">
              <label htmlFor="admin-email" className="text-sm font-medium">
                E-mail
              </label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="text-sm font-medium">
                Senha
              </label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {/* `role="alert"` para o leitor de tela anunciar a falha sem
                depender de o foco cair no texto. */}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Entrando…
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

/**
 * Credencial errada nunca revela se o e-mail existe (a API já devolve a mesma
 * resposta nos dois casos; a tela não pode desfazer isso com um texto
 * diferente). A trava, sim, é dita com todas as letras — senão o fundador
 * acharia que esqueceu a própria senha.
 */
function messageFor(error: unknown): string {
  if (error instanceof PlatformApiError) {
    if (error.status === 401) return 'E-mail ou senha inválidos.';
    if (error.status === 423) {
      const retryAfterSeconds = (error.body as { retryAfterSeconds?: number } | undefined)
        ?.retryAfterSeconds;
      const minutos = retryAfterSeconds ? Math.max(1, Math.ceil(retryAfterSeconds / 60)) : null;
      return minutos
        ? `Muitas tentativas. Tente de novo em ${minutos} minuto${minutos > 1 ? 's' : ''}.`
        : 'Muitas tentativas. Tente de novo em instantes.';
    }
    if (error.status === 429) return 'Muitas tentativas. Tente de novo em instantes.';
  }
  return 'Não foi possível entrar. Tente de novo.';
}

/** Guarda invertida: quem já tem sessão de plataforma não vê o formulário. */
export const getServerSideProps: GetServerSideProps = async (context) => {
  if (readPlatformSessionFromRequest(context.req)) {
    return { redirect: { destination: '/admin', permanent: false } };
  }
  return { props: {} };
};
