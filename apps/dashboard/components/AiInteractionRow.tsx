import { cn } from '@/lib/utils';
import { formatAiInteractionCompactDetail, formatShortRelativeTime } from '@/lib/formatters';
import type { AiInteractionSummary } from '@/lib/clientApi';

interface AiInteractionRowProps {
  interaction: AiInteractionSummary;
}

/**
 * Uma linha de auditoria de IA (Milestone 3, Bloco 6 — D28), no painel de
 * contexto da conversa (`ConversationContextPanel`).
 *
 * Reskin 2026-08-06 — linha compacta (ponto + modelo + tokens/custo/latência
 * condensados numa linha + tempo relativo), Design System §"Últimas
 * interações": nenhum dado deixa de existir, só troca de layout — tokens/
 * custo/latência/status seguem todos representados via
 * `formatAiInteractionCompactDetail` (D28 preservado: toda tentativa aparece,
 * sucesso ou não). `promptVersion`/o texto completo do erro não cabem na
 * linha compacta; o erro, quando houver, fica acessível via `title`
 * (tooltip) — não é descartado, só deixa de ocupar espaço fixo.
 */
export default function AiInteractionRow({ interaction }: AiInteractionRowProps): JSX.Element {
  const ok = interaction.status === 'success';
  return (
    <li
      className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted"
      title={interaction.errorMessage ?? undefined}
    >
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', ok ? 'bg-success' : 'bg-warning')}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-foreground-secondary">
          {interaction.model ?? interaction.provider}
        </span>
        <span className="mt-px block truncate text-[11.5px] tabular-nums text-muted-foreground">
          {formatAiInteractionCompactDetail(interaction)}
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-[11.5px] tabular-nums text-muted-foreground">
        {formatShortRelativeTime(interaction.createdAt)}
      </span>
    </li>
  );
}
