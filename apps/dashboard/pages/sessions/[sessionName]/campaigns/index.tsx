import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import CampaignsPanel from '@/components/CampaignsPanel';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';

interface CampaignsPageProps {
  tenantId: string;
  sessionName: string;
}

/** Lista de campanhas de uma sessão — Fase L, Blocos L3/L4. */
export const getServerSideProps: GetServerSideProps<CampaignsPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const { session } = guard;
  const sessionName = context.params?.sessionName;
  if (typeof sessionName !== 'string') {
    return { notFound: true };
  }
  return { props: { tenantId: session.tenantId, sessionName } };
};

export default function CampaignsPage({ tenantId, sessionName }: CampaignsPageProps): JSX.Element {
  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Campanhas · ${sessionName}`)}</title>
      </Head>
      <div className="fx-scroll h-full overflow-y-auto">
        <div className="max-w-[900px] px-6 pb-12 pt-5">
          <CampaignsPanel sessionName={sessionName} />
        </div>
      </div>
    </SessionLayout>
  );
}
