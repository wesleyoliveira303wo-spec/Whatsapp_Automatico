import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import RegisterForm from '@/components/RegisterForm';
import FrancisLogo from '@/components/brand/FrancisLogo';
import AuthMarketingPanel from '@/components/brand/AuthMarketingPanel';
import AuthFooter from '@/components/brand/AuthFooter';
import { requirePageSession } from '@/lib/auth';
import { BRAND, pageTitle } from '@/lib/brand';

/**
 * Página de registro self-service (Fase Auth/Registro, 2026-08-26). Guard
 * INVERTIDO: sessão válida no cookie redireciona para `/` (não faz sentido
 * registrar de novo já logado).
 *
 * RECONSTRUÇÃO 2026-08-28 (pedido explícito do fundador: "a aba de registro
 * ainda é a antiga, use a mesma regra nela") — mesma casca de
 * `pages/login.tsx` (split-screen escuro, `AuthMarketingPanel`/`AuthFooter`
 * compartilhados) para as duas telas de entrada nunca divergirem. Só o
 * formulário à direita muda (`RegisterForm`, 4 campos).
 */
interface RegisterPageProps {
  currentYear: number;
}

export const getServerSideProps: GetServerSideProps<RegisterPageProps> = async (context) => {
  const session = requirePageSession(context);
  if (session) {
    return { redirect: { destination: '/app', permanent: false } };
  }
  return { props: { currentYear: new Date().getFullYear() } };
};

export default function RegisterPage({ currentYear }: RegisterPageProps): JSX.Element {
  return (
    <div className="dark flex min-h-screen flex-col bg-background text-foreground">
      <Head>
        <title>{pageTitle('Criar conta')}</title>
      </Head>

      <div className="flex flex-1 flex-col lg:flex-row">
        <AuthMarketingPanel />

        {/* Sem `overflow-y-auto` aqui, sem `items-start`/`min-h-screen` (ver
            `pages/login.tsx`, 4ª/5ª rodadas) — numa viewport baixa é a
            PÁGINA que rola, e o card usa `sticky` pra ficar centralizado na
            viewport durante toda a rolagem, sem nunca sair de vista. */}
        <main className="flex flex-1 items-center justify-center p-6 lg:block lg:px-12 lg:py-8">
          {/* `lg:mx-auto` — ver `pages/login.tsx` (6ª rodada): `justify-center`
              do flex parou de valer quando `<main>` virou `lg:block` (pro
              `sticky` funcionar), deixando o card colado à esquerda com um
              vão vazio à direita. */}
          <div className="w-full max-w-[420px] lg:sticky lg:top-1/2 lg:mx-auto lg:-translate-y-1/2 lg:-mt-3">
            <div className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
              <FrancisLogo size={40} />
              <span className="text-lg font-semibold text-foreground">{BRAND.name}</span>
            </div>
            <div className="animate-in fade-in slide-in-from-bottom-2 rounded-[22px] border border-border bg-white/[0.015] p-7 duration-500 sm:p-8">
              <RegisterForm />
            </div>
          </div>
        </main>
      </div>

      <AuthFooter currentYear={currentYear} />
    </div>
  );
}
