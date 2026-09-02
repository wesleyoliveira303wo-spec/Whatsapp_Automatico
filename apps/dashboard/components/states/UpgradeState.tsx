import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { commercialWhatsAppLink } from '@/lib/brand';

/**
 * T4 (Lançamento suave — Trava de plano): bloco "Disponível no Plano Pro"
 * que SUBSTITUI o conteúdo real de uma tela paga quando o tenant está no
 * Plano Grátis. Tom de CONVITE, igual ao `EmptyState` (não pedido de
 * desculpas) — o cliente está vendo tudo que ganharia ao assinar.
 *
 * Vive em `components/states/` (ao lado de `EmptyState`/`ErrorState`): é uma
 * convenção de UX do PRODUTO, não um primitivo genérico. O CTA leva ao
 * WhatsApp do comercial (Billing manual — ver `commercialWhatsAppLink`).
 */
export interface UpgradeStateProps {
  /** O que está bloqueado — completa "… é um recurso do Plano Pro". Ex.: "O Pipeline". */
  feature?: string;
  /** Texto de apoio; se omitido, usa um genérico. */
  description?: string;
  className?: string;
}

export default function UpgradeState({
  feature,
  description,
  className,
}: UpgradeStateProps): JSX.Element {
  const title = feature ? `${feature} é um recurso do Plano Pro` : 'Disponível no Plano Pro';
  const body =
    description ??
    'No Plano Grátis você conecta um WhatsApp e acompanha as mensagens. Para a IA responder, o CRM e as campanhas, ative o Plano Pro.';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
      </div>
      <div className="max-w-md space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <Button asChild>
        <a
          href={commercialWhatsAppLink('Olá! Quero ativar o Plano Pro do Francis.')}
          target="_blank"
          rel="noreferrer"
        >
          Falar com o comercial
        </a>
      </Button>
    </div>
  );
}
