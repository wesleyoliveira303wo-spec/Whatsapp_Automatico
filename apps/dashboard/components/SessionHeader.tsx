import { useRouter } from 'next/router';
import { LogOut } from 'lucide-react';
import FrancisLogo from '@/components/brand/FrancisLogo';
import StatusDot from '@/components/StatusDot';
import AiPowerToggle from '@/components/AiPowerToggle';
import { useSessionDetail } from '@/hooks/useSessionDetail';
import { formatStatusLabel } from '@/lib/formatters';
import { logout } from '@/lib/clientApi';

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
 * aqui, migrou para `/settings` (aba Perfil) — ver Design System §5/§7 e
 * DECISIONS.md #106. Este cabeçalho só mostra marca + nome da sessão +
 * status da conexão.
 *
 * Reorganização Perfil/Configurações (2026-08-27, pedido do fundador) — a
 * marca deixou de ser um link para "/": esse papel migrou para o AVATAR do
 * usuário no topo do `SessionRail` (que antes só mostrava a foto do
 * WhatsApp conectado, puramente visual — ver docstring de `SessionRail`).
 * Só um caminho de volta ao Workspace por vez, para não haver dois alvos
 * "voltar" competindo na tela.
 *
 * Fase 1 (2026-08-07) — Botão POWER: centralizado aqui (grid de 3 colunas —
 * marca à esquerda, botão ao centro, status da sessão à direita — a mesma
 * moldura em toda tela de sessão, não só Conversas, para o operador sempre
 * ver/controlar o estado da IA, em qualquer aba).
 *
 * CORREÇÃO 2026-08-27 (pedido do fundador): "Sair" só existia dentro de
 * Configurações → Perfil → Segurança — dois níveis de navegação para a ação
 * mais básica de qualquer conta, prejudicando a usabilidade. Ícone de porta
 * (`LogOut`) adicionado aqui, ao lado do status da sessão (mesmo lugar do
 * seu print), visível em TODA tela de sessão — reaproveita `logout()` de
 * `clientApi.ts` (a MESMA função já usada em `ProfileSettingsTab`, nenhuma
 * lógica nova). "Sair" continua existindo em Perfil → Segurança também —
 * este ícone é um ATALHO, não uma migração; nada foi removido de lá.
 */
export default function SessionHeader({ sessionName }: SessionHeaderProps): JSX.Element {
  const router = useRouter();
  const { session } = useSessionDetail(sessionName);

  async function handleLogout(): Promise<void> {
    await logout();
    await router.push('/login');
  }

  return (
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-background pl-4 pr-3.5">
      <div className="flex w-fit items-center gap-2.5">
        <FrancisLogo size={22} />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">Francis</span>
      </div>

      <AiPowerToggle />

      <div className="flex items-center justify-end gap-3">
        {session && (
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted-foreground">{sessionName}</span>
            <StatusDot status={session.status} className="h-1.5 w-1.5" />
            <span className="text-[12.5px] text-muted-foreground">
              {formatStatusLabel(session.status)}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleLogout()}
          title="Sair"
          aria-label="Sair"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="h-[15px] w-[15px]" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
