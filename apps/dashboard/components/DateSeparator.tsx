import { formatDayDivider } from '@/lib/formatters';

interface DateSeparatorProps {
  occurredAt: string;
}

/**
 * Reskin 2026-08-27 — divisor de dia da timeline, extraído do markup inline
 * que vivia dentro de `MessageTimeline`. Cápsula pequena e centralizada,
 * sobre o papel de parede (mesmo fundo e mesma sombra sutil das bolhas, como
 * na referência) — nunca uma faixa de largura total.
 *
 * `formatDayDivider` devolve `''` para data inválida; nesse caso este
 * componente não desenha nada (degradação graciosa, mesma decisão que já
 * existia antes da extração).
 */
export default function DateSeparator({ occurredAt }: DateSeparatorProps): JSX.Element | null {
  const label = formatDayDivider(occurredAt);
  if (!label) return null;

  return (
    <li className="flex justify-center py-3" aria-hidden="true">
      <span className="chat-bubble-shadow rounded-lg bg-chat-divider px-3 py-[5px] text-[12.5px] font-medium text-chat-meta">
        {label}
      </span>
    </li>
  );
}
