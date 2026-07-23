import type { GetServerSideProps } from 'next';
import LoginForm from '@/components/LoginForm';
import { requirePageSession } from '@/lib/auth';

/**
 * Página de login (M2, Fase 4). Pública por natureza, mas com um guard
 * INVERTIDO em relação às páginas protegidas (`pages/index.tsx`,
 * `pages/sessions/[sessionName].tsx`): se já existe uma sessão válida no
 * cookie, redireciona direto para `/` — evita mostrar o formulário de
 * login a quem já está autenticado (ex.: usuário volta no navegador após
 * logar).
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = requirePageSession(context);
  if (session) {
    return { redirect: { destination: '/', permanent: false } };
  }
  return { props: {} };
};

export default function LoginPage(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <LoginForm />
    </div>
  );
}
