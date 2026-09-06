import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import AdminShell from '@/components/admin/AdminShell';
import { TenantSignalBadge } from '@/components/admin/TenantSignalBadge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { requirePlatformPageSession } from '@/lib/platformAuth';
import {
  fetchPlatformTenants,
  type PlatformAdmin,
  type PlatformTenantRow,
} from '@/lib/platformClientApi';
import { formatShortRelativeTime } from '@/lib/formatters';
import { pageTitle } from '@/lib/brand';

interface Props {
  admin: PlatformAdmin;
}

const PLAN_LABEL: Record<PlatformTenantRow['plan'], string> = {
  free: 'Grátis',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

/**
 * Centro de Tenants — lista (Fase 2, `ADMIN_PLATFORM_MASTER_PLAN.md` §6.1).
 *
 * Uma linha por tenant, para varrer e achar problema. Já vem ordenada pela
 * API: os que precisam de atenção no topo. Nenhum número aqui é inventado —
 * cada coluna tem fonte real (§6.4).
 *
 * A tira de resumo em cima NÃO é a Início (§5, Fase 3): são três contagens
 * derivadas da MESMA lista já carregada, sem consulta nova, para dar a
 * proporção antes de descer os olhos pela tabela.
 */
export default function AdminTenantsPage({ admin }: Props): JSX.Element {
  const [tenants, setTenants] = useState<PlatformTenantRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlatformTenants()
      .then((rows) => {
        if (!cancelled) setTenants(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar os tenants.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell admin={admin}>
      <Head>
        <title>{pageTitle('Tenants')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <h1 className="text-xl font-semibold tracking-tight">Tenants</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Todos os clientes, ordenados por quem precisa de atenção primeiro.
      </p>

      {error ? (
        <Card className="mt-6 p-6 text-sm text-destructive">{error}</Card>
      ) : tenants === null ? (
        <div className="mt-6 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          <SummaryStrip tenants={tenants} />
          <Card className="mt-4 overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Sinais</TableHead>
                  <TableHead className="text-right">Mensagens (30d)</TableHead>
                  <TableHead className="text-right">WhatsApps</TableHead>
                  <TableHead className="text-right">Usuários</TableHead>
                  <TableHead>Última atividade</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/tenants/${encodeURIComponent(t.id)}`}
                        className="hover:underline"
                      >
                        {t.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{t.id}</span>
                    </TableCell>
                    <TableCell>{PLAN_LABEL[t.plan]}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {t.signals.map((s) => (
                          <TenantSignalBadge key={s.key} signal={s} />
                        ))}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(t.messages30d.inbound + t.messages30d.outbound).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.connectedSessionCount}/{t.sessionCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.userCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.lastActivityAt ? formatShortRelativeTime(t.lastActivityAt) : 'nunca'}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/tenants/${encodeURIComponent(t.id)}`}
                        aria-label={`Abrir ${t.name}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </AdminShell>
  );
}

function SummaryStrip({ tenants }: { tenants: PlatformTenantRow[] }): JSX.Element {
  const total = tenants.length;
  const needAttention = tenants.filter((t) => t.signals[0]?.severity !== 'green').length;
  const neverStarted = tenants.filter((t) =>
    t.signals.some((s) => s.key === 'never_started'),
  ).length;

  return (
    <div className="mt-6 grid grid-cols-3 gap-3">
      <StatTile label="Tenants" value={total} />
      <StatTile label="Precisam de atenção" value={needAttention} muted={needAttention === 0} />
      <StatTile label="Nunca começaram" value={neverStarted} muted={neverStarted === 0} />
    </div>
  );
}

function StatTile({
  label,
  value,
  muted,
}: {
  label: string;
  value: number;
  muted?: boolean;
}): JSX.Element {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          muted ? 'mt-1 text-2xl font-semibold text-muted-foreground' : 'mt-1 text-2xl font-semibold'
        }
      >
        {value}
      </p>
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
