import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import AiProfilePanel from '@/components/AiProfilePanel';
import QuickRepliesPanel from '@/components/QuickRepliesPanel';
import { TabList, TabTrigger } from '@/components/ui/tabs-nav';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';

interface AiPageProps {
  tenantId: string;
  sessionName: string;
  initialTab: AiTab;
}

type AiTab = 'profile' | 'quick-replies';

function isAiTab(value: unknown): value is AiTab {
  return value === 'profile' || value === 'quick-replies';
}

/**
 * Redesign 2026-08-05 (R2) — agrupa "Cérebro da IA" e "Respostas Rápidas" sob
 * um único item de rail ("IA"), como abas: os dois eram itens SOLTOS no menu
 * antigo (`SessionSidebar`), mas são a mesma categoria de configuração (o que
 * a IA sabe/como ela responde). Mesmo gate de sempre (administrator/owner —
 * `ai_profile:*`/`quick_reply:manage` já exigem isso na API).
 *
 * Rotas antigas `/ai-profile` e `/quick-replies` (arquivos preservados,
 * viraram redirect — ambiente não permite apagar) apontam para cá com
 * `?tab=`, então links salvos continuam funcionando.
 */
export const getServerSideProps: GetServerSideProps<AiPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const { session } = guard;
  const role = session.user?.role;
  if (role !== 'administrator' && role !== 'owner') {
    return { redirect: { destination: '/', permanent: false } };
  }
  const sessionName = context.params?.sessionName;
  if (typeof sessionName !== 'string') {
    return { notFound: true };
  }
  const tabParam = context.query?.tab;
  const initialTab: AiTab = isAiTab(tabParam) ? tabParam : 'profile';
  return { props: { tenantId: session.tenantId, sessionName, initialTab } };
};

export default function AiPage({ tenantId, sessionName, initialTab }: AiPageProps): JSX.Element {
  const [tab, setTab] = useState<AiTab>(initialTab);

  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`IA · ${sessionName}`)}</title>
      </Head>
      <div className="fx-scroll h-full overflow-y-auto">
        <div className="max-w-[780px] px-6 pb-12 pt-5">
          <h1 className="text-[21px] font-semibold tracking-tight text-foreground">IA</h1>
          <p className="mb-5 mt-1 text-[13px] text-muted-foreground">
            O que o Francis sabe sobre o seu negócio e as frases prontas do atendente.
          </p>

          <div className="mb-5">
            <TabList ariaLabel="Seção de IA" variant="pill">
              <TabTrigger
                active={tab === 'profile'}
                variant="pill"
                onClick={() => setTab('profile')}
              >
                Cérebro da IA
              </TabTrigger>
              <TabTrigger
                active={tab === 'quick-replies'}
                variant="pill"
                onClick={() => setTab('quick-replies')}
              >
                Respostas Rápidas
              </TabTrigger>
            </TabList>
          </div>

          {tab === 'profile' ? (
            <AiProfilePanel sessionName={sessionName} />
          ) : (
            <QuickRepliesPanel sessionName={sessionName} />
          )}
        </div>
      </div>
    </SessionLayout>
  );
}
