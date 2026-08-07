import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Milestone 6, Bloco M6C-1 (ADR #62) — primitivo `Badge` genérico. Existe
 * para resolver a duplicação já sinalizada na auditoria do M6A: `StatusBadge`,
 * `ConversationStatusBadge` e `AiInteractionStatusBadge` (3 componentes,
 * cada um tipado a um enum de status diferente) repetem a MESMA estrutura
 * (`<span>` arredondado + classe de cor + rótulo). Este primitivo vira a
 * base visual comum — os 3 componentes de domínio passam a compor este
 * `Badge` por baixo (Bloco M6C-4), mantendo a assinatura/tipo próprios
 * (`WhatsAppSessionStatus`/`ConversationStatus`/`AiInteractionStatus`) e toda
 * a lógica de rótulo/cor em `lib/formatters.ts`, intocada.
 *
 * Variantes `success`/`warning` mapeiam o CONTRATO DE COR semântico já
 * documentado (`PRODUCT_PRINCIPLES.md` §2.3 / `DESIGN_SYSTEM.md` §2):
 * success = saudável/conectado, warning = atenção/aguardando humano,
 * destructive = erro/desconectado, secondary = inativo/bot.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        success: 'border-transparent bg-success text-success-foreground hover:bg-success/80',
        warning: 'border-transparent bg-warning text-warning-foreground hover:bg-warning/80',
        outline: 'text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
