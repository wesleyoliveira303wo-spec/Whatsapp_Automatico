import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { requirePageSession } from '@/lib/auth';
import { BRAND, pageTitle } from '@/lib/brand';
import FrancisLogo from '@/components/brand/FrancisLogo';
import ChangePasswordForm from '@/components/ChangePasswordForm';

interface ChangePasswordPageProps {
  mustChange: boolean;
}

/**
 * Troca da própria senha (Milestone 5, Bloco M5F-2). Dois usos:
 * - OBRIGATÓRIO: primeira entrada com senha provisória (`mustChangePassword`)
 *   — o guard das páginas protegidas manda para cá e não deixa sair.
 * - VOLUNTÁRIO: o usuário quer trocar a senha a qualquer momento (também
 *   acessível pela aba Segurança do Perfil, `ChangePasswordForm` reaproveitado
 *   — Reorganização Perfil/Configurações, 2026-08-27).
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

export default function ChangePasswordPage({ mustChange }: ChangePasswordPageProps): JSX.Element {
  const router = useRouter();

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

        <div className="rounded-2xl border border-border bg-card p-7 shadow-lg sm:p-8">
          <h1 className="mb-5 text-xl font-semibold tracking-tight text-foreground">
            Trocar senha
          </h1>
          <ChangePasswordForm mustChange={mustChange} onSuccess={() => void router.push('/')} />
        </div>
      </div>
    </div>
  );
}
