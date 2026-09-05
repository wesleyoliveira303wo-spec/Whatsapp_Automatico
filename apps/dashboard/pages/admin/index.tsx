import type { GetServerSideProps } from 'next';
import Head from 'next/head';

import AdminShell from '@/components/admin/AdminShell';
import { Card } from '@/components/ui/card';
import { requirePlatformPageSession } from '@/lib/platformAuth';
import type { PlatformAdmin } from '@/lib/platformClientApi';
import { pageTitle } from '@/lib/brand';

interface AdminHomeProps {
  admin: PlatformAdmin;
}

/**
 * Início do `/admin` — Fase 1.
 *
 * A entrega desta fase é o portão, não os números: dá para entrar, a sessão é
 * verificada no servidor a cada requisição e o login fica registrado na
 * trilha. Os KPIs e a fila de ação (§5) chegam nas fases seguintes, junto com
 * as consultas que os alimentam.
 *
 * Esta tela diz isso explicitamente em vez de mostrar cartões zerados —
 * "0 tenants em atenção" e "ainda não medimos isso" parecem iguais na tela e
 * significam coisas opostas.
 */
export default function AdminHomePage({ admin }: AdminHomeProps): JSX.Element {
  return (
    <AdminShell admin={admin}>
      <Head>
        <title>{pageTitle('Painel da plataforma')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <h1 className="text-xl font-semibold tracking-tight">Início</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Visão geral da plataforma — todos os clientes, num lugar só.
      </p>

      <Card className="mt-6 p-6">
        <h2 className="text-base font-medium">O painel está de pé</h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Esta é a primeira fase: login próprio, sessão separada da do produto e trilha de
          auditoria. Os indicadores da plataforma, a lista de tenants, o suporte com
          consentimento e a saúde da infraestrutura entram nas fases seguintes — e só aparecem
          aqui quando houver dado real por trás de cada número.
        </p>
      </Card>
    </AdminShell>
  );
}

export const getServerSideProps: GetServerSideProps<AdminHomeProps> = async (context) => {
  const guard = requirePlatformPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  // O que a página exibe vem do cookie só para não piscar; toda autorização
  // real acontece no servidor, a cada chamada de `/api/platform`.
  return { props: { admin: guard.session.user } };
};
