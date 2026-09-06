import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Activity, Building2, Home, LifeBuoy, LogOut, ScrollText } from 'lucide-react';

import FrancisLogo from '@/components/brand/FrancisLogo';
import AdminSearch from '@/components/admin/AdminSearch';
import { Button } from '@/components/ui/button';
import { platformLogout, type PlatformAdmin } from '@/lib/platformClientApi';
import { cn } from '@/lib/utils';

/**
 * Casca do `/admin` — Fase 1 (`ADMIN_PLATFORM_MASTER_PLAN.md` §3.5).
 *
 * Os cinco destinos já aparecem, porque a estrutura de navegação foi decidida
 * junto com o plano e escondê-la agora só faria a próxima fase reorganizar
 * tudo de novo. O que ainda não existe é dito na própria tela ("em breve"),
 * em vez de mostrar um número inventado — a mesma disciplina que o produto
 * segue desde a Fase L: nenhum indicador sem dado real por trás.
 *
 * Escura de forma fixa, igual ao login do painel: a diferença visual em
 * relação ao produto é intencional, para nunca haver dúvida sobre em qual das
 * duas superfícies o fundador está.
 */
export interface AdminNavItem {
  href: string;
  label: string;
  icon: typeof Home;
  /** Fases 2–6: o item aparece, mas ainda não leva a lugar nenhum. */
  comingSoon?: boolean;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: 'Início', icon: Home },
  // Tenants: Fase 2. Início (KPIs + Fila de ação) e Saúde: Fase 3. Suporte:
  // Fase 5. Auditoria segue na próxima fase (§15).
  { href: '/admin/tenants', label: 'Tenants', icon: Building2 },
  { href: '/admin/support', label: 'Suporte', icon: LifeBuoy },
  { href: '/admin/health', label: 'Saúde', icon: Activity },
  { href: '/admin/audit', label: 'Auditoria', icon: ScrollText, comingSoon: true },
];

export interface AdminShellProps {
  admin: PlatformAdmin;
  children: ReactNode;
}

export default function AdminShell({ admin, children }: AdminShellProps): JSX.Element {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function handleLogout(): Promise<void> {
    setLeaving(true);
    // Sai da tela mesmo se a chamada falhar: o cookie é descartado pelo BFF em
    // qualquer caso, então insistir aqui só prenderia o fundador numa sessão
    // que ele já pediu para encerrar.
    try {
      await platformLogout();
    } catch {
      // Ignorado de propósito — ver acima.
    }
    await router.replace('/admin/login');
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl gap-6 px-4 py-6">
        <nav aria-label="Painel da plataforma" className="hidden w-52 shrink-0 flex-col md:flex">
          <div className="mb-6 flex items-center gap-2.5 px-2">
            <FrancisLogo size={28} />
            <div className="leading-tight">
              <p className="text-sm font-semibold">Plataforma</p>
              <p className="text-xs text-muted-foreground">Painel do dono</p>
            </div>
          </div>

          <ul className="space-y-1">
            {ADMIN_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = router.pathname === item.href;
              const className = cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              );

              return (
                <li key={item.href}>
                  {item.comingSoon ? (
                    // Um item que ainda não existe não vira link quebrado:
                    // fica visível, desabilitado e explicado.
                    <span
                      aria-disabled="true"
                      title="Disponível em uma próxima fase"
                      className={cn(className, 'cursor-default opacity-50')}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {item.label}
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className={className}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {item.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          <header className="mb-6 flex flex-wrap items-center gap-3 border-b border-border pb-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{admin.name}</p>
              <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
            </div>
            {/* Busca global — Fase 6 (§7). */}
            <div className="order-last w-full sm:order-none sm:ml-auto sm:w-auto">
              <AdminSearch />
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} disabled={leaving}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Sair
            </Button>
          </header>

          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
