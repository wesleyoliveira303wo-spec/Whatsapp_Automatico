import Link from 'next/link';
import { useRouter } from 'next/router';
import { logout } from '@/lib/clientApi';
import { useMe } from '@/hooks/useMe';
import FrancisWordmark from '@/components/brand/FrancisWordmark';
import ThemeToggle from '@/components/ThemeToggle';

interface HeaderProps {
  /** Opcional (M2, Fase 4): páginas protegidas passam `tenantId` (vindo de `getServerSideProps`/`requirePageSession`); `pages/login.tsx` não passa nada — nenhum tenant autenticado ainda. */
  tenantId?: string;
}

/** Rótulos amigáveis dos cargos (M5G) — os valores crus vêm do RBAC da API. */
const ROLE_LABELS: Record<string, string> = {
  owner: 'Dono',
  administrator: 'Administrador',
  manager: 'Gerente',
  operator: 'Operador',
  read_only: 'Somente leitura',
};

/**
 * Cabeçalho do Dashboard (M2, Fase 4). Ganhou o botão de logout (único lugar
 * que chama `POST /api/auth/logout`) e, no M5G, a identificação de QUEM está
 * logado: sessão de PESSOA mostra e-mail + cargo + atalho para trocar senha;
 * sessão de API key mantém o visual antigo (só o tenant).
 *
 * Milestone 6, Bloco M6H-1: o título fixo "WhatsApp Automation Dashboard"
 * saiu — cada página já tem seu próprio `<h1>` (redundante) e, com o
 * Workspace (nível 1) agora sem `Sidebar`, era o único lugar sobrando pra
 * marca aparecer. Vira a `FrancisWordmark` compacta, consistente nos dois
 * níveis de navegação (Workspace e Sessão).
 */
export default function Header({ tenantId }: HeaderProps): JSX.Element {
  const router = useRouter();
  const { user } = useMe();

  async function handleLogout(): Promise<void> {
    await logout();
    await router.push('/login');
  }

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
      <Link href="/">
        <FrancisWordmark size={24} />
      </Link>
      <div className="flex items-center gap-4">
        {tenantId && (
          <>
            {user ? (
              <span className="text-sm text-muted-foreground">
                {user.email} ·{' '}
                <span className="font-medium text-foreground">
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Tenant: {tenantId}</span>
            )}
            {user && (
              <Link href="/change-password" className="text-sm text-primary hover:underline">
                Trocar senha
              </Link>
            )}
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Sair
            </button>
          </>
        )}
        {/* Redesign 2026-08-05 (R1) — visível em toda página (inclusive login), mesmo padrão de um toggle de tema global. Move para o rodapé do rail na R2. */}
        <ThemeToggle />
      </div>
    </header>
  );
}
