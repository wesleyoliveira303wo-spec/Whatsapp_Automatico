import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { generateConversationSummary, ClientApiError } from '@/lib/clientApi';
import type { ConversationSummary } from '@/lib/clientApi';
import { isSummaryOutdated, formatElapsedDays } from '@/lib/formatters';
import { toast } from '@/components/ui/use-toast';

interface ConversationSummarySectionProps {
  conversation: ConversationSummary;
  onUpdated: (conversation: ConversationSummary) => void;
}

/**
 * Resumo da conversa por IA, sob demanda (Redesign 2026-08-05, R5) — vive
 * no painel de contexto (`ConversationContextPanel`). Mesmo padrão de
 * feedback já usado por `ConversationActions` (`useToast`, `pending`
 * local) — geração é síncrona e pode levar alguns segundos (chamada real à
 * IA), por isso o botão mostra "Gerando…" em vez de otimismo silencioso.
 */
export default function ConversationSummarySection({
  conversation,
  onUpdated,
}: ConversationSummarySectionProps): JSX.Element {
  const [pending, setPending] = useState(false);
  const outdated = isSummaryOutdated(conversation.lastMessageAt, conversation.aiSummaryUpdatedAt);

  async function handleGenerate(): Promise<void> {
    setPending(true);
    try {
      const updated = await generateConversationSummary(conversation.id);
      onUpdated(updated);
      toast({
        variant: 'success',
        title: 'Resumo gerado',
        description: 'A IA leu o histórico da conversa.',
      });
    } catch (error) {
      const description =
        error instanceof ClientApiError && error.status === 400
          ? 'Esta conversa ainda não tem mensagens suficientes para gerar um resumo.'
          : error instanceof ClientApiError && error.status === 503
            ? 'O provedor de IA não está configurado neste ambiente.'
            : 'Não foi possível gerar o resumo agora. Tente novamente.';
      toast({ variant: 'destructive', title: 'Falha ao gerar resumo', description });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-[11px]">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Resumo da IA
        </p>
        {outdated && (
          <span className="inline-flex h-[19px] items-center rounded-[5px] bg-warning/[.13] px-1.5 text-[10.5px] font-semibold text-warning-emphasis">
            Desatualizado
          </span>
        )}
      </div>

      {conversation.aiSummary ? (
        <p className="whitespace-pre-wrap text-pretty text-[13px] leading-[1.6] text-foreground-secondary">
          {conversation.aiSummary}
        </p>
      ) : (
        <p className="text-[13px] leading-[1.6] text-muted-foreground">
          Nenhum resumo gerado ainda.
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[11.5px] text-muted-foreground">
          {conversation.aiSummary
            ? `Gerado ${formatElapsedDays(conversation.aiSummaryUpdatedAt)}`
            : ''}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => void handleGenerate()}
          className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          {pending && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {pending ? 'Gerando…' : conversation.aiSummary ? 'Atualizar resumo' : 'Gerar resumo'}
        </button>
      </div>
    </div>
  );
}
