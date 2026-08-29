import Link from 'next/link';
import { Clock, Smartphone, Users, ShieldCheck, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ManagedUserRole } from '@/lib/clientApi';

/** Uma seção de Configurações. `id` é o segmento da URL (`/settings/:id`). */
export type SettingsSectionId = 'atendimento' | 'whatsapps' | 'equipe' | 'seguranca' | 'auditoria';

interface SectionDef {
  id: SettingsSectionId;
  label: string;
  icon: typeof Clock;
  /** Grupo que rotula esta seção na sidebar. */
  group: 'EMPRESA' | 'CANAIS' | 'PESSOAS' | 'REGISTROS';
  /** `undefined` = visível a qualquer papel autenticado. */
  requiresRole?: (role: ManagedUserRole | null) => boolean;
}

const canManageUsers = (role: ManagedUserRole | null): boolean =>
  role === 'administrator' || role === 'owner';
const canSeeAudit = (role: ManagedUserRole | null): boolean =>
  role === 'manager' || role === 'administrator' || role === 'owner';
const isOwner = (role: ManagedUserRole | null): boolean => role === 'owner';

/**
 * Catálogo das seções — fonte ÚNICA da estrutura de Configurações. A página,
 * a sidebar e o guard de rota (`getServerSideProps`) leem daqui, para não
 * existir uma lista de seções na navegação e outra, divergente, no gate de
 * permissão (foi assim que a barra de abas antiga acabou mostrando formatos
 * diferentes por papel sem ninguém notar).
 *
 * "Dados da empresa" SAIU do catálogo na Auditoria do Perfil (2026-08-28,
 * pedido explícito do fundador) — mudou para o Perfil (`ProfileSettingsTab`)
 * junto com a identidade da pessoa. Ver docstring de `SettingsLayout`.
 */
export const SETTINGS_SECTIONS: readonly SectionDef[] = [
  { id: 'atendimento', label: 'Atendimento', icon: Clock, group: 'EMPRESA' },
  { id: 'whatsapps', label: 'WhatsApps', icon: Smartphone, group: 'CANAIS' },
  { id: 'equipe', label: 'Equipe', icon: Users, group: 'PESSOAS', requiresRole: canManageUsers },
  { id: 'seguranca', label: 'Segurança', icon: ShieldCheck, group: 'PESSOAS', requiresRole: isOwner },
  {
    id: 'auditoria',
    label: 'Auditoria',
    icon: ScrollText,
    group: 'REGISTROS',
    requiresRole: canSeeAudit,
  },
] as const;

export function isSettingsSection(value: unknown): value is SettingsSectionId {
  return (
    typeof value === 'string' && SETTINGS_SECTIONS.some((section) => section.id === value)
  );
}

/** A seção é visível para este papel? Usado pela sidebar E pelo guard de rota. */
export function canSeeSection(id: SettingsSectionId, role: ManagedUserRole | null): boolean {
  const section = SETTINGS_SECTIONS.find((s) => s.id === id);
  if (!section) return false;
  return section.requiresRole ? section.requiresRole(role) : true;
}

/** Primeira seção que este papel pode ver — destino do fallback quando a URL pede algo proibido. */
export function firstVisibleSection(role: ManagedUserRole | null): SettingsSectionId {
  const first = SETTINGS_SECTIONS.find((s) => canSeeSection(s.id, role));
  return first?.id ?? 'whatsapps';
}

interface SettingsSidebarProps {
  active: SettingsSectionId;
  role: ManagedUserRole | null;
  /** Base da URL — `/sessions/:s/settings` dentro de uma sessão, `/settings` fora. */
  basePath: string;
}

/**
 * Navegação interna de Configurações — Reestruturação, Fase 3 (2026-08-27,
 * ver `CONFIGURACOES_REDESIGN_PLAN.md`).
 *
 * Substitui a barra de abas horizontal. Motivos (auditoria §P4/§P1):
 * - a barra plana não escala: eram 4 abas, a arquitetura nova prevê 6 seções;
 * - com gate por papel, a barra MUDAVA DE FORMA conforme quem entrava
 *   (operator via 2 itens, owner via 4) — parecia um resto, não um lugar;
 * - grupos rotulados (EMPRESA / CANAIS / PESSOAS / REGISTROS) comunicam
 *   ESCOPO, que era exatamente o que faltava: "minha empresa" ≠ "minhas
 *   pessoas" ≠ "meus canais".
 *
 * Cada item é um `<Link>` para uma URL real (`.../settings/equipe`), não um
 * `onClick` com estado local — resolve o deep-link quebrado (§P5): a seção
 * sobrevive a F5, é favoritável e funciona com Ctrl+clique.
 */
export default function SettingsSidebar({
  active,
  role,
  basePath,
}: SettingsSidebarProps): JSX.Element {
  const visible = SETTINGS_SECTIONS.filter((section) => canSeeSection(section.id, role));
  const groups = ['EMPRESA', 'CANAIS', 'PESSOAS', 'REGISTROS'] as const;

  return (
    <nav aria-label="Seções de Configurações" className="w-full shrink-0 sm:w-[210px]">
      {groups.map((group) => {
        const items = visible.filter((section) => section.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="mb-5 last:mb-0">
            <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {group}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map(({ id, label, icon: Icon }) => {
                const isActive = id === active;
                return (
                  <li key={id}>
                    <Link
                      href={`${basePath}/${id}`}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isActive
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
