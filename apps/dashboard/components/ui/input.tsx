import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Milestone 6, Bloco M6C-1 (ADR #62) — primitivo `Input`, padrão shadcn/ui
 * "new-york". Sem lógica de negócio (não sabe o que é um `tenantId` ou uma
 * `senha`) — quem valida/rotula é o formulário que o usa. NENHUMA tela usa
 * este componente ainda; retrofit dos formulários existentes (`LoginForm`,
 * `CreateSessionForm` etc.) é escopo do M6E em diante.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
