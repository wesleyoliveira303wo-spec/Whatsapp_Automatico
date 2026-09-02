import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import SessionLayout from '@/components/SessionLayout';
import CampaignCreateForm from '@/components/CampaignCreateForm';
import PlanGate from '@/components/PlanGate';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';

interface CampaignCreatePageProps {
  tenantId: string;
  sessionName: string;
}

/**
 * Página dedicada de criação de campanha — Reorganização Contatos/Campanhas
 * (2026-08-17, 2ª rodada): "Campanhas" é domínio próprio de novo (rail +
 * lista + criação), sem nenhuma dependência da tela de Contatos além de
 * reaproveitar Contatos salvos como uma das três origens de destinatário.
 */
export const getServerSideProps: GetServerSideProps<CampaignCreatePageProps> = async (context) => {
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

export default function CampaignCreatePage({
  tenantId,
  sessionName,
}: CampaignCreatePageProps): JSX.Element {
  const router = useRouter();
  const backToList = (): void => {
    void router.push(`/sessions/${encodeURIComponent(sessionName)}/campaigns`);
  };

  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Nova campanha · ${sessionName}`)}</title>
      </Head>
      <div className="fx-scroll h-full overflow-y-auto">
        <div className="max-w-[820px] px-6 pb-12 pt-5">
          <h1 className="text-[21px] font-semibold tracking-tight text-foreground">
            Nova campanha
          </h1>
          <p className="mb-5 mt-1 text-[13px] text-muted-foreground">
            Combine contatos salvos, uma planilha e/ou números digitados manualmente.
          </p>
          <PlanGate feature="As Campanhas">
            <CampaignCreateForm sessionName={sessionName} onClose={backToList} />
          </PlanGate>
        </div>
      </div>
    </SessionLayout>
  );
}
