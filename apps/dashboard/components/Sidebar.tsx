import Link from 'next/link';
import { useMe } from '@/hooks/useMe';
import { useWaitingForHuman } from '@/hooks/useWaitingForHuman';
import FrancisWordmark from '@/components/brand/FrancisWordmark';

/**
 * DEPRECADO (Milestone 6, Bloco M6H-1/M6H-1b, ADR #74): a navegação
 * tenant-wide deixou de existir. `pages/index.tsx` (Workspace) não tem mais
 * sidebar nenhuma; toda página protegida restante vive dentro de uma sessão
 * (`SessionLayout`/`SessionSidebar`). Nenhuma tela importa este componente
 * mais — mantido só porque o ambiente não permite apagar arquivos.
 *
 * Navegacao lateral (histórico). "Conversas" adicionado na Milestone 3 Bloco
 * 6 (D34); "Analytics" adicionado na Milestone 4 Bloco M4E (D50); "Usuarios"
 * adicionado na Milestone 5 Bloco M5G — visivel SO para administrator/owner
 * (cortesia de UX: quem barra de verdade e a API via requirePermission;
 * esconder o link so evita mostrar uma porta que o cargo nao abre). Sessao
 * de API key tambem NAO ve o link: as rotas de usuarios sao human-only.
 */
export default function Sidebar(): JSX.Element {
  const { user } = useMe();
  const canManageUsers = user?.role === 'administrator' || user?.role === 'owner';
  // Feature N2: contador ao vivo de conversas aguardando humano + som/notificação
  // quando entra uma nova. Vive aqui porque a Sidebar está em toda página
  // protegida — o alerta funciona em qualquer tela.
  const { count: waitingForHuman } = useWaitingForHuman();

  return (
    <aside className="w-64 bg-white shadow-md p-4">
      {/* M6B-3: marca no topo da navegação (antes começava direto nos links). */}
      <Link href="/" className="mb-6 block">
        <FrancisWordmark />
      </Link>
      <nav className="flex flex-col space-y-2">
        <Link href="/" className="text-gray-700 hover:text-blue-600">
          Dashboard
        </Link>
        <Link
          href="/conversations"
          className="flex items-center justify-between text-gray-700 hover:text-blue-600"
        >
          <span>Conversas</span>
          {waitingForHuman > 0 && (
            <span
              className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white"
              title={`${waitingForHuman} conversa(s) aguardando atendimento humano`}
            >
              {waitingForHuman}
            </span>
          )}
        </Link>
        <Link href="/analytics" className="text-gray-700 hover:text-blue-600">
          Analytics
        </Link>
        {canManageUsers && (
          <Link href="/ai-profile" className="text-gray-700 hover:text-blue-600">
            Cérebro da IA
          </Link>
        )}
        {canManageUsers && (
          <Link href="/users" className="text-gray-700 hover:text-blue-600">
            Usuários
          </Link>
        )}
      </nav>
    </aside>
  );
}
