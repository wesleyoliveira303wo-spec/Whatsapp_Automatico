import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { commercialWhatsAppLink } from '@/lib/brand';
import type { PlanCapability } from '@/lib/plans';

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
  /** O que está bloqueado — completa "… faz parte dos planos pagos". Ex.: "O Pipeline". */
  feature?: string;
  /** Texto de apoio; se omitido, usa um genérico. */
  description?: string;
  className?: string;
  /**
   * O que a tela exige (B5, 2026-09-18): `operation` libera a partir do plano
   * Disparos; `ai`, só no Pro e no Enterprise. Muda só o texto — o bloqueio é
   * da API.
   */
  requires?: PlanCapability;
}

const COPY: Record<PlanCapability, { title: (feature?: string) => string; body: string }> = {
  operation: {
    title: (feature) =>
      feature ? `${feature}: a partir do plano Disparos` : 'Disponível a partir do plano Disparos',
    body: 'No Plano Grátis você conecta um WhatsApp e acompanha as mensagens. A partir do plano Disparos você responde pela Dashboard, organiza os contatos e faz disparos.',
  },
  ai: {
    title: (feature) =>
      feature ? `${feature}: nos planos Pro e Enterprise` : 'Disponível nos planos Pro e Enterprise',
    body: 'A IA que responde sozinha, organiza o Pipeline e resume conversas está nos planos Pro e Enterprise.',
  },
};

export default function UpgradeState({
  feature,
  description,
  className,
  requires = 'operation',
}: UpgradeStateProps): JSX.Element {
  const title = COPY[requires].title(feature);
  const body = description ?? COPY[requires].body;

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
          href={commercialWhatsAppLink('Olá! Quero ativar um plano pago do Francis.')}
          target="_blank"
          rel="noreferrer"
        >
          Falar com o comercial
        </a>
      </Button>
    </div>
  );
}
