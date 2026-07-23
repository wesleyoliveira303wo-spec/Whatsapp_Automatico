import { useCallback, useState, type FormEvent, type KeyboardEvent } from 'react';
import { sendConversationMessage, ClientApiError } from '@/lib/clientApi';

interface MessageComposerProps {
  conversationId: string;
  /** Chamado após um envio aceito (202) — a página usa para forçar um refresh imediato da timeline. */
  onSent: () => void;
}

const MAX_LENGTH = 4096;

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    const code = (error.body as { error?: string } | undefined)?.error;
    if (code === 'conversation_not_human') return 'Assuma a conversa antes de responder.';
    if (code === 'conversation_forbidden') return 'Esta conversa foi assumida por outra pessoa.';
    if (error.status === 403) return 'Seu cargo não permite enviar mensagens.';
    if (error.status === 401) return 'Sessão expirada. Entre novamente.';
  }
  return 'Não foi possível enviar. Tente novamente.';
}

/**
 * Caixa de resposta do operador (feature N2). Aparece só quando a conversa está
 * em "human" (o operador assumiu). Envia via a API (202 enfileirado) e chama
 * `onSent` para a página atualizar a timeline na hora — a mensagem enviada
 * aparece assim que o consumer a entrega e o tempo real (N2-4) a traz.
 * Enter envia; Shift+Enter quebra linha.
 */
export default function MessageComposer({ conversationId, onSent }: MessageComposerProps): JSX.Element {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = useCallback(async (): Promise<void> => {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setErrorMessage(null);
    try {
      await sendConversationMessage(conversationId, trimmed);
      setContent('');
      onSent();
    } catch (error) {
      setErrorMessage(errorMessageFor(error));
    } finally {
      setSending(false);
    }
  }, [content, sending, conversationId, onSent]);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void submit();
    },
    [submit],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void submit();
      }
    },
    [submit],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-end gap-2">
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escreva sua resposta… (Enter envia, Shift+Enter quebra linha)"
          rows={2}
          maxLength={MAX_LENGTH}
          className="flex-1 resize-none rounded-md border border-gray-300 p-2 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={sending || content.trim().length === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
      {errorMessage && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
