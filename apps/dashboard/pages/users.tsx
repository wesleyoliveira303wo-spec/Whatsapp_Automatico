import type { GetServerSideProps } from 'next';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import UserManagementPanel from '@/components/UserManagementPanel';
import { requireProtectedPageSession } from '@/lib/auth';

interface UsersPageProps {
  tenantId: string;
}

/**
 * Pagina de gestao de usuarios (Milestone 5, Bloco M5F-3 — o RH visivel).
 * Guard em DUAS camadas: (1) o guard padrao de pagina protegida (login +
 * portao da senha provisoria); (2) cargo — so administrator/owner entram
 * (operator/read_only e sessao de API key voltam para `/`). Lembrando: isso
 * e UX; a barreira real e a API (requirePermission + human-only, M5E-3).
 */
export const getServerSideProps: GetServerSideProps<UsersPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const { session } = guard;
  const role = session.user?.role;
  if (role !== 'administrator' && role !== 'owner') {
    return { redirect: { destination: '/', permanent: false } };
  }
  return { props: { tenantId: session.tenantId } };
};

export default function UsersPage({ tenantId }: UsersPageProps): JSX.Element {
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex flex-col flex-1">
        <Header tenantId={tenantId} />
        <main className="flex-1 space-y-4 overflow-y-auto p-6">
          <h1 className="text-xl font-bold text-gray-800">Usuários</h1>
          <UserManagementPanel />
        </main>
      </div>
    </div>
  );
}
