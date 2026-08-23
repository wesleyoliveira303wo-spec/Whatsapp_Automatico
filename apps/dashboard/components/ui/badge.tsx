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
 *
 * ONDA 2 DO REDESIGN (2026-08-23) — `success`/`warning` reescritas de fundo
 * SÓLIDO + texto branco para o padrão translúcido (fundo a 12-13% de
 * opacidade + `text-*-emphasis`) já usado à mão em ~8 componentes do produto
 * (`ConversationStatusBadge`, `ConversationListItem`, `UserManagementPanel`,
 * `PipelineBoard`, ...) e documentado em `Francis Design System.dc.html` §6
 * ("selo em tinta translúcida... nunca cor sólida cheia, exceto no botão
 * primário"). Duas razões, não só estética: (1) o primitivo era a ÚNICA
 * exceção ao padrão do resto do produto — corrige inconsistência, não
 * introduz nada novo; (2) auditoria de contraste WCAG (script descartável,
 * fórmula de luminância relativa padrão) mediu `successForeground`/
 * `warningForeground` sobre `success`/`warning` sólidos em 3.20:1/3.24:1 —
 * REPROVA AA (mínimo 4.5:1 para texto normal; o badge usa `text-xs`
 * semibold, abaixo do limiar de "texto grande" que aceitaria 3:1). Os
 * tokens `-emphasis` já existiam e já passam AA/AAA em ambos os temas
 * (7.63:1/5.94:1 no claro, 7.86:1/8.64:1 no escuro) — nenhum valor novo
 * precisou ser inventado, só reaproveitados.
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
        success: 'border-transparent bg-success/[.12] text-success-emphasis hover:bg-success/[.20]',
        warning: 'border-transparent bg-warning/[.13] text-warning-emphasis hover:bg-warning/[.20]',
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
