import Link from 'next/link';
import { useRouter } from 'next/router';
import { LogOut, Settings } from 'lucide-react';
import FrancisWordmark from '@/components/brand/FrancisWordmark';
import ThemeToggle from '@/components/ThemeToggle';
import { logout } from '@/lib/clientApi';

interface HeaderProps {
  /** Opcional (M2, Fase 4): páginas protegidas passam `tenantId` (vindo de `getServerSideProps`/`requirePageSession`); `pages/login.tsx` não passa nada — nenhum tenant autenticado ainda. */
  tenantId?: string;
}

/**
 * Cabeçalho do Workspace/Login (M2, Fase 4).
 *
 * Reorganização Perfil/Configurações (2026-08-27, ver DECISIONS.md #106) —
 * a identificação de quem está logado (e-mail/cargo), "Trocar senha" e
 * "Sair" SAÍRAM daqui: viviam como texto solto desde o M5G, mas essas três
 * coisas são sobre a PESSOA, não sobre o Workspace — migraram para
 * `/settings` (aba Perfil). No lugar, um ícone de engrenagem abre essa
 * mesma dashboard de Configurações — o Workspace é alcançável SEM nenhuma
 * sessão de WhatsApp conectada ainda, então Configurações (Equipe/Auditoria/
 * Empresa) precisa ser alcançável daqui também, não só de dentro de uma
 * sessão (ver `SessionRail`).
 */
export default function Header({ tenantId }: HeaderProps): JSX.Element {
  const router = useRouter();

  async function handleLogout(): Promise<void> {
    await logout();
    await router.push('/login');
  }

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
      <Link href="/app">
        <FrancisWordmark size={24} />
      </Link>
      <div className="flex items-center gap-2">
        {tenantId && (
          <Link
            href="/settings"
            title="Configurações"
            aria-label="Configurações"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
          </Link>
        )}
        {/* Redesign 2026-08-05 (R1) — visível em toda página (inclusive login), mesmo padrão de um toggle de tema global. */}
        <ThemeToggle />
        {tenantId && (
          <button
            type="button"
            onClick={handleLogout}
            title="Sair"
            aria-label="Sair"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-[17px] w-[17px]" aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
}
