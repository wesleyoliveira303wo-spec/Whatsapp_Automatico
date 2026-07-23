import AiInteractionRow from './AiInteractionRow';
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
export default function AiInteractionPanel({ interactions, errorMessage, onRetry }: AiInteractionPanelProps): JSX.Element {
  if (errorMessage) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-red-600">{errorMessage}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (interactions === null) {
    return <p className="text-sm text-gray-500">Carregando interacoes…</p>;
  }

  if (interactions.length === 0) {
    return <p className="text-sm text-gray-500">Nenhuma interacao de IA nesta conversa ainda.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {interactions.map((interaction) => (
        <AiInteractionRow key={interaction.id} interaction={interaction} />
      ))}
    </ul>
  );
}
