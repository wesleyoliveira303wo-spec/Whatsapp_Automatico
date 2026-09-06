import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import AdminShell from '@/components/admin/AdminShell';
import { TenantSignalBadge } from '@/components/admin/TenantSignalBadge';
import TenantControlPanel from '@/components/admin/TenantControlPanel';
import RequestAccessButton from '@/components/admin/RequestAccessButton';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requirePlatformPageSession } from '@/lib/platformAuth';
import {
  PlatformApiError,
  fetchPlatformTenantDetail,
  type PlatformAdmin,
  type PlatformTenantDetail,
} from '@/lib/platformClientApi';
import { formatDateTime, formatShortRelativeTime } from '@/lib/formatters';
import { pageTitle } from '@/lib/brand';

interface Props {
  admin: PlatformAdmin;
  tenantId: string;
}

const PLAN_LABEL: Record<PlatformTenantDetail['plan'], string> = {
  free: 'Grátis',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const SESSION_STATUS_LABEL: Record<PlatformTenantDetail['sessions'][number]['status'], string> = {
  connecting: 'Conectando',
  connected: 'Conectado',
  disconnected: 'Desconectado',
};

/**
 * Centro de Tenants — detalhe (Fase 2, §6.2). Todos os indicadores abertos +
 * sessões uma a uma, campanhas, contatos e histórico recente de quedas.
 *
 * O status de sessão aqui é "última informação conhecida" (ADR #80): o banco
 * só se atualiza enquanto há instância viva. A sobreposição pelo registry ao
 * vivo é da Fase 3 — a tela diz isso, não finge que é tempo real.
 */
export default function AdminTenantDetailPage({ admin, tenantId }: Props): JSX.Element {
  const [tenant, setTenant] = useState<PlatformTenantDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetchPlatformTenantDetail(tenantId)
      .then((detail) => {
        if (cancelled) return;
        setTenant(detail);
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setState(err instanceof PlatformApiError && err.status === 404 ? 'not_found' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <AdminShell admin={admin}>
      <Head>
        <title>{pageTitle(tenant ? tenant.name : 'Tenant')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <Link
        href="/admin/tenants"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Tenants
      </Link>

      {state === 'loading' ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : state === 'not_found' ? (
        <Card className="p-6 text-sm text-muted-foreground">Tenant não encontrado.</Card>
      ) : state === 'error' || !tenant ? (
        <Card className="p-6 text-sm text-destructive">Não foi possível carregar este tenant.</Card>
      ) : (
        <div className="space-y-6">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{tenant.name}</h1>
              {tenant.status === 'suspended' ? (
                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                  Suspenso
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {tenant.id} · {PLAN_LABEL[tenant.plan]} · criado em {formatDateTime(tenant.createdAt)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {tenant.signals.map((s) => (
                <TenantSignalBadge key={s.key} signal={s} />
              ))}
              <span className="ml-auto">
                <RequestAccessButton tenantId={tenant.id} tenantName={tenant.name} />
              </span>
            </div>
          </header>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Mensagens (30d)"
              value={(tenant.messages30d.inbound + tenant.messages30d.outbound).toLocaleString(
                'pt-BR',
              )}
            />
            <Metric
              label="Interações de IA (30d)"
              value={tenant.ai30d.total}
              hint={`${tenant.ai30d.providerError} com erro`}
            />
            <Metric label="Custo de IA (30d)" value={formatUsd(tenant.ai30d.costUsd)} />
            <Metric
              label="Escalonamento (30d)"
              value={
                tenant.conversations30d.total > 0
                  ? `${Math.round(
                      (tenant.conversations30d.escalated / tenant.conversations30d.total) * 100,
                    )}%`
                  : '—'
              }
              hint={`${tenant.conversations30d.escalated} de ${tenant.conversations30d.total} conversas`}
            />
            <Metric label="Contatos" value={tenant.contactCount} />
            <Metric label="Usuários" value={tenant.userCount} />
            <Metric
              label="Campanhas"
              value={tenant.campaigns.total}
              hint={
                tenant.campaigns.pausedByBreaker > 0
                  ? `${tenant.campaigns.pausedByBreaker} pausada(s) pelo disjuntor`
                  : `${tenant.campaigns.running} em andamento`
              }
            />
            <Metric
              label="Última atividade"
              value={tenant.lastActivityAt ? formatShortRelativeTime(tenant.lastActivityAt) : 'nunca'}
            />
          </section>

          <TenantControlPanel
            tenant={{
              id: tenant.id,
              name: tenant.name,
              plan: tenant.plan,
              status: tenant.status,
            }}
            onChanged={(result) =>
              setTenant((current) =>
                current ? { ...current, plan: result.plan, status: result.status } : current,
              )
            }
          />

          <section>
            <h2 className="text-sm font-medium">WhatsApps</h2>
            <p className="text-xs text-muted-foreground">
              Status conforme o último registro no banco (ADR #80) — não é tempo real.
            </p>
            <div className="mt-2 space-y-2">
              {tenant.sessions.length === 0 ? (
                <Card className="p-4 text-sm text-muted-foreground">
                  Nenhum WhatsApp registrado — este cliente não passou da instalação.
                </Card>
              ) : (
                tenant.sessions.map((s) => (
                  <Card key={s.sessionName} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
                    <span className="font-medium">{s.sessionName}</span>
                    <span className="text-muted-foreground">{SESSION_STATUS_LABEL[s.status]}</span>
                    {s.phoneNumber ? (
                      <span className="text-muted-foreground">{s.phoneNumber}</span>
                    ) : null}
                    <span className="text-muted-foreground">
                      {s.aiProfileConfigured ? 'Cérebro da IA preenchido' : 'Cérebro da IA vazio'}
                    </span>
                    {s.lastSeen ? (
                      <span className="text-xs text-muted-foreground">
                        visto {formatShortRelativeTime(s.lastSeen)}
                      </span>
                    ) : null}
                  </Card>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium">Histórico recente de conexão</h2>
            <div className="mt-2 space-y-1">
              {tenant.recentSessionEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma transição registrada.</p>
              ) : (
                tenant.recentSessionEvents.map((e, i) => (
                  <p key={`${e.occurredAt}-${i}`} className="text-xs text-muted-foreground">
                    <span className="tabular-nums">{formatDateTime(e.occurredAt)}</span> ·{' '}
                    {e.sessionName} · {SESSION_STATUS_LABEL[e.status]}
                    {e.disconnectReason ? ` (${e.disconnectReason})` : ''}
                  </p>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </AdminShell>
  );
}

/**
 * Custo de IA para exibição. O valor exato (string decimal, D46) continua no
 * payload — aqui é só a etiqueta legível, `parseFloat` na fronteira de
 * renderização, mesmo padrão de `analyticsView.ts`. 2 a 6 casas: US$ 0,00 no
 * free tier, mas não engole frações minúsculas de um provider pago.
 */
function formatUsd(raw: string): string {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 'US$ —';
  return `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}): JSX.Element {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = requirePlatformPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const tenantId = context.params?.tenantId;
  if (typeof tenantId !== 'string') {
    return { redirect: { destination: '/admin/tenants', permanent: false } };
  }
  return { props: { admin: guard.session.user, tenantId } };
};
