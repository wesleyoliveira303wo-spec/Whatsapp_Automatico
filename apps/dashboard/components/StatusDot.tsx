import { cn } from '@/lib/utils';
import { formatStatusLabel, statusDotClassName } from '@/lib/formatters';
import type { WhatsAppSessionStatus } from '@/lib/clientApi';

interface StatusDotProps {
  status: WhatsAppSessionStatus;
  className?: string;
}

/**
 * Bolinha de status de conexão (2026-07-25, pedido do fundador): verde
 * quando `connected`, amarela quando `connecting`, cinza quando
 * `disconnected` — mesmo indicador visual já usado em toda a navegação por
 * sessão (Conversas, Cérebro da IA, Analytics, Equipe), agora também no card
 * do Workspace ("Seus WhatsApps") e no cabeçalho da `SessionSidebar`
 * (Configurações), onde antes só havia texto (`StatusBadge`).
 *
 * Componente deliberadamente pequeno e sem dependência de `Badge` — é só um
 * `<span>` circular, não uma pílula com rótulo. Toda a lógica de cor vive em
 * `lib/formatters.ts` (`statusDotClassName`, testável), este componente só
 * renderiza. `title` (nativo do navegador) carrega o rótulo por extenso para
 * quem passar o mouse — não duplica `StatusBadge`, que continua sendo usado
 * onde o texto por extenso é o próprio conteúdo (ex.: Configurações).
 */
export default function StatusDot({ status, className }: StatusDotProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-block h-2.5 w-2.5 shrink-0 rounded-full',
        statusDotClassName(status),
        className,
      )}
      title={formatStatusLabel(status)}
      role="status"
      aria-label={formatStatusLabel(status)}
    />
  );
}
