import type { GetServerSideProps } from 'next';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AiProfilePanel from '@/components/AiProfilePanel';
import { requireProtectedPageSession } from '@/lib/auth';

interface AiProfilePageProps {
  tenantId: string;
}

/**
 * Página do "Cérebro da IA" (Base de Conhecimento, Nível 1). Guard em DUAS
 * camadas, igual a `/users`: (1) guard padrão de página protegida (login +
 * portão da senha provisória); (2) cargo — só administrator/owner entram
 * (demais e sessão de API key voltam para `/`). Isso é UX; a barreira real é a
 * API (requirePermission ai_profile:read/update).
 */
export const getServerSideProps: GetServerSideProps<AiProfilePageProps> = async (context) => {
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

export default function AiProfilePage({ tenantId }: AiProfilePageProps): JSX.Element {
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex flex-col flex-1">
        <Header tenantId={tenantId} />
        <main className="flex-1 space-y-4 overflow-y-auto p-6">
          <h1 className="text-xl font-bold text-gray-800">Cérebro da IA</h1>
          <AiProfilePanel />
        </main>
      </div>
    </div>
  );
}
