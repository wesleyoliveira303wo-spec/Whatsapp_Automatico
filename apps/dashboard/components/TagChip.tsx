import { cn } from '@/lib/utils';
import { tagBadgeClassName } from '@/lib/formatters';
import type { TagColor } from '@/lib/clientApi';

interface TagChipProps {
  name: string;
  color: TagColor;
  className?: string;
}

/**
 * Chip visual de uma tag livre (Redesign 2026-08-05, R4) — usado na lista de
 * Conversas e no painel de contexto. Componente próprio (não uma variante do
 * `Badge`) porque a cor vem de uma paleta FIXA de 8 opções escolhida pelo
 * usuário por tag, não de um `variant` fixo em tempo de compilação — ver
 * `tagBadgeClassName` (`lib/formatters.ts`) para a exceção deliberada à regra
 * de "cor só vem de token".
 *
 * Reskin 2026-08-06 — raio 6px (não mais pílula): o Design System usa esse
 * raio pequeno para chip de tag em TODAS as telas (lista de Conversas, board
 * do Pipeline, painel de contexto, Configurações), distinto do raio de
 * superfície (12px) e do raio de pílula (999px, reservado a badges de status/
 * filtros). Altura/padding/tamanho de fonte default seguem o painel de
 * contexto — `ConversationListItem`/`PipelineCard` sobrescrevem via
 * `className` para a variante compacta da lista/card.
 */
export default function TagChip({ name, color, className }: TagChipProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-[8rem] items-center truncate rounded-[6px] px-[9px] text-xs font-medium leading-none',
        tagBadgeClassName(color),
        className,
      )}
      title={name}
    >
      {name}
    </span>
  );
}
