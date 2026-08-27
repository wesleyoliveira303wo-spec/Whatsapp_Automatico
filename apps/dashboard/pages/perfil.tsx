import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import FrancisLogo from '@/components/brand/FrancisLogo';
import ThemeToggle from '@/components/ThemeToggle';
import ProfileSettingsTab from '@/components/ProfileSettingsTab';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';

interface PerfilPageProps {
  canManageCompany: boolean;
}

/**
 * Perfil — Reestruturação de Configurações, Fase 4 (2026-08-27, ver
 * `CONFIGURACOES_REDESIGN_PLAN.md` §P1).
 *
 * Área PRÓPRIA, fora de Configurações. A auditoria apontou que "Perfil" (eu)
 * dividia a mesma barra de abas com "Equipe/Auditoria" (minha empresa) —
 * escopos diferentes disputando o mesmo lugar, o que fazia Configurações
 * parecer uma gaveta em vez de uma central. O princípio agora é explícito:
 *
 *   Perfil        = EU (conta, senha, sair, preferências deste navegador)
 *   Configurações = MINHA EMPRESA (canais, equipe, auditoria, políticas)
 *
 * Sem sessão de WhatsApp no caminho: perfil é da PESSOA, não de um canal —
 * por isso vive em `/perfil`, não em `/sessions/:s/perfil`. Casca própria
 * (cabeçalho + volta), pelo mesmo motivo de `/settings` sem sessão: o rail
 * lateral pertence a uma sessão, e esta tela não pertence a nenhuma.
 *
 * Sessão de API key (sem pessoa) não tem perfil — cai no Workspace.
 */
export const getServerSideProps: GetServerSideProps<PerfilPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  if (!guard.session.user) {
    return { redirect: { destination: '/', permanent: false } };
  }
  return { props: { canManageCompany: guard.session.user.role === 'owner' } };
};

export default function PerfilPage({ canManageCompany }: PerfilPageProps): JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-background">
      <Head>
        <title>{pageTitle('Perfil')}</title>
      </Head>

      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background pl-4 pr-3.5">
        <Link
          href="/"
          className="flex w-fit items-center gap-2.5"
          title="Voltar para Todos os WhatsApps"
        >
          <FrancisLogo size={22} />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">Francis</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="fx-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] px-6 pb-16 pt-6">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Voltar
          </Link>
          <h1 className="text-[21px] font-semibold tracking-tight text-foreground">Perfil</h1>
          <p className="mb-6 mt-1 text-[13px] text-muted-foreground">
            Sua conta, sua senha e suas preferências neste navegador.
          </p>
          <ProfileSettingsTab canManageCompany={canManageCompany} />
        </div>
      </main>
    </div>
  );
}
