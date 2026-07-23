import type { GetServerSideProps } from 'next';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import CreateSessionForm from '@/components/CreateSessionForm';
import SessionListItem from '@/components/SessionListItem';
import { requireProtectedPageSession } from '@/lib/auth';
import { useSessionsList } from '@/hooks/useSessionsList';

interface HomeProps {
  tenantId: string;
}

/**
 * Lista de sessões do tenant (M2, Fase 4 — UI-1 + UI-3). Página protegida:
 * `getServerSideProps` exige uma sessão válida (`requirePageSession`, Fase
 * 4 sobre `readSessionFromRequest`, Fase 3) ANTES de renderizar qualquer
 * coisa — sem isso, um usuário sem cookie veria uma tela vazia em vez de
 * ser mandado para `/login` (a lista já viria vazia de qualquer rota BFF,
 * já que elas próprias exigem sessão, mas a UX correta é o redirect, não
 * um estado de erro silencioso).
 *
 * Os dados em si (`sessions`) vêm do `useSessionsList` (client-side, via
 * SSE) — `getServerSideProps` só resolve o `tenantId` para o `Header`,
 * nunca busca as sessões no servidor: mantém uma única fonte de dados
 * "viva" (o stream), em vez de um estado inicial de servidor que ficaria
 * dessincronizado até o primeiro tick do SSE substituí-lo.
 */
export const getServerSideProps: GetServerSideProps<HomeProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const session = guard.session;
  return { props: { tenantId: session.tenantId } };
};

export default function Home({ tenantId }: HomeProps): JSX.Element {
  const { sessions, loading, errorMessage, connected } = useSessionsList();

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex flex-col flex-1">
        <Header tenantId={tenantId} />
        <main className="flex-1 space-y-4 overflow-y-auto p-6">
          <CreateSessionForm />

          {!connected && <p className="text-sm text-yellow-700">Reconectando ao servidor…</p>}
          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

          {loading ? (
            <p className="text-sm text-gray-500">Carregando sessões…</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma sessão ainda. Crie uma acima.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sessions.map((session) => (
                <SessionListItem key={session.id} session={session} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
