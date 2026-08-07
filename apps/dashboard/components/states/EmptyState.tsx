import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Milestone 6, Bloco M6D-2 (ADR #64) — implementa o estado "Vazio" do
 * contrato (`DESIGN_SYSTEM.md` §7 / `PRODUCT_PRINCIPLES.md`): mensagem +
 * explicação + CTA quando aplicável, nunca uma tela em branco. Tom de
 * CONVITE, não de pedido de desculpas — "Nenhuma sessão ainda" + botão
 * "Criar sessão", não "Não há nada aqui".
 *
 * Fica em `components/states/` (não `components/ui/`) de propósito: é uma
 * convenção de UX do PRODUTO (referencia `PRODUCT_PRINCIPLES.md`), não um
 * primitivo genérico reutilizável em qualquer contexto tipo `Button`/`Card`.
 * NENHUMA tela usa este componente ainda — substituir os `<p>Nenhuma
 * sessão ainda...</p>` hoje espalhados pelas páginas é retrofit (M6E+).
 */
export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
