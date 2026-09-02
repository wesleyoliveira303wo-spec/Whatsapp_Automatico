import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import PipelineBoard from '@/components/PipelineBoard';
import PlanGate from '@/components/PlanGate';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';

interface PipelinePageProps {
  tenantId: string;
  sessionName: string;
}

/**
 * Pipeline de CRM (Milestone 6, Bloco M6H-5/M6I) — board Kanban por sessão,
 * mesmo guard de sempre (`requireProtectedPageSession`). Cada WhatsApp tem o
 * próprio funil (a IA classifica `stage` por conversa; conversa pertence a
 * uma sessão).
 *
 * Reskin 2026-08-07 — cabeçalho (título/subtítulo/contagem) migrou para
 * dentro de `PipelineBoard` (o mockup nasce tudo numa `<section>` só, e só o
 * board sabe a contagem total de conversas no funil); esta página vira só a
 * casca de layout + guard de sessão.
 */
export const getServerSideProps: GetServerSideProps<PipelinePageProps> = async (context) => {
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

export default function PipelinePage({ tenantId, sessionName }: PipelinePageProps): JSX.Element {
  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Pipeline · ${sessionName}`)}</title>
      </Head>
      <div className="h-full">
        <PlanGate feature="O Pipeline" className="m-6">
          <PipelineBoard sessionName={sessionName} />
        </PlanGate>
      </div>
    </SessionLayout>
  );
}
