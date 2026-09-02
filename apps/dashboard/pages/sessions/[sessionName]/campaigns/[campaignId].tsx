import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import CampaignDetailPanel from '@/components/CampaignDetailPanel';
import PlanGate from '@/components/PlanGate';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';

interface CampaignDetailPageProps {
  tenantId: string;
  sessionName: string;
  campaignId: string;
}

/** Detalhe de UMA campanha (resumo + destinatários + iniciar/pausar/cancelar) — Fase L, Bloco L4. */
export const getServerSideProps: GetServerSideProps<CampaignDetailPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const { session } = guard;
  const sessionName = context.params?.sessionName;
  const campaignId = context.params?.campaignId;
  if (typeof sessionName !== 'string' || typeof campaignId !== 'string') {
    return { notFound: true };
  }
  return { props: { tenantId: session.tenantId, sessionName, campaignId } };
};

export default function CampaignDetailPage({
  tenantId,
  sessionName,
  campaignId,
}: CampaignDetailPageProps): JSX.Element {
  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Campanha · ${sessionName}`)}</title>
      </Head>
      <div className="fx-scroll h-full overflow-y-auto">
        <div className="max-w-[900px] px-6 pb-12 pt-5">
          <PlanGate feature="As Campanhas">
            <CampaignDetailPanel sessionName={sessionName} campaignId={campaignId} />
          </PlanGate>
        </div>
      </div>
    </SessionLayout>
  );
}
