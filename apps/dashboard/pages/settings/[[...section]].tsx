import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import FrancisLogo from '@/components/brand/FrancisLogo';
import ThemeToggle from '@/components/ThemeToggle';
import SettingsLayout from '@/components/SettingsLayout';
import { type SettingsSectionId } from '@/components/SettingsSidebar';
import { resolveSectionFromQuery } from '@/pages/sessions/[sessionName]/settings/[[...section]]';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';
import type { ManagedUserRole } from '@/lib/clientApi';

interface SettingsPageProps {
  role: ManagedUserRole | null;
  section: SettingsSectionId;
}

/**
 * Configurações FORA de qualquer sessão — Reestruturação, Fase 3
 * (2026-08-27, ver `CONFIGURACOES_REDESIGN_PLAN.md`).
 *
 * O caminho NORMAL é `/sessions/:s/settings/...` (mesma `SettingsLayout`,
 * mas dentro de `SessionLayout`, com o rail lateral visível). Esta página
 * existe para quando NÃO há sessão nenhuma para servir de contexto: tenant
 * recém-criado, Workspace vazio, onde o rail não existe por definição e a
 * engrenagem do `Header` aponta para cá. Sem ela, Equipe/Auditoria ficariam
 * inalcançáveis até o primeiro WhatsApp ser conectado.
 *
 * A resolução de seção (incluindo gate por papel e compatibilidade com o
 * `?tab=` antigo) é a MESMA da página de sessão — importada de lá, não
 * reescrita, para as duas montagens nunca divergirem.
 */
export const getServerSideProps: GetServerSideProps<SettingsPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const { session } = guard;
  const role = (session.user?.role as ManagedUserRole | undefined) ?? null;
  const section = resolveSectionFromQuery(context.params?.section, context.query?.tab, role);

  const raw = Array.isArray(context.params?.section) ? context.params?.section[0] : undefined;
  if (raw !== section) {
    return { redirect: { destination: `/settings/${section}`, permanent: false } };
  }

  return { props: { role, section } };
};

export default function SettingsPage({ role, section }: SettingsPageProps): JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-background">
      <Head>
        <title>{pageTitle('Configurações')}</title>
      </Head>

      {/* Cabeçalho enxuto — mesma casca de `SessionHeader`, mas de nível tenant. */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background pl-4 pr-3.5">
        <Link
          href="/app"
          className="flex w-fit items-center gap-2.5"
          title="Voltar para Todos os WhatsApps"
        >
          <FrancisLogo size={22} />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">Francis</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="fx-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1000px] px-6 pb-16 pt-6">
          <h1 className="mb-6 text-[21px] font-semibold tracking-tight text-foreground">
            Configurações
          </h1>
          <SettingsLayout section={section} role={role} basePath="/settings" />
        </div>
      </main>
    </div>
  );
}
