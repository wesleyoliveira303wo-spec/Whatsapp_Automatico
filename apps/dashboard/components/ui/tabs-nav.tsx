import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Redesign 2026-08-05 (R2) — casca de abas nativa (`role="tablist"`/`role="tab"`),
 * extraída do padrão já usado inline em `AiProfilePanel.tsx` (M6H-3) para
 * as novas páginas agrupadas `ai.tsx`/`settings.tsx`. Primitivo "burro"
 * (`components/ui/`): não sabe qual conteúdo cada aba mostra, só desenha a
 * lista e o botão selecionado — a página é quem decide o que renderizar
 * conforme a aba ativa. Sem Radix Tabs (dependência nova desnecessária para
 * um caso tão simples — mesmo racional já usado no projeto para o `<select>`
 * nativo do `UserManagementPanel`).
 *
 * Reskin 2026-08-07 (Design System) — ganhou dois variants novos, cada um
 * do mockup de uma tela: `variant="pill"` (pílula escura cheia, `Francis
 * Cérebro da IA.dc.html`) e `variant="underline"` (sublinhado de 2px,
 * `Francis Configurações.dc.html` — Conexão/Equipe/Auditoria/Tags), sem
 * mexer no visual `default` (sombra clara sobre `bg-muted/40`) — nenhuma
 * tela usa mais o `default` depois do reskin completo das 5 telas, mas ele
 * fica como terceira opção do primitivo, não é removido.
 */
export function TabList({
  children,
  ariaLabel,
  variant = 'default',
}: {
  children: ReactNode;
  ariaLabel: string;
  variant?: 'default' | 'pill' | 'underline';
}): JSX.Element {
  return (
    <div
      className={cn(
        variant === 'pill' && 'inline-flex flex-wrap gap-1',
        variant === 'underline' && 'flex flex-wrap border-b border-border',
        variant === 'default' &&
          'inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-1',
      )}
      role="tablist"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

interface TabTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active: boolean;
  icon?: ReactNode;
  variant?: 'default' | 'pill' | 'underline';
}

export function TabTrigger({
  active,
  icon,
  children,
  className,
  variant = 'default',
  ...props
}: TabTriggerProps): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium transition-colors',
        variant === 'pill' &&
          cn(
            'h-[34px] rounded-[9px] px-3.5 text-[13px] font-semibold',
            active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
          ),
        variant === 'underline' &&
          cn(
            'h-[38px] -mb-px mr-5 border-b-2 px-0.5 text-[13.5px] font-semibold',
            active
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          ),
        variant === 'default' &&
          cn(
            'rounded-md px-3 py-1.5 text-sm',
            active
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          ),
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
