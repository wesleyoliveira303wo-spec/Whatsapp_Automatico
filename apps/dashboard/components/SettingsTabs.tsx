import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Smartphone, Users, ScrollText, UserCircle } from 'lucide-react';
import WhatsAppsSettingsTab from '@/components/WhatsAppsSettingsTab';
import UserManagementPanel from '@/components/UserManagementPanel';
import AuditLogPanel from '@/components/AuditLogPanel';
import ProfileSettingsTab from '@/components/ProfileSettingsTab';
import { TabList, TabTrigger } from '@/components/ui/tabs-nav';
import { fadeIn } from '@/lib/motion';
import type { ManagedUserRole } from '@/lib/clientApi';

export type SettingsTab = 'profile' | 'whatsapps' | 'team' | 'audit';

const VALID_TABS: readonly SettingsTab[] = ['profile', 'whatsapps', 'team', 'audit'];

export function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === 'string' && (VALID_TABS as readonly string[]).includes(value);
}

export function canSeeTeam(role: ManagedUserRole | null): boolean {
  return role === 'administrator' || role === 'owner';
}

export function canSeeAudit(role: ManagedUserRole | null): boolean {
  return role === 'manager' || role === 'administrator' || role === 'owner';
}

/**
 * Resolve a aba inicial a partir de `?tab=`, respeitando os gates de papel.
 * Compartilhado pelas DUAS páginas que montam estas abas (dentro e fora de
 * uma sessão) — a regra de gate vive num lugar só.
 */
export function resolveInitialTab(
  requestedTab: unknown,
  role: ManagedUserRole | null,
  hasUser: boolean,
): SettingsTab {
  // Default = "profile" (pedido do fundador, 2026-08-27): a engrenagem abre
  // primeiro no que é DELE (a pessoa), não na administração do workspace.
  // Sessão de MÁQUINA (API key) não tem pessoa — cai em "whatsapps".
  const fallback: SettingsTab = hasUser ? 'profile' : 'whatsapps';
  let tab: SettingsTab = isSettingsTab(requestedTab) ? requestedTab : fallback;
  if (tab === 'team' && !canSeeTeam(role)) tab = fallback;
  if (tab === 'audit' && !canSeeAudit(role)) tab = fallback;
  if (tab === 'profile' && !hasUser) tab = 'whatsapps';
  return tab;
}

interface SettingsTabsProps {
  role: ManagedUserRole | null;
  hasUser: boolean;
  initialTab: SettingsTab;
}

/**
 * Conteúdo de Configurações (Reorganização Perfil/Configurações, 2026-08-27
 * — ver DECISIONS.md #106): as 4 abas e seus gates de papel, extraídos da
 * página para um componente próprio na 3ª rodada, quando Configurações
 * passou a ser montada em DOIS lugares:
 *
 * - `/sessions/:s/settings` — DENTRO de `SessionLayout`, com o rail lateral
 *   (Conversas/Pipeline/…) sempre visível. É o caminho normal, pela
 *   engrenagem do rail: o fundador reportou que perder o menu ao abrir
 *   Configurações quebrava a navegação ("some todo o menu à esquerda").
 * - `/settings` — sem rail, para quando NÃO há sessão nenhuma (Workspace de
 *   um tenant recém-criado, onde o rail não existe por definição).
 *
 * Extrair evita a duplicação que as duas montagens gerariam — a lista de
 * abas, os gates e o cross-fade vivem só aqui.
 *
 * CORREÇÃO 2026-08-27 (achado real do fundador, 6ª rodada): o avatar do
 * rail e a engrenagem levam para a MESMA página (`/sessions/:s/settings`),
 * só o `?tab=` muda — navegar de um para o outro via `<Link>` NÃO remonta
 * o componente (Next.js reaproveita a instância entre navegações client-side
 * do mesmo `pathname`). Resultado: `useState(initialTab)` só valia na
 * PRIMEIRA montagem — clicar no avatar (WhatsApps) e depois na engrenagem
 * (deveria ser Perfil) continuava mostrando WhatsApps, porque o estado
 * nunca era resincronizado com o `initialTab` novo vindo do
 * `getServerSideProps` da navegação seguinte. O `useEffect` abaixo
 * resincroniza sempre que `initialTab` mudar (é o valor que a URL/servidor
 * realmente pediu) — sem isso, qualquer par de links para esta mesma
 * página com abas iniciais diferentes teria o mesmo bug.
 */
export default function SettingsTabs({
  role,
  hasUser,
  initialTab,
}: SettingsTabsProps): JSX.Element {
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const showTeam = canSeeTeam(role);
  const showAudit = canSeeAudit(role);
  const canManageCompany = role === 'owner';

  return (
    <>
      <div className="mb-6">
        <TabList ariaLabel="Seção de Configurações" variant="underline">
          {/* Perfil PRIMEIRO (pedido do fundador): a engrenagem abre no que é da pessoa. */}
          {hasUser && (
            <TabTrigger
              active={tab === 'profile'}
              variant="underline"
              icon={<UserCircle className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => setTab('profile')}
            >
              Perfil
            </TabTrigger>
          )}
          <TabTrigger
            active={tab === 'whatsapps'}
            variant="underline"
            icon={<Smartphone className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => setTab('whatsapps')}
          >
            WhatsApps
          </TabTrigger>
          {showTeam && (
            <TabTrigger
              active={tab === 'team'}
              variant="underline"
              icon={<Users className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => setTab('team')}
            >
              Equipe
            </TabTrigger>
          )}
          {showAudit && (
            <TabTrigger
              active={tab === 'audit'}
              variant="underline"
              icon={<ScrollText className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => setTab('audit')}
            >
              Auditoria
            </TabTrigger>
          )}
        </TabList>
      </div>

      {/*
        Cross-fade suave ao trocar de aba (`fadeIn`, vocabulário único de
        movimento — `lib/motion.ts`) — a troca de aba deixa de ser um
        "corte seco", reforça que é a MESMA tela mudando de conteúdo.
      */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} variants={fadeIn} initial="hidden" animate="visible" exit="hidden">
          {tab === 'whatsapps' && <WhatsAppsSettingsTab />}
          {tab === 'team' && showTeam && <UserManagementPanel />}
          {tab === 'audit' && showAudit && <AuditLogPanel />}
          {tab === 'profile' && hasUser && (
            <ProfileSettingsTab canManageCompany={canManageCompany} />
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
