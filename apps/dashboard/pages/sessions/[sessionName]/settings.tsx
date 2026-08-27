import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import SettingsTabs, { resolveInitialTab, type SettingsTab } from '@/components/SettingsTabs';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';
import type { ManagedUserRole } from '@/lib/clientApi';

interface SessionSettingsPageProps {
  tenantId: string;
  sessionName: string;
  role: ManagedUserRole | null;
  hasUser: boolean;
  initialTab: SettingsTab;
}

/**
 * Configurações DENTRO de uma sessão — Reorganização Perfil/Configurações,
 * 3ª rodada (2026-08-27, ver DECISIONS.md #106).
 *
 * Histórico curto desta rota, porque ela mudou de papel três vezes na mesma
 * semana e o motivo importa:
 * 1. Redesign 2026-08-05 (R2): nasceu com as abas Conexão/Equipe/Auditoria.
 * 2. 1ª rodada desta reorganização: virou REDIRECT para `/settings` (nível
 *    tenant), porque Equipe/Auditoria são do tenant inteiro, não daquele
 *    WhatsApp.
 * 3. AGORA: volta a ser página real — mas com o conteúdo NOVO
 *    (`SettingsTabs`: Perfil/WhatsApps/Equipe/Auditoria). Motivo, reportado
 *    pelo fundador ao testar: `/settings` era uma página SOLTA, sem
 *    `SessionLayout`, então abrir Configurações fazia "sumir todo o menu à
 *    esquerda" (Conversas/Pipeline/Campanhas/…) — o operador ficava sem
 *    navegação, preso numa tela sem saída óbvia. Montada aqui, dentro de
 *    `SessionLayout`, o rail continua visível e a engrenagem fica destacada
 *    como qualquer outro destino.
 *
 * O conteúdo é IDÊNTICO ao de `/settings` (mesmo `SettingsTabs`) — só a
 * moldura muda. `/settings` continua existindo para o caso em que não há
 * sessão nenhuma (tenant recém-criado, Workspace vazio).
 */
export const getServerSideProps: GetServerSideProps<SessionSettingsPageProps> = async (context) => {
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
  const hasUser = Boolean(session.user);
  return {
    props: {
      tenantId: session.tenantId,
      sessionName,
      role,
      hasUser,
      initialTab: resolveInitialTab(context.query?.tab, role, hasUser),
    },
  };
};

export default function SessionSettingsPage({
  tenantId,
  sessionName,
  role,
  hasUser,
  initialTab,
}: SessionSettingsPageProps): JSX.Element {
  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Configurações · ${sessionName}`)}</title>
      </Head>
      <div className="fx-scroll h-full overflow-y-auto">
        <div className="max-w-[900px] px-6 pb-16 pt-5">
          <h1 className="text-[21px] font-semibold tracking-tight text-foreground">
            Configurações
          </h1>
          <p className="mb-5 mt-1 text-[13px] text-muted-foreground">
            WhatsApps, equipe, auditoria e seu perfil pessoal.
          </p>
          <SettingsTabs role={role} hasUser={hasUser} initialTab={initialTab} />
        </div>
      </div>
    </SessionLayout>
  );
}
