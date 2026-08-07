import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

/**
 * Reskin 2026-08-07 (Design System, tela Cérebro da IA) — primitivo de
 * alternância (toggle), primeiro uso no projeto: até aqui todo "liga/
 * desliga" era um `<input type="checkbox">` cru. Botão nativo
 * (`role="switch"`/`aria-checked`, mesmo padrão do mockup) em vez de
 * `@radix-ui/react-switch` — sem dependência nova, mesmo racional já usado
 * no projeto para `<select>` nativo/drag-and-drop HTML5.
 */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, id, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
        {...props}
      >
        <span
          className={cn(
            'absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-[left]',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
    );
  },
);
Switch.displayName = 'Switch';
