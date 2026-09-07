import { useCallback, useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';

import AdminShell from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requirePlatformPageSession } from '@/lib/platformAuth';
import {
  PlatformApiError,
  endSupportAccess,
  enterTenantAccount,
  fetchSupportRequests,
  type PlatformAdmin,
  type PlatformSupportRequest,
  type SupportAccessStatus,
} from '@/lib/platformClientApi';
import { pageTitle } from '@/lib/brand';
import { formatDateTime } from '@/lib/formatters';

interface Props {
  admin: PlatformAdmin;
}

const STATUS_LABEL: Record<SupportAccessStatus, string> = {
  pending: 'Aguardando resposta',
  accepted: 'Ativo agora',
  denied: 'Recusado',
  expired: 'Expirado',
  revoked: 'Encerrado pelo cliente',
  ended: 'Encerrado pelo suporte',
};

const STATUS_TONE: Record<SupportAccessStatus, string> = {
  pending: 'text-warning',
  accepted: 'text-success',
  denied: 'text-destructive',
  expired: 'text-muted-foreground',
  revoked: 'text-muted-foreground',
  ended: 'text-muted-foreground',
};

/**
 * Seção Suporte do `/admin` — Fase 5 (`ADMIN_PLATFORM_MASTER_PLAN.md` §9.5):
 * pedidos pendentes, acessos ativos agora, e o histórico completo (recusados,
 * expirados, encerrados). "Entrar na conta" nos ativos; "Encerrar" para sair.
 */
export default function AdminSupportPage({ admin }: Props): JSX.Element {
  const router = useRouter();
  const [requests, setRequests] = useState<PlatformSupportRequest[] | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { requests: rows } = await fetchSupportRequests();
      setRequests(rows);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function enter(id: string): Promise<void> {
    setBusyId(id);
    try {
      await enterTenantAccount(id);
      await router.push('/app');
    } catch {
      setError(true);
      setBusyId(null);
    }
  }

  async function end(id: string): Promise<void> {
    setBusyId(id);
    try {
      await endSupportAccess(id);
    } catch (err) {
      // 409 = já foi encerrado/revogado por outro caminho: não é erro, só
      // recarrega a lista para refletir o estado real.
      if (!(err instanceof PlatformApiError && err.status === 409)) {
        setError(true);
      }
    }
    await load();
    setBusyId(null);
  }

  const pending = requests?.filter((r) => r.status === 'pending') ?? [];
  const active = requests?.filter((r) => r.status === 'accepted') ?? [];
  const history =
    requests?.filter((r) => r.status !== 'pending' && r.status !== 'accepted') ?? [];

  return (
    <AdminShell admin={admin}>
      <Head>
        <title>{pageTitle('Suporte')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <h1 className="text-xl font-semibold tracking-tight">Suporte assistido</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Pedidos de acesso às contas dos clientes. Um acesso só vale com o aceite do cliente e
        expira em 2 horas.
      </p>

      {/* `error` vem ANTES de `requests === null`: numa falha de PRIMEIRA
          carga o `load()` só chama `setError(true)` e `requests` continua
          `null`, então checar o skeleton primeiro deixava a tela presa em
          "carregando" para sempre, sem nenhum sinal de erro. */}
      {error ? (
        <Card className="mt-6 p-6 text-sm text-destructive">
          Não foi possível carregar os pedidos de acesso.
        </Card>
      ) : requests === null ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          <Section title="Ativos agora" empty="Nenhum acesso ativo.">
            {active.map((r) => (
              <RequestCard key={r.id} request={r}>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === r.id}
                    onClick={() => void enter(r.id)}
                  >
                    Entrar na conta
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === r.id}
                    onClick={() => void end(r.id)}
                  >
                    Encerrar
                  </Button>
                </div>
              </RequestCard>
            ))}
          </Section>

          <Section title="Aguardando o cliente" empty="Nenhum pedido pendente.">
            {pending.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </Section>

          <Section title="Histórico" empty="Nenhum acesso anterior.">
            {history.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </Section>
        </div>
      )}
    </AdminShell>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}): JSX.Element {
  const items = Array.isArray(children) ? children : [children];
  const hasItems = items.some(Boolean);
  return (
    <section>
      <h2 className="text-sm font-medium">{title}</h2>
      {hasItems ? (
        <div className="mt-2 space-y-2">{children}</div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function RequestCard({
  request,
  children,
}: {
  request: PlatformSupportRequest;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <Card className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">
          <span className={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</span> ·{' '}
          {request.tenantId}
        </p>
        <p className="text-muted-foreground">Motivo: “{request.reason}”</p>
        <p className="text-xs text-muted-foreground">
          Pedido em {formatDateTime(request.requestedAt)}
          {request.respondedAt ? ` · respondido em ${formatDateTime(request.respondedAt)}` : ''}
          {request.expiresAt ? ` · expira ${formatDateTime(request.expiresAt)}` : ''}
        </p>
      </div>
      {children}
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
