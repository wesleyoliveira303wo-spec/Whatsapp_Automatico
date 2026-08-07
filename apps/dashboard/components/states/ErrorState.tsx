import { AlertCircle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Milestone 6, Bloco M6D-2 (ADR #64) — implementa o estado "Erro" do
 * contrato (`DESIGN_SYSTEM.md` §7 / `PRODUCT_PRINCIPLES.md`): linguagem
 * humana + ação de tentar de novo. Tom destrutivo (ícone + acento na cor
 * `destructive`), mas sem ser alarmista — a mensagem de `description` deve
 * vir em português claro (nunca uma stack trace ou `error.message` cru).
 *
 * `onRetry` é OPCIONAL: quando ausente, mostra só a mensagem (ex.: um erro
 * que não faz sentido "tentar de novo", como 403). Os hooks existentes
 * (`useSessionsList`, `useConversationDetail` etc.) já expõem `refresh()` —
 * é isso que alimenta `onRetry` no retrofit (M6E+). NENHUMA tela usa este
 * componente ainda.
 */
export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

const DEFAULT_TITLE = 'Algo deu errado';
const DEFAULT_RETRY_LABEL = 'Tentar de novo';

export default function ErrorState({
  title = DEFAULT_TITLE,
  description,
  onRetry,
  retryLabel = DEFAULT_RETRY_LABEL,
  className,
}: ErrorStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
