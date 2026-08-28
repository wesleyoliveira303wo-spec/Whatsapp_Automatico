import { cn } from '@/lib/utils';
import { formatMessageTime } from '@/lib/formatters';
import MessageStatus, { type MessageDeliveryStatus } from './MessageStatus';

interface MessageMetaProps {
  occurredAt: string;
  /** Ausente em mensagens recebidas (não existe status de entrega para o que o contato mandou). */
  status?: MessageDeliveryStatus;
  /** `true` quando desenhado SOBRE uma mídia (imagem/vídeo), onde a cor de fundo é imprevisível. */
  overlay?: boolean;
  className?: string;
}

/**
 * Reskin 2026-08-27 — horário (+ status, quando enviada) no canto inferior
 * direito da mensagem, exatamente como na referência: NUNCA um elemento
 * solto abaixo da bolha, e sempre ocupando o mínimo de espaço possível.
 *
 * Duas variantes, porque o fundo por trás muda:
 * - normal: sobre a cor da própria bolha → texto em `--chat-meta`;
 * - `overlay`: sobre uma foto/vídeo (cor arbitrária) → chip preto
 *   translúcido com texto branco, mesma solução da referência.
 *
 * O posicionamento em si (absoluto no canto, ou inline numa linha) é
 * responsabilidade de quem usa, via `className` — este componente só
 * decide a APARÊNCIA do grupo, mantendo-a idêntica nos quatro lugares onde
 * aparece (texto, mídia, áudio, documento).
 */
export default function MessageMeta({
  occurredAt,
  status,
  overlay = false,
  className,
}: MessageMetaProps): JSX.Element {
  return (
    <span
      className={cn(
        'pointer-events-none flex select-none items-center gap-[3px] whitespace-nowrap text-[11px] leading-none tabular-nums',
        overlay ? 'rounded-full bg-black/45 px-1.5 py-[3px] text-white' : 'text-chat-meta',
        className,
      )}
    >
      {formatMessageTime(occurredAt)}
      {status && <MessageStatus status={status} />}
    </span>
  );
}
