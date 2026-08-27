import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import SessionConnectionPanel from '@/components/SessionConnectionPanel';
import UserManagementPanel from '@/components/UserManagementPanel';
import AuditLogPanel from '@/components/AuditLogPanel';
import { TabList, TabTrigger } from '@/components/ui/tabs-nav';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';
import type { ManagedUserRole } from '@/lib/clientApi';

type SettingsTab = 'connection' | 'team' | 'audit';

interface SettingsPageProps {
  tenantId: string;
  sessionName: string;
  role: ManagedUserRole | null;
  initialTab: SettingsTab;
}

function isSettingsTab(value: unknown): value is SettingsTab {
  return value === 'connection' || value === 'team' || value === 'audit';
}

function canSeeTeam(role: ManagedUserRole | null): boolean {
  return role === 'administrator' || role === 'owner';
}

function canSeeAudit(role: ManagedUserRole | null): boolean {
  return role === 'manager' || role === 'administrator' || role === 'owner';
}

/**
 * Redesign 2026-08-05 (R2) — agrupa "Configurações" (conexão/QR), "Equipe" e
 * "Auditoria" sob um único item de rail, como abas. Diferente de `ai.tsx`
 * (gate único para a página inteira), aqui CADA aba tem seu PRÓPRIO gate —
 * "Conexão" é visível a qualquer papel (sempre foi), "Equipe" só
 * administrator/owner, "Auditoria" desde manager (`audit:read` já é mais
 * permissivo que `user:*`, ADR de F1.5 preservada). Por isso não há redirect
 * de página inteira: a página sempre renderiza, só as abas que o papel não
 * pode ver ficam de fora da `TabList` — a barreira real continua sendo a API.
 *
 * Se a aba pedida por `?tab=` não é visível para o papel logado, cai em
 * "connection" (sempre visível) em vez de mostrar uma aba vazia/quebrada.
 *
 * Rotas antigas `/sessions/:s` (Configurações), `/users` e `/audit-logs`
 * (arquivos preservados, viraram redirect) apontam para cá.
 *
 * 2026-08-15 (pedido do fundador): "Leads" (Fase L, Bloco L1b) SAIU daqui —
 * virou item próprio do rail principal (`ContactsPanel`, ver
 * `pages/sessions/[sessionName]/contacts.tsx`/`SessionRail.tsx`), renomeado
 * para "Contatos". Não é mais uma aba administrativa: é destino de trabalho
 * do dia a dia, no mesmo nível de Conversas/Pipeline.
 *
 * 2026-08-26 (pedido do fundador): "Tags" também SAIU daqui, mesmo motivo —
 * a gestão do catálogo (`TagsPanel`) migrou para dentro do botão "+ Tag" do
 * `ConversationTagPicker`, na dashboard de Conversas, junto de onde as tags
 * já eram atribuídas a um contato (mesmo padrão de Respostas Rápidas,
 * 2026-08-25). `?tab=tags` (se algum link antigo apontar aqui) cai no
 * default "connection" — `isSettingsTab` não reconhece mais o valor.
 */
export const getServerSideProps: GetServerSideProps<SettingsPageProps> = async (context) => {
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
  const requestedTab = context.query?.tab;
  let initialTab: SettingsTab = isSettingsTab(requestedTab) ? requestedTab : 'connection';
  if (initialTab === 'team' && !canSeeTeam(role)) initialTab = 'connection';
  if (initialTab === 'audit' && !canSeeAudit(role)) initialTab = 'connection';
  return { props: { tenantId: session.tenantId, sessionName, role, initialTab } };
};

export default function SettingsPage({
  tenantId,
  sessionName,
  role,
  initialTab,
}: SettingsPageProps): JSX.Element {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const showTeam = canSeeTeam(role);
  const showAudit = canSeeAudit(role);

  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Configurações · ${sessionName}`)}</title>
      </Head>
      <div className="fx-scroll h-full overflow-y-auto">
        <div className="max-w-[840px] px-6 pb-12 pt-5">
          <h1 className="text-[21px] font-semibold tracking-tight text-foreground">
            Configurações
          </h1>
          <p className="mb-5 mt-1 text-[13px] text-muted-foreground">
            Conexão, equipe e auditoria da sessão {sessionName}.
          </p>

          <div className="mb-5">
            <TabList ariaLabel="Seção de Configurações" variant="underline">
              <TabTrigger
                active={tab === 'connection'}
                variant="underline"
                onClick={() => setTab('connection')}
              >
                Conexão
              </TabTrigger>
              {showTeam && (
                <TabTrigger
                  active={tab === 'team'}
                  variant="underline"
                  onClick={() => setTab('team')}
                >
                  Equipe
                </TabTrigger>
              )}
              {showAudit && (
                <TabTrigger
                  active={tab === 'audit'}
                  variant="underline"
                  onClick={() => setTab('audit')}
                >
                  Auditoria
                </TabTrigger>
              )}
            </TabList>
          </div>

          {tab === 'connection' && <SessionConnectionPanel sessionName={sessionName} />}
          {tab === 'team' && showTeam && <UserManagementPanel />}
          {tab === 'audit' && showAudit && <AuditLogPanel />}
        </div>
      </div>
    </SessionLayout>
  );
}
