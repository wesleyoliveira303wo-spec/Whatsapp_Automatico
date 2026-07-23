import Link from 'next/link';
import { useRouter } from 'next/router';
import { logout } from '@/lib/clientApi';
import { useMe } from '@/hooks/useMe';

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
 */
export default function Header({ tenantId }: HeaderProps): JSX.Element {
  const router = useRouter();
  const { user } = useMe();

  async function handleLogout(): Promise<void> {
    await logout();
    await router.push('/login');
  }

  return (
    <header className="bg-white shadow p-4 flex items-center justify-between">
      <h1 className="text-2xl font-bold text-gray-800">WhatsApp Automation Dashboard</h1>
      {tenantId && (
        <div className="flex items-center gap-4">
          {user ? (
            <span className="text-sm text-gray-500">
              {user.email} · <span className="font-medium text-gray-700">{ROLE_LABELS[user.role] ?? user.role}</span>
            </span>
          ) : (
            <span className="text-sm text-gray-500">Tenant: {tenantId}</span>
          )}
          {user && (
            <Link href="/change-password" className="text-sm text-blue-600 hover:underline">
              Trocar senha
            </Link>
          )}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sair
          </button>
        </div>
      )}
    </header>
  );
}
