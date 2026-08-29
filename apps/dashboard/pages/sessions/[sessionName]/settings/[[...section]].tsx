import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import SettingsLayout from '@/components/SettingsLayout';
import {
  canSeeSection,
  firstVisibleSection,
  isSettingsSection,
  type SettingsSectionId,
} from '@/components/SettingsSidebar';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';
import type { ManagedUserRole } from '@/lib/clientApi';

interface SessionSettingsPageProps {
  tenantId: string;
  sessionName: string;
  role: ManagedUserRole | null;
  section: SettingsSectionId;
}

/**
 * Configurações dentro de uma sessão — Reestruturação, Fase 3 (2026-08-27,
 * ver `CONFIGURACOES_REDESIGN_PLAN.md`).
 *
 * Catch-all OPCIONAL (`[[...section]]`): atende tanto `/sessions/:s/settings`
 * (sem seção — cai na primeira que o papel pode ver) quanto
 * `/sessions/:s/settings/equipe`. Cada seção é uma URL real, o que resolve
 * o deep-link quebrado da barra de abas antiga (a seção sobrevive a F5, é
 * favoritável e funciona com Ctrl+clique).
 *
 * O gate de permissão roda AQUI, no servidor, antes de renderizar: uma URL
 * que o papel não alcança (`/settings/equipe` com um operator) redireciona
 * para a primeira seção visível em vez de renderizar uma tela vazia ou
 * vazar a existência da seção. Isso é cortesia de UX — a barreira real
 * continua sendo a API, que valida permissão em cada endpoint.
 *
 * Compatibilidade: o `?tab=` da estrutura antiga continua funcionando
 * (mapeado para a seção equivalente), para não quebrar links já salvos.
 */

/**
 * `?tab=` da barra de abas antiga -> seção nova. Mantido para não quebrar
 * links salvos. `profile`/`company` (Auditoria do Perfil, 2026-08-28: "Dados
 * da empresa" também saiu de Configurações) não têm mais seção equivalente
 * aqui — ficam de fora do mapa de propósito e caem no fallback de
 * `resolveSectionFromQuery` (primeira seção visível), mesmo tratamento que
 * `profile` já recebia desde que Perfil saiu.
 */
const LEGACY_TAB_TO_SECTION: Record<string, SettingsSectionId> = {
  whatsapps: 'whatsapps',
  team: 'equipe',
  audit: 'auditoria',
};

export function resolveSectionFromQuery(
  sectionParam: unknown,
  tabParam: unknown,
  role: ManagedUserRole | null,
): SettingsSectionId {
  // `[[...section]]` entrega um array (ou undefined quando a URL não tem seção).
  const raw = Array.isArray(sectionParam) ? sectionParam[0] : sectionParam;
  const legacy = typeof tabParam === 'string' ? LEGACY_TAB_TO_SECTION[tabParam] : undefined;
  const requested = isSettingsSection(raw) ? raw : legacy;

  if (requested && canSeeSection(requested, role)) {
    return requested;
  }
  return firstVisibleSection(role);
}

export const getServerSideProps: GetServerSideProps<SessionSettingsPageProps> = async (
  context,
) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const { session } = guard;
  const sessionName = context.params?.sessionName;
  if (typeof sessionName !== 'string') {
    return { notFound: true };
  }

  const role = (session.user?.role as ManagedUserRole | undefined) ?? null;
  const section = resolveSectionFromQuery(context.params?.section, context.query?.tab, role);

  // URL sem seção (ou com seção inválida/proibida): normaliza para a URL
  // canônica daquela seção, para a barra de endereço nunca discordar do que
  // está na tela.
  const raw = Array.isArray(context.params?.section) ? context.params?.section[0] : undefined;
  if (raw !== section) {
    return {
      redirect: {
        destination: `/sessions/${encodeURIComponent(sessionName)}/settings/${section}`,
        permanent: false,
      },
    };
  }

  return { props: { tenantId: session.tenantId, sessionName, role, section } };
};

export default function SessionSettingsPage({
  tenantId,
  sessionName,
  role,
  section,
}: SessionSettingsPageProps): JSX.Element {
  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Configurações · ${sessionName}`)}</title>
      </Head>
      <div className="fx-scroll h-full overflow-y-auto">
        <div className="max-w-[1000px] px-6 pb-16 pt-5">
          <h1 className="mb-6 text-[21px] font-semibold tracking-tight text-foreground">
            Configurações
          </h1>
          <SettingsLayout
            section={section}
            role={role}
            basePath={`/sessions/${encodeURIComponent(sessionName)}/settings`}
          />
        </div>
      </div>
    </SessionLayout>
  );
}
