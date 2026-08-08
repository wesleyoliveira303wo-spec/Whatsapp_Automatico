import Link from 'next/link';
import FrancisLogo from '@/components/brand/FrancisLogo';
import StatusDot from '@/components/StatusDot';
import AiPowerToggle from '@/components/AiPowerToggle';
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
 * Correção 2026-08-07 (pedido do fundador, 2ª rodada): a marca aqui volta a
 * ser um link para "/" — o botão do topo do `SessionRail` deixou de navegar
 * (agora mostra a foto de perfil do WhatsApp conectado, puramente visual),
 * então "voltar a todos os WhatsApps" precisa de um caminho — a marca no
 * cabeçalho é o lugar natural (mesmo padrão de praticamente todo produto:
 * clicar na logo volta para a tela inicial).
 *
 * Fase 1 (2026-08-07) — Botão POWER: centralizado aqui (grid de 3 colunas —
 * marca à esquerda, botão ao centro, status da sessão à direita — a mesma
 * moldura em toda tela de sessão, não só Conversas, para o operador sempre
 * ver/controlar o estado da IA, em qualquer aba).
 */
export default function SessionHeader({ sessionName }: SessionHeaderProps): JSX.Element {
  const { session } = useSessionDetail(sessionName);

  return (
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-background pl-4 pr-3.5">
      <Link
        href="/"
        className="flex w-fit items-center gap-2.5"
        title="Voltar para Todos os WhatsApps"
      >
        <FrancisLogo size={22} />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">Francis</span>
      </Link>

      <AiPowerToggle />

      {session && (
        <div className="flex items-center justify-end gap-2">
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
