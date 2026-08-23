import AiInteractionRow from './AiInteractionRow';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import type { AiInteractionSummary } from '@/lib/clientApi';

interface AiInteractionPanelProps {
  interactions: AiInteractionSummary[] | null;
  errorMessage: string | null;
  onRetry: () => void;
}

/**
 * Painel de interacoes de IA embutido no detalhe da conversa (Milestone 3,
 * Bloco 6 — D28: sem pagina propria, mesmo padrao de `HistoryList` embutido
 * no detalhe de sessao, M2). Dados vem de um unico fetch
 * (`useAiInteractions`, D23/D27) — a MESMA lista alimenta a correlacao da
 * timeline, sem segunda chamada.
 */
export default function AiInteractionPanel({
  interactions,
  errorMessage,
  onRetry,
}: AiInteractionPanelProps): JSX.Element {
  /**
   * Onda 1 do redesign (2026-08-22) — o botão "Tentar novamente" era
   * reimplementado à mão aqui (borda/hover/padding próprios) em vez de usar
   * `ErrorState`, que já resolve exatamente isso (`onRetry` já chegava como
   * prop, só não estava conectado ao componente certo). Skeleton com 3
   * linhas na altura real de `AiInteractionRow` (~36px, texto de 12.5px +
   * 11.5px empilhados).
   */
  if (errorMessage) {
    return <ErrorState description={errorMessage} onRetry={onRetry} className="p-4" />;
  }

  if (interactions === null) {
    return (
      <div className="flex flex-col gap-0.5">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    );
  }

  if (interactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nenhuma interacao de IA nesta conversa ainda.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {interactions.map((interaction) => (
        <AiInteractionRow key={interaction.id} interaction={interaction} />
      ))}
    </ul>
  );
}
