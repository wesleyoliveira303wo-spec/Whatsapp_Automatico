import { Check, CheckCheck, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Estados de entrega de uma mensagem enviada, no vocabulário da referência
 * visual (WhatsApp): relógio → 1 check → 2 checks cinza → 2 checks azuis.
 */
export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read';

const STATUS_LABELS: Record<MessageDeliveryStatus, string> = {
  sending: 'Enviando',
  sent: 'Enviado',
  delivered: 'Entregue',
  read: 'Lido',
};

interface MessageStatusProps {
  status: MessageDeliveryStatus;
  className?: string;
}

/**
 * Reskin 2026-08-27 — indicador de status ao lado do horário, dentro da
 * bolha enviada. Pequeno e discreto por construção (13px): é informação
 * periférica, nunca um controle clicável.
 *
 * IMPORTANTE — o produto hoje só sabe dizer "enviado": `WhatsAppMessage` não
 * guarda confirmação de entrega/leitura do WhatsApp do contato (exigiria
 * `providerMessageId` + assinar `messages.update` no `BaileysProvider`).
 * `MessageBubble` portanto sempre passa `'sent'`. Os outros três estados
 * existem aqui prontos para o dia em que esse dado existir — e ficam num
 * lugar só, para a troca ser de uma linha. Nunca exibir `delivered`/`read`
 * sem dado real por trás: prometeria algo que o produto não cumpre.
 */
export default function MessageStatus({ status, className }: MessageStatusProps): JSX.Element {
  const label = STATUS_LABELS[status];
  const iconClassName = cn('h-[13px] w-[13px] shrink-0', className);

  if (status === 'sending') {
    return <Clock3 className={iconClassName} aria-label={label} />;
  }
  if (status === 'sent') {
    return <Check className={iconClassName} aria-label={label} />;
  }
  if (status === 'delivered') {
    return <CheckCheck className={iconClassName} aria-label={label} />;
  }
  return <CheckCheck className={cn(iconClassName, 'text-[#53bdeb]')} aria-label={label} />;
}
