import { cn } from '@/lib/utils';
import { formatContactInitials } from '@/lib/formatters';
import { useContactAvatar } from '@/hooks/useContactAvatar';
import { avatarPaletteFor } from '@/lib/avatarPalette';

interface ContactAvatarProps {
  sessionName: string;
  contactJid: string;
  contactName?: string;
  /**
   * "Aguardando atendente" (Design System, tela Conversas): NÃO recolore o
   * avatar (o contato mantém sempre a mesma cor da sua paleta, foto ou
   * iniciais) — sobrepõe um pequeno ponto de aviso no canto, só usado pela
   * linha da lista (`ConversationListItem`); os demais usos deste componente
   * (cabeçalho da conversa aberta, painel de contexto) nunca passam esta prop.
   */
  waitingForHuman?: boolean;
  /** Tamanho do círculo (classes Tailwind `h-*`/`w-*`) — default 44px, mesmo tamanho já usado na linha de inbox. */
  className?: string;
}

/**
 * Avatar de um contato do WhatsApp (Milestone 6, Bloco M6H-2b, pedido do
 * fundador: "gostaria também que as conversas tivessem [...] foto de
 * perfil, para saber melhor com quem estejamos falando"). Busca a foto ao
 * vivo via `useContactAvatar`; enquanto não chega (ou se o contato não tem
 * foto/privacidade bloqueando — resultado normal, não erro), cai para um
 * círculo com iniciais do nome (ou os últimos 2 dígitos do número, se ainda
 * não houver `contactName`) — mesmo visual que a lista já usava antes deste
 * bloco, agora compartilhado com o cabeçalho da conversa aberta.
 *
 * Reskin 2026-08-06 — fallback de iniciais usa uma paleta de 6 cores fixas
 * por contato (`avatarPaletteFor`, hash determinístico), não mais um único
 * tom neutro. Via `style` inline (não classe Tailwind arbitrária): o par de
 * hex é dinâmico por contato, e classes `bg-[#hex]` computadas em runtime não
 * seriam vistas pelo scanner do Tailwind (só literais no código-fonte são).
 */
export default function ContactAvatar({
  sessionName,
  contactJid,
  contactName,
  waitingForHuman = false,
  className,
}: ContactAvatarProps): JSX.Element {
  const avatarUrl = useContactAvatar(sessionName, contactJid);
  const palette = avatarPaletteFor(contactJid);

  return (
    <div className="relative inline-flex shrink-0">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL externa (CDN do WhatsApp), fora do domínio de imagens do next/image.
        <img
          src={avatarUrl}
          alt=""
          className={cn('h-11 w-11 rounded-full object-cover', className)}
        />
      ) : (
        <div
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold',
            className,
          )}
          style={{ backgroundColor: palette.bg, color: palette.fg }}
          aria-hidden="true"
        >
          {formatContactInitials(contactJid, contactName)}
        </div>
      )}
      {waitingForHuman && (
        <span
          title="Aguardando atendente"
          className="absolute -bottom-px -right-px h-[11px] w-[11px] rounded-full border-2 border-panel bg-warning"
        />
      )}
    </div>
  );
}
