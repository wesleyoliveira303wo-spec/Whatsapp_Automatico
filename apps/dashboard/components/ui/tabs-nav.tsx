import { createContext, useContext, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Onda 2 do redesign (2026-08-23) — dá a cada `TabList` um `layoutId`
 * EXCLUSIVO para o indicador deslizante. Sem isso, duas listas de abas na
 * mesma página (ex.: as abas de Configurações e um grupo aninhado)
 * compartilhariam o mesmo id e o framer-motion tentaria deslizar o
 * indicador de uma para a outra — o marcador "saltaria" entre componentes
 * sem relação. `useId` do React garante unicidade estável entre servidor e
 * cliente (importante no Next.js: um id aleatório causaria divergência de
 * hidratação).
 */
const TabIndicatorContext = createContext<string | null>(null);

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
  const indicatorId = useId();
  return (
    <TabIndicatorContext.Provider value={indicatorId}>
      <LayoutGroup id={indicatorId}>
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
      </LayoutGroup>
    </TabIndicatorContext.Provider>
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
  const indicatorId = useContext(TabIndicatorContext);
  /**
   * Onda 2 do redesign (2026-08-23) — o realce da aba ativa era estático
   * (`border-primary` / `bg-foreground`), então trocar de aba fazia o
   * marcador piscar de um lugar para o outro. Agora ele DESLIZA, pela mesma
   * técnica de `layoutId` usada no rail lateral.
   *
   * A cor de FUNDO/BORDA sai das classes do botão e passa a viver num
   * elemento próprio (`motion.span`), porque o framer-motion só consegue
   * animar a transição entre dois elementos quando eles são o "mesmo"
   * elemento lógico — uma classe CSS trocando de botão nunca produziria
   * isso. O texto continua mudando de cor por CSS (instantâneo, de
   * propósito): acompanhar a cor do texto ao movimento deixaria a leitura
   * borrada durante a transição.
   */
  const indicator = indicatorId ? (
    <motion.span
      layoutId="tab-active-indicator"
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      aria-hidden="true"
      className={cn(
        'absolute',
        variant === 'pill' && 'inset-0 -z-10 rounded-[9px] bg-foreground',
        variant === 'underline' && 'inset-x-0 -bottom-px h-0.5 rounded-full bg-primary',
        variant === 'default' && 'inset-0 -z-10 rounded-md bg-background shadow-sm',
      )}
    />
  ) : null;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'relative inline-flex items-center gap-1.5 font-medium transition-colors',
        variant === 'pill' &&
          cn(
            'h-[34px] rounded-[9px] px-3.5 text-[13px] font-semibold',
            active ? 'text-background' : 'text-muted-foreground hover:bg-muted',
          ),
        variant === 'underline' &&
          cn(
            '-mb-px mr-5 h-[38px] px-0.5 text-[13.5px] font-semibold',
            active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          ),
        variant === 'default' &&
          cn(
            'rounded-md px-3 py-1.5 text-sm',
            active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          ),
        className,
      )}
      {...props}
    >
      {active && indicator}
      {icon}
      {children}
    </button>
  );
}
