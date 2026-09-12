import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Users2, MessageSquare } from 'lucide-react';
import SessionLayout from '@/components/SessionLayout';
import CampaignsPanel from '@/components/CampaignsPanel';
import GroupBroadcastsPanel from '@/components/GroupBroadcastsPanel';
import PlanGate from '@/components/PlanGate';
import { TabList, TabTrigger } from '@/components/ui/tabs-nav';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';

interface CampaignsPageProps {
  tenantId: string;
  sessionName: string;
}

/**
 * Lista de campanhas — Reorganização Contatos/Campanhas (2026-08-17, 2ª
 * rodada): domínio próprio no rail, separado de Contatos.
 */
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

type CampaignsTab = 'contacts' | 'groups';

/** Aba pedida via `?tab=groups` — mesma convenção de navegação por query já usada em `settings.tsx`/`ai.tsx`. */
function tabFromQuery(value: unknown): CampaignsTab {
  return value === 'groups' ? 'groups' : 'contacts';
}

export default function CampaignsPage({ tenantId, sessionName }: CampaignsPageProps): JSX.Element {
  const router = useRouter();
  const [tab, setTab] = useState<CampaignsTab>(() => tabFromQuery(router.query.tab));

  // Resincroniza quando a query muda por navegação client-side (ex.: um link
  // externo para `?tab=groups`) — mesmo cuidado já registrado em
  // `settings.tsx` (achado real: `useState(initial)` sozinho não reage a
  // isso, ficando preso na aba de quando o componente montou).
  useEffect(() => {
    setTab(tabFromQuery(router.query.tab));
  }, [router.query.tab]);

  function selectTab(next: CampaignsTab): void {
    setTab(next);
    void router.replace(
      { pathname: router.pathname, query: { ...router.query, tab: next } },
      undefined,
      { shallow: true },
    );
  }

  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Disparos · ${sessionName}`)}</title>
      </Head>
      <div className="fx-scroll h-full overflow-y-auto">
        {/* Largura maior (1400px), mesma medida de Contatos: duas colunas (lista + painel lateral) a partir de `xl`. */}
        <div className="max-w-[1400px] px-6 pb-12 pt-5">
          <h1 className="text-[21px] font-semibold tracking-tight text-foreground">Disparos</h1>
          <p className="mb-4 mt-1 text-[13px] text-muted-foreground">
            Envie a mesma mensagem para vários contatos, ou publique em grupos de WhatsApp.
          </p>

          <TabList ariaLabel="Tipo de disparo">
            <TabTrigger
              active={tab === 'contacts'}
              icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => selectTab('contacts')}
            >
              Para contatos
            </TabTrigger>
            <TabTrigger
              active={tab === 'groups'}
              icon={<Users2 className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => selectTab('groups')}
            >
              Para grupos
            </TabTrigger>
          </TabList>

          <div className="mt-4">
            <PlanGate feature="As Campanhas">
              {tab === 'contacts' ? (
                <CampaignsPanel sessionName={sessionName} />
              ) : (
                <GroupBroadcastsPanel sessionName={sessionName} />
              )}
            </PlanGate>
          </div>
        </div>
      </div>
    </SessionLayout>
  );
}
