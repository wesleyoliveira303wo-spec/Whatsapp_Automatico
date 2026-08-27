import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import FrancisLogo from '@/components/brand/FrancisLogo';
import ThemeToggle from '@/components/ThemeToggle';
import SettingsTabs, { resolveInitialTab, type SettingsTab } from '@/components/SettingsTabs';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';
import type { ManagedUserRole } from '@/lib/clientApi';

interface SettingsPageProps {
  role: ManagedUserRole | null;
  hasUser: boolean;
  initialTab: SettingsTab;
}

/**
 * Configurações FORA de qualquer sessão — Reorganização Perfil/
 * Configurações (2026-08-27, ver DECISIONS.md #106).
 *
 * O caminho NORMAL para Configurações é `/sessions/:s/settings` (mesma
 * `SettingsTabs`, mas dentro de `SessionLayout`, com o rail lateral
 * visível — ver a docstring de lá para o porquê). Esta página existe para o
 * caso em que não há sessão nenhuma para servir de contexto: um tenant
 * recém-criado, no Workspace vazio, onde o rail não existe por definição e
 * a engrenagem do `Header` aponta para cá. Sem ela, Equipe/Auditoria/Perfil
 * ficariam inalcançáveis até o primeiro WhatsApp ser conectado.
 */
export const getServerSideProps: GetServerSideProps<SettingsPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const { session } = guard;
  const role = (session.user?.role as ManagedUserRole | undefined) ?? null;
  const hasUser = Boolean(session.user);
  return {
    props: { role, hasUser, initialTab: resolveInitialTab(context.query?.tab, role, hasUser) },
  };
};

export default function SettingsPage({ role, hasUser, initialTab }: SettingsPageProps): JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-background">
      <Head>
        <title>{pageTitle('Configurações')}</title>
      </Head>

      {/* Cabeçalho enxuto — mesma casca de `SessionHeader`, mas de nível tenant (não pertence a uma sessão). */}
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
        <div className="mx-auto max-w-[900px] px-6 pb-16 pt-6">
          <h1 className="text-[21px] font-semibold tracking-tight text-foreground">
            Configurações
          </h1>
          <p className="mb-5 mt-1 text-[13px] text-muted-foreground">
            WhatsApps, equipe, auditoria e seu perfil pessoal.
          </p>
          <SettingsTabs role={role} hasUser={hasUser} initialTab={initialTab} />
        </div>
      </main>
    </div>
  );
}
