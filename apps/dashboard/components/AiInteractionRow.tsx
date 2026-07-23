import AiInteractionStatusBadge from './AiInteractionStatusBadge';
import { formatDateTime, formatCostUsd } from '@/lib/formatters';
import type { AiInteractionSummary } from '@/lib/clientApi';

interface AiInteractionRowProps {
  interaction: AiInteractionSummary;
}

/**
 * Uma linha de auditoria de IA (Milestone 3, Bloco 6 — D28): provider,
 * modelo, versao do prompt, tokens, custo (string decimal exata — nunca
 * number, restricao do Bloco 3b), latencia, status e timestamp. Toda
 * tentativa aparece (sucesso, rejeitada, erro) — a API grava TODAS
 * (criterio de aceite da Milestone 3), a UI nao esconde nenhuma.
 */
export default function AiInteractionRow({ interaction }: AiInteractionRowProps): JSX.Element {
  return (
    <li className="rounded-md border border-gray-100 bg-white px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AiInteractionStatusBadge status={interaction.status} />
          <span className="text-gray-700">
            {interaction.provider}
            {interaction.model ? ` · ${interaction.model}` : ''}
          </span>
        </div>
        <span className="text-gray-400">{formatDateTime(interaction.createdAt)}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-gray-500 sm:grid-cols-4">
        <dt>Prompt</dt>
        <dd className="text-gray-700">{interaction.promptVersion}</dd>
        <dt>Tokens (in/out)</dt>
        <dd className="text-gray-700">
          {interaction.tokensInput}/{interaction.tokensOutput}
        </dd>
        <dt>Custo</dt>
        <dd className="text-gray-700">{formatCostUsd(interaction.costUsd)}</dd>
        <dt>Latencia</dt>
        <dd className="text-gray-700">{interaction.latencyMs} ms</dd>
      </dl>
      {interaction.errorMessage && <p className="mt-1 text-xs text-red-600">{interaction.errorMessage}</p>}
    </li>
  );
}
