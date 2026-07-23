import { useState } from 'react';
import { useRouter } from 'next/router';
import { connectSession, disconnectSession, removeSession, ClientApiError } from '@/lib/clientApi';
import type { WhatsAppSessionStatus } from '@/lib/clientApi';

interface SessionActionsProps {
  sessionName: string;
  status: WhatsAppSessionStatus;
}

/**
 * Ações do detalhe de sessão (M2, Fase 4 — UI-2): reconectar, desconectar,
 * remover. Cada botão chama a rota BFF correspondente (Fase 3) e não
 * atualiza estado local nenhum — a tela toda já está viva via SSE
 * (`useSessionDetail`, UI-3), então o próximo tick (~2s) reflete o efeito
 * de qualquer ação sozinho, sem essa tela precisar re-buscar nada por
 * conta própria.
 *
 * `remove` é destrutivo e irreversível (apaga registro + credenciais, ver
 * `WhatsAppSessionService.removeSession()`) — exige confirmação via
 * `window.confirm` (suficiente para este painel interno de operador; não
 * há necessidade de um modal customizado para uma ação de baixa frequência
 * como esta) e, em caso de sucesso, volta para a lista (a sessão removida
 * não existe mais para se ter um detalhe).
 */
export default function SessionActions({ sessionName, status }: SessionActionsProps): JSX.Element {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<'connect' | 'disconnect' | 'remove' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function run(action: 'connect' | 'disconnect' | 'remove'): Promise<void> {
    setPendingAction(action);
    setErrorMessage(null);
    try {
      if (action === 'connect') {
        await connectSession(sessionName);
      } else if (action === 'disconnect') {
        await disconnectSession(sessionName);
      } else {
        if (!window.confirm(`Remover a sessão "${sessionName}" definitivamente? Essa ação não pode ser desfeita.`)) {
          setPendingAction(null);
          return;
        }
        await removeSession(sessionName);
        await router.push('/');
        return;
      }
    } catch (error) {
      const message = error instanceof ClientApiError ? 'Falha ao executar a ação. Tente novamente.' : 'Falha de rede.';
      setErrorMessage(message);
    } finally {
      setPendingAction(null);
    }
  }

  const busy = pendingAction !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {status === 'disconnected' && (
          <button
            type="button"
            onClick={() => void run('connect')}
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {pendingAction === 'connect' ? 'Conectando…' : 'Reconectar'}
          </button>
        )}
        {status !== 'disconnected' && (
          <button
            type="button"
            onClick={() => void run('disconnect')}
            disabled={busy}
            className="rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingAction === 'disconnect' ? 'Desconectando…' : 'Desconectar'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void run('remove')}
          disabled={busy}
          className="rounded-md bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === 'remove' ? 'Removendo…' : 'Remover definitivamente'}
        </button>
      </div>
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
    </div>
  );
}
