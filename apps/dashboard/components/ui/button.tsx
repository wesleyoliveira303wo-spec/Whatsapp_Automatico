import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Milestone 6, Bloco M6A-5 (ADR #62) — primeiro primitivo de `components/ui/`,
 * no formato padrão gerado por `npx shadcn@latest add button` (style
 * "new-york", ver `components.json`). Existe NESTE bloco só para provar que
 * o pipeline inteiro compila e roda de ponta a ponta (shadcn + Radix Slot +
 * cva + `cn()` + tokens do tema) — NENHUMA tela usa este componente ainda
 * (retrofit é escopo de blocos futuros, M6D em diante). Variantes/tamanhos
 * seguem exatamente o catálogo padrão do shadcn/ui — não foram inventados
 * nem reduzidos, para que `add`s futuros de outros componentes (que
 * referenciam `buttonVariants`) continuem compatíveis com o upstream.
 *
 * `asChild` (via `@radix-ui/react-slot`) permite renderizar as classes do
 * Button em outro elemento (ex.: um `<Link>` do Next.js) sem aninhar
 * `<button><a>...</a></button>` — padrão Radix, não deste projeto.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
        // Reskin 2026-08-06 — Design System §4: "Altura de botão de ação
        // (CTA) 34px, única e fixa — primário e secundário", raio 9px. Aditivo
        // (nenhum tamanho existente mudou) — usado nos botões de ação das 5
        // telas do reskin (Assumir conversa, Salvar, Adicionar etc.).
        cta: 'h-[34px] rounded-[9px] px-[13px] text-[12.5px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
