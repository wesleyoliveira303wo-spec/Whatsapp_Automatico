import FrancisLogo from '@/components/brand/FrancisLogo';
import StatusDot from '@/components/StatusDot';
import { useSessionDetail } from '@/hooks/useSessionDetail';
import { formatStatusLabel } from '@/lib/formatters';

interface SessionHeaderProps {
  sessionName: string;
}

/**
 * Reskin 2026-08-06 — cabeçalho ENXUTO das telas de sessão (Conversas,
 * Pipeline, Analytics, IA, Configurações), 48px, idêntico pixel a pixel nas
 * 5 telas (Design System §5). Substitui `Header.tsx` DENTRO de
 * `SessionLayout` — `Header.tsx` não muda de contrato e continua servindo o
 * Workspace (`/`) e o Login, que não têm mockup próprio.
 *
 * Identidade do usuário (e-mail/cargo/trocar senha/sair), antes texto solto
 * aqui, migrou para `AccountMenu` (rail) — ver Design System §5/§7. Este
 * cabeçalho só mostra marca + nome da sessão + status da conexão.
 *
 * Correção 2026-08-07 (pedido do fundador): a marca aqui deixou de ser um
 * link para "/" — vira só identidade visual, sem clique. O botão fundido no
 * topo do `SessionRail` já cobre "voltar a todos os WhatsApps" (mesma
 * função, sem duplicar); não sobra nenhum caminho de navegação perdido.
 */
export default function SessionHeader({ sessionName }: SessionHeaderProps): JSX.Element {
  const { session } = useSessionDetail(sessionName);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background pl-4 pr-3.5">
      <div className="flex items-center gap-2.5">
        <FrancisLogo size={22} />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">Francis</span>
      </div>
      {session && (
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] text-muted-foreground">{sessionName}</span>
          <StatusDot status={session.status} className="h-1.5 w-1.5" />
          <span className="text-[12.5px] text-muted-foreground">
            {formatStatusLabel(session.status)}
          </span>
        </div>
      )}
    </header>
  );
}
