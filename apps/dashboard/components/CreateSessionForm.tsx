import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { connectSession, ClientApiError } from '@/lib/clientApi';

interface CreateSessionFormProps {
  /** Chamado após navegar para o detalhe (usado pelo Dialog para se fechar). */
  onSubmitted?: () => void;
}

/**
 * Formulário de criação/conexão de uma nova sessão de WhatsApp (M2, Fase 4).
 * `POST /api/sessions` é idempotente (reconecta se já existir), então serve
 * para "criar" e "reconectar por nome". Após sucesso, navega para o detalhe
 * (`/sessions/:sessionName`) — é lá que o QR Code aparece.
 *
 * Milestone 6, Bloco M6G: sem o wrapper `Card` (agora vive DENTRO de um
 * `Dialog` no dashboard de WhatsApps) — só o formulário, sobre `Input`/`Button`.
 */
export default function CreateSessionForm({
  onSubmitted,
}: CreateSessionFormProps = {}): JSX.Element {
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
      onSubmitted?.();
      // CORREÇÃO 2026-08-27 (Reorganização Perfil/Configurações): navegava
      // para `/sessions/:name`, que passou a levar ao Dashboard da sessão
      // (Conversas) — mas uma sessão RECÉM-CRIADA ainda não está conectada:
      // a pessoa precisa escanear o QR Code primeiro. Manda direto para a
      // tela de conexão DAQUELA sessão (aba WhatsApps de Configurações, já
      // com a sessão selecionada), que é onde o QR Code vive — e dentro de
      // `/sessions/:name/settings`, para o rail lateral continuar visível.
      const encoded = encodeURIComponent(trimmed);
      await router.push(`/sessions/${encoded}/settings?tab=whatsapps&session=${encoded}`);
    } catch (error) {
      const message =
        error instanceof ClientApiError ? bodyMessage(error.body) : 'Falha ao conectar sessão.';
      setErrorMessage(message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sessionName" className="text-sm font-medium text-foreground">
          Nome da conexão
        </label>
        <Input
          id="sessionName"
          type="text"
          value={sessionName}
          onChange={(event) => setSessionName(event.target.value)}
          placeholder="ex.: vendas, suporte, marketing"
          disabled={submitting}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Um apelido para você identificar esse número.
        </p>
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      </div>
      <Button type="submit" disabled={submitting || sessionName.trim() === ''} className="w-full">
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        {submitting ? 'Conectando…' : 'Conectar WhatsApp'}
      </Button>
    </form>
  );
}

function bodyMessage(body: unknown): string {
  if (
    body &&
    typeof body === 'object' &&
    'message' in body &&
    typeof (body as { message?: unknown }).message === 'string'
  ) {
    return (body as { message: string }).message;
  }
  return 'Falha ao conectar sessão.';
}
