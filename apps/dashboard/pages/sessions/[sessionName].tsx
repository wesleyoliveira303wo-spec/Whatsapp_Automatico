import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import StatusBadge from '@/components/StatusBadge';
import QRCodeCard from '@/components/QRCodeCard';
import SessionActions from '@/components/SessionActions';
import HistoryList from '@/components/HistoryList';
import { requireProtectedPageSession } from '@/lib/auth';
import { useSessionDetail } from '@/hooks/useSessionDetail';
import { formatDateTime } from '@/lib/formatters';

interface SessionDetailPageProps {
  tenantId: string;
  sessionName: string;
}

/**
 * Detalhe de uma sessão (M2, Fase 4 — UI-2 + UI-3 + UI-4). Mesmo padrão de
 * guard de `pages/index.tsx`: `getServerSideProps` exige sessão válida.
 * `sessionName` vem de `context.params` (rota dinâmica do Pages Router,
 * `[sessionName].tsx`) — já é uma `string` no servidor (Next garante isso
 * para segmentos não catch-all), diferente de `router.query.sessionName`
 * no cliente, que só existe DEPOIS da hidratação (por isso os hooks
 * client-side, ex. `useSessionDetail`, aceitam `string | null`).
 */
export const getServerSideProps: GetServerSideProps<SessionDetailPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const session = guard.session;
  const sessionName = context.params?.sessionName;
  if (typeof sessionName !== 'string') {
    return { notFound: true };
  }
  return { props: { tenantId: session.tenantId, sessionName } };
};

export default function SessionDetailPage({ tenantId, sessionName }: SessionDetailPageProps): JSX.Element {
  const { session, loading, errorMessage, connected } = useSessionDetail(sessionName);

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex flex-col flex-1">
        <Header tenantId={tenantId} />
        <main className="flex-1 space-y-6 overflow-y-auto p-6">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Voltar para a lista
          </Link>

          {!connected && <p className="text-sm text-yellow-700">Reconectando ao servidor…</p>}
          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

          {loading || !session ? (
            <p className="text-sm text-gray-500">Carregando sessão…</p>
          ) : (
            <>
              <section className="flex items-start justify-between rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div>
                  <h1 className="text-xl font-bold text-gray-800">{session.sessionName}</h1>
                  <p className="mt-1 text-sm text-gray-500">{session.phoneNumber ?? 'Número ainda não vinculado'}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                    <dt className="text-gray-400">Geração da instância</dt>
                    <dd>{session.generation}</dd>
                    <dt className="text-gray-400">Conectado desde</dt>
                    <dd>{formatDateTime(session.connectedAt)}</dd>
                    <dt className="text-gray-400">Última atividade</dt>
                    <dd>{formatDateTime(session.lastSeen)}</dd>
                    <dt className="text-gray-400">Criada em</dt>
                    <dd>{formatDateTime(session.createdAt)}</dd>
                  </dl>
                </div>
                <StatusBadge status={session.status} />
              </section>

              <section>
                <SessionActions sessionName={session.sessionName} status={session.status} />
              </section>

              <QRCodeCard sessionName={session.sessionName} status={session.status} />

              <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-gray-700">Histórico recente</h2>
                <HistoryList sessionName={session.sessionName} />
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
