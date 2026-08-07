import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Milestone 6, Bloco M6H-1b — primitivo `Textarea`, mesmo padrão shadcn/ui
 * "new-york" do `Input` (M6C-1): sem lógica de negócio, só a casca visual
 * tokenizada. Criado para o retrofit do `AiProfilePanel` — antes um
 * `<textarea>` cru com cores `gray-*`/`blue-*`.
 */
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
