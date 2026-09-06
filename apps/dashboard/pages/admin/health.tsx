import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { CheckCircle2, XCircle } from 'lucide-react';

import AdminShell from '@/components/admin/AdminShell';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requirePlatformPageSession } from '@/lib/platformAuth';
import {
  fetchPlatformHealth,
  type PlatformAdmin,
  type PlatformHealth,
  type QueueDepth,
} from '@/lib/platformClientApi';
import { pageTitle } from '@/lib/brand';

interface Props {
  admin: PlatformAdmin;
}

/**
 * Saúde do `/admin` — Fase 3 (`ADMIN_PLATFORM_MASTER_PLAN.md` §15): Postgres,
 * Redis, as 3 filas, taxa de falha de IA e WhatsApps caídos.
 *
 * `infra: null` (modo degradado, sem `REDIS_URL`) → diz "não verificável" em
 * vez de mostrar zeros.
 */
export default function AdminHealthPage({ admin }: Props): JSX.Element {
  const [data, setData] = useState<PlatformHealth | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPlatformHealth()
      .then((h) => {
        if (!cancelled) setData(h);
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
        <title>{pageTitle('Saúde')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <h1 className="text-xl font-semibold tracking-tight">Saúde</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Infraestrutura, filas e sinais de erro da plataforma.
      </p>

      {error ? (
        <Card className="mt-6 p-6 text-sm text-destructive">
          Não foi possível carregar a saúde da plataforma.
        </Card>
      ) : data === null ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="text-sm font-medium">Infraestrutura</h2>
            {data.infra === null ? (
              <Card className="mt-2 p-4 text-sm text-muted-foreground">
                Não verificável — a API está no modo degradado (sem Redis).
              </Card>
            ) : (
              <>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <StatusTile label="Postgres" ok={data.infra.database === 'ok'} />
                  <StatusTile label="Redis" ok={data.infra.redis === 'ok'} />
                </div>
                <div className="mt-3 space-y-2">
                  {data.infra.queues.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Filas indisponíveis (Redis fora do ar).
                    </p>
                  ) : (
                    data.infra.queues.map((q) => <QueueRow key={q.name} queue={q} />)
                  )}
                </div>
              </>
            )}
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Falhas de IA (30 dias)</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {data.aiFailures30d.rate === null
                  ? '—'
                  : `${Math.round(data.aiFailures30d.rate * 100)}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.aiFailures30d.providerError} de {data.aiFailures30d.total} interações com erro
                do provider
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Clientes com WhatsApp fora do ar</p>
              <p
                className={
                  data.tenantsWithSessionsDown > 0
                    ? 'mt-1 text-2xl font-semibold tabular-nums text-destructive'
                    : 'mt-1 text-2xl font-semibold tabular-nums text-muted-foreground'
                }
              >
                {data.tenantsWithSessionsDown}
              </p>
              <p className="text-xs text-muted-foreground">
                Tinham conexão e não têm mais (status reconciliado ao vivo).
              </p>
            </Card>
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function StatusTile({ label, ok }: { label: string; ok: boolean }): JSX.Element {
  return (
    <Card className="flex items-center gap-2 p-4">
      {ok ? (
        <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
      ) : (
        <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
      )}
      <span className="text-sm font-medium">{label}</span>
      <span className="ml-auto text-sm text-muted-foreground">
        {ok ? 'respondendo' : 'sem resposta'}
      </span>
    </Card>
  );
}

function QueueRow({ queue }: { queue: QueueDepth }): JSX.Element {
  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
      <span className="font-medium">{queue.name}</span>
      {!queue.reachable ? (
        <span className="text-destructive">sem resposta</span>
      ) : (
        <>
          <span className="text-muted-foreground tabular-nums">{queue.waiting} aguardando</span>
          <span className="text-muted-foreground tabular-nums">{queue.active} ativos</span>
          <span className="text-muted-foreground tabular-nums">{queue.delayed} adiados</span>
          <span
            className={
              queue.failed > 0 ? 'text-warning tabular-nums' : 'text-muted-foreground tabular-nums'
            }
          >
            {queue.failed} com falha
          </span>
        </>
      )}
    </Card>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = requirePlatformPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  return { props: { admin: guard.session.user } };
};
