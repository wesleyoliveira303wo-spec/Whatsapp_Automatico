import { useState } from 'react';
import { escalateConversation, resumeConversation, ClientApiError } from '@/lib/clientApi';
import type { ConversationStatus, ConversationSummary } from '@/lib/clientApi';

interface ConversationActionsProps {
  conversationId: string;
  status: ConversationStatus;
  /** Recebe a `Conversation` atualizada devolvida pela API (escalate/resume sao idempotentes e devolvem o estado novo) — a pagina aplica via `applyUpdate` do hook, sem rebuscar nada. */
  onUpdated: (conversation: ConversationSummary) => void;
}

/**
 * Acoes de escalonamento (Milestone 3, Bloco 6 — D31): assumir conversa
 * (bot -> humano) / devolver ao bot (humano -> bot). Feedback via BANNER
 * INLINE de sucesso/erro (decisao aprovada: sem toast, sem dependencia
 * nova) — diferente de `SessionActions` (M2), que nao tem feedback de
 * sucesso porque a tela inteira e viva via SSE; aqui o detalhe NAO tem SSE
 * (D23), entao a confirmacao explicita importa.
 */
export default function ConversationActions({ conversationId, status, onUpdated }: ConversationActionsProps): JSX.Element {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function run(action: 'escalate' | 'resume'): Promise<void> {
    setPending(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = action === 'escalate' ? await escalateConversation(conversationId) : await resumeConversation(conversationId);
      onUpdated(updated);
      setSuccessMessage(action === 'escalate' ? 'Conversa assumida — a IA parou de responder.' : 'Conversa devolvida ao bot — a IA voltou a responder.');
    } catch (error) {
      if (error instanceof ClientApiError && error.status === 404) {
        setErrorMessage('Conversa nao encontrada.');
      } else {
        setErrorMessage('Falha ao executar a acao. Tente novamente.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {status === 'bot' ? (
          <button
            type="button"
            onClick={() => void run('escalate')}
            disabled={pending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Assumindo…' : 'Assumir conversa'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void run('resume')}
            disabled={pending}
            className="rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Devolvendo…' : 'Devolver ao bot'}
          </button>
        )}
      </div>
      {successMessage && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
          {successMessage}
        </p>
      )}
      {errorMessage && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
