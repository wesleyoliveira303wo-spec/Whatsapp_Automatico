import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';

import AdminShell from '@/components/admin/AdminShell';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requirePlatformPageSession } from '@/lib/platformAuth';
import {
  fetchPlatformOverview,
  type ActionQueueItem,
  type PlatformAdmin,
  type PlatformOverview,
} from '@/lib/platformClientApi';
import { pageTitle } from '@/lib/brand';

interface AdminHomeProps {
  admin: PlatformAdmin;
}

/**
 * Início do `/admin` — Fase 3 (`ADMIN_PLATFORM_MASTER_PLAN.md` §5).
 *
 * Duas partes: a Fila de ação ("o que eu preciso fazer agora?") em cima, e os
 * KPIs globais abaixo — número herói (total de clientes) + stat tiles. Nenhum
 * número inventado. Fila vazia = nada precisa de você.
 */
export default function AdminHomePage({ admin }: AdminHomeProps): JSX.Element {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPlatformOverview()
      .then((o) => {
        if (!cancelled) setData(o);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell admin={admin}>
      <Head>
        <title>{pageTitle('Painel da plataforma')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <h1 className="text-xl font-semibold tracking-tight">Início</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        O que precisa de você agora, e a visão geral de toda a plataforma.
      </p>

      {error ? (
        <Card className="mt-6 p-6 text-sm text-destructive">
          Não foi possível carregar a visão da plataforma.
        </Card>
      ) : data === null ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <>
          <ActionQueue items={data.actionQueue} />
          <Kpis kpis={data.kpis} />
        </>
      )}
    </AdminShell>
  );
}

const SEVERITY_STYLE: Record<ActionQueueItem['severity'], string> = {
  red: 'border-destructive/40 bg-destructive/10 text-destructive',
  amber: 'border-warning/40 bg-warning/10 text-warning',
};
const SEVERITY_ICON: Record<ActionQueueItem['severity'], typeof AlertCircle> = {
  red: AlertCircle,
  amber: AlertTriangle,
};

function ActionQueue({ items }: { items: ActionQueueItem[] }): JSX.Element {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium">Fila de ação</h2>
      {items.length === 0 ? (
        <Card className="mt-2 flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          Nada precisa de atenção agora.
        </Card>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => {
            const Icon = SEVERITY_ICON[item.severity];
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${SEVERITY_STYLE[item.severity]}`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Kpis({ kpis }: { kpis: PlatformOverview['kpis'] }): JSX.Element {
  const messages = kpis.messages30d.inbound + kpis.messages30d.outbound;
  const aiFailureRate =
    kpis.ai30d.total > 0
      ? `${Math.round((kpis.ai30d.providerError / kpis.ai30d.total) * 100)}%`
      : '—';

  return (
    <section className="mt-8">
      {/* Número herói: a manchete do painel (§5.3). */}
      <div className="flex items-baseline gap-3">
        <span className="text-5xl font-semibold tracking-tight tabular-nums">
          {kpis.tenants.total}
        </span>
        <span className="text-sm text-muted-foreground">
          clientes · {kpis.tenants.byPlan.free} Grátis · {kpis.tenants.byPlan.pro} Pro ·{' '}
          {kpis.tenants.byPlan.enterprise} Enterprise
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Tile label="Precisam de atenção" value={kpis.tenantsNeedingAttention} muted={kpis.tenantsNeedingAttention === 0} />
        <Tile label="Saudáveis" value={kpis.tenantsHealthy} />
        <Tile label="Usuários" value={kpis.users} />
        <Tile
          label="WhatsApps conectados"
          value={`${kpis.sessionsConnectedLive}/${kpis.sessions.total}`}
        />
        <Tile label="Mensagens (30d)" value={messages.toLocaleString('pt-BR')} />
        <Tile label="Interações de IA (30d)" value={kpis.ai30d.total.toLocaleString('pt-BR')} hint={`${aiFailureRate} com erro`} />
        <Tile label="Custo de IA (30d)" value={formatUsd(kpis.ai30d.costUsd)} />
        <Tile
          label="Campanhas em andamento"
          value={kpis.campaigns.running}
          hint={kpis.campaigns.pausedByBreaker > 0 ? `${kpis.campaigns.pausedByBreaker} pausada(s) pelo disjuntor` : undefined}
        />
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: string | number;
  hint?: string;
  muted?: boolean;
}): JSX.Element {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          muted
            ? 'mt-1 text-xl font-semibold tabular-nums text-muted-foreground'
            : 'mt-1 text-xl font-semibold tabular-nums'
        }
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

/** `parseFloat` só na fronteira de renderização (D46) — o valor exato viaja como string. */
function formatUsd(raw: string): string {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 'US$ —';
  return `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

export const getServerSideProps: GetServerSideProps<AdminHomeProps> = async (context) => {
  const guard = requirePlatformPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  return { props: { admin: guard.session.user } };
};
