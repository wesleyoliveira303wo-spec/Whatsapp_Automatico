import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import FrancisLogo from '@/components/brand/FrancisLogo';
import SessionRail from '@/components/SessionRail';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import ProfileSettingsTab from '@/components/ProfileSettingsTab';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';

interface PerfilPageProps {
  canManageCompany: boolean;
}

/**
 * Perfil — Reestruturação de Configurações, Fase 4 (2026-08-27, ver
 * `CONFIGURACOES_REDESIGN_PLAN.md` §P1); casca revista na Auditoria do
 * Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md`, pedido explícito do
 * fundador).
 *
 * Área PRÓPRIA, fora de Configurações. A auditoria apontou que "Perfil" (eu)
 * dividia a mesma barra de abas com "Equipe/Auditoria" (minha empresa) —
 * escopos diferentes disputando o mesmo lugar, o que fazia Configurações
 * parecer uma gaveta em vez de uma central. O princípio agora é explícito:
 *
 *   Perfil        = EU (conta, senha, sair, empresa comercial)
 *   Configurações = MINHA EMPRESA (canais, equipe, auditoria, políticas)
 *
 * Sem sessão de WhatsApp no caminho: perfil é da PESSOA, não de um canal —
 * por isso vive em `/perfil`, não em `/sessions/:s/perfil`.
 *
 * CORREÇÃO 2026-08-28 (pedido explícito do fundador): a versão anterior
 * escondia o `SessionRail` aqui (racional: "o rail pertence a uma sessão,
 * esta tela não pertence a nenhuma") — mas isso fazia Perfil parecer uma
 * página fora do aplicativo, sem navegação nenhuma de volta às outras
 * áreas. `SessionRail` agora aceita `sessionName` OPCIONAL (ver docstring
 * lá): sem sessão, ele mesmo esconde os itens que só fazem sentido dentro
 * de uma ("Conversas"/"Contatos"/"Campanhas"/"Pipeline"/"Analytics"/"IA"),
 * mantendo só o que é válido em qualquer lugar (marca → Workspace, Meu
 * perfil, tema, Configurações → `/settings`).
 *
 * Sessão de API key (sem pessoa) não tem perfil — cai no Workspace.
 */
export const getServerSideProps: GetServerSideProps<PerfilPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  if (!guard.session.user) {
    return { redirect: { destination: '/app', permanent: false } };
  }
  return { props: { canManageCompany: guard.session.user.role === 'owner' } };
};

export default function PerfilPage({ canManageCompany }: PerfilPageProps): JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-background">
      <Head>
        <title>{pageTitle('Perfil')}</title>
      </Head>

      {/* Cabeçalho enxuto, mesma marca de sempre — a navegação de verdade (Meu perfil/Configurações/tema) já vive no `SessionRail` logo abaixo. */}
      <header className="flex h-12 shrink-0 items-center border-b border-border bg-background pl-4 pr-3.5">
        <Link
          href="/app"
          className="flex w-fit items-center gap-2.5"
          title="Voltar para Todos os WhatsApps"
        >
          <FrancisLogo size={22} />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">Francis</span>
        </Link>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <SessionRail />
        <main className="fx-scroll flex-1 overflow-y-auto">
          <AppErrorBoundary>
            <div className="mx-auto max-w-[640px] px-6 pb-16 pt-6">
              <h1 className="text-[21px] font-semibold tracking-tight text-foreground">Perfil</h1>
              <p className="mb-6 mt-1 text-[13px] text-muted-foreground">
                Sua conta, sua senha e sua empresa.
              </p>
              <ProfileSettingsTab canManageCompany={canManageCompany} />
            </div>
          </AppErrorBoundary>
        </main>
      </div>
    </div>
  );
}
