import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { connectSession, ClientApiError } from '@/lib/clientApi';

/**
 * Formulário de criação/conexão de uma nova sessão (M2, Fase 4 — UI-1).
 * `POST /api/sessions` (Fase 3) é idempotente do lado da API (reconecta se
 * já existir — ver docstring do Router de `apps/api`), então este
 * formulário serve tanto para "criar" quanto para "reconectar por nome"
 * sem precisar saber qual dos dois vai acontecer. Após sucesso, navega para
 * o detalhe (`/sessions/:sessionName`) — é lá que o QR Code aparece.
 */
export default function CreateSessionForm(): JSX.Element {
  const router = useRouter();
  const [sessionName, setSessionName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = sessionName.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await connectSession(trimmed);
      await router.push(`/sessions/${encodeURIComponent(trimmed)}`);
    } catch (error) {
      const message = error instanceof ClientApiError ? bodyMessage(error.body) : 'Falha ao conectar sessão.';
      setErrorMessage(message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex-1">
        <label htmlFor="sessionName" className="mb-1 block text-sm font-medium text-gray-700">
          Nova sessão
        </label>
        <input
          id="sessionName"
          type="text"
          value={sessionName}
          onChange={(event) => setSessionName(event.target.value)}
          placeholder="ex.: vendas, suporte, marketing"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          disabled={submitting}
        />
        {errorMessage && <p className="mt-1 text-sm text-red-600">{errorMessage}</p>}
      </div>
      <button
        type="submit"
        disabled={submitting || sessionName.trim() === ''}
        className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {submitting ? 'Conectando…' : 'Conectar'}
      </button>
    </form>
  );
}

function bodyMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body && typeof (body as { message?: unknown }).message === 'string') {
    return (body as { message: string }).message;
  }
  return 'Falha ao conectar sessão.';
}
