import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import GroupBroadcastDetailPanel from '@/components/GroupBroadcastDetailPanel';
import PlanGate from '@/components/PlanGate';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';

interface GroupBroadcastDetailPageProps {
  tenantId: string;
  sessionName: string;
  broadcastId: string;
}

/** Detalhe de UM disparo em grupos (resumo + status por grupo + iniciar/pausar/cancelar) — 2026-09-11. */
export const getServerSideProps: GetServerSideProps<GroupBroadcastDetailPageProps> = async (
  context,
) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const { session } = guard;
  const sessionName = context.params?.sessionName;
  const broadcastId = context.params?.broadcastId;
  if (typeof sessionName !== 'string' || typeof broadcastId !== 'string') {
    return { notFound: true };
  }
  return { props: { tenantId: session.tenantId, sessionName, broadcastId } };
};

export default function GroupBroadcastDetailPage({
  tenantId,
  sessionName,
  broadcastId,
}: GroupBroadcastDetailPageProps): JSX.Element {
  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Disparo em grupos · ${sessionName}`)}</title>
      </Head>
      <div className="fx-scroll h-full overflow-y-auto">
        <div className="max-w-[900px] px-6 pb-12 pt-5">
          <PlanGate feature="Os Disparos em grupos">
            <GroupBroadcastDetailPanel sessionName={sessionName} broadcastId={broadcastId} />
          </PlanGate>
        </div>
      </div>
    </SessionLayout>
  );
}
