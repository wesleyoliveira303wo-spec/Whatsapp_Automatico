import { cn } from '@/lib/utils';
import { formatContactInitials } from '@/lib/formatters';
import { useContactAvatar } from '@/hooks/useContactAvatar';
import { avatarPaletteFor } from '@/lib/avatarPalette';

interface ContactAvatarProps {
  sessionName: string;
  contactJid: string;
  contactName?: string;
  /**
   * Padronização de exibição de contato (2026-08-20) — nome salvo na aba
   * Contatos, quando houver. Prioridade sobre `contactName` (apelido do
   * WhatsApp) para as iniciais do fallback — mesma regra de
   * `formatContactDisplayName`.
   */
  savedContactName?: string;
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
  /**
   * CORREÇÃO 2026-08-18 (pedido do fundador — achado real de produção): a
   * lista de Conversas tem uma linha por conversa, e cada linha buscava a
   * foto ao vivo (`useContactAvatar` → IQ query no socket do Baileys, timeout
   * de 6s quando falha). Com muitos contatos sem foto — o caso comum, aqui
   * TODOS — isso vira um bombardeio contínuo (uma tentativa a cada ~6s, sem
   * parar) no MESMO socket que também precisa mandar mensagens reais,
   * contribuindo para falhas de envio observadas em produção. `false` pula
   * `useContactAvatar` inteiramente — nunca toca a rede/o socket, sempre cai
   * no fallback de iniciais. Default `true` (comportamento de sempre, usado
   * no cabeçalho da conversa aberta/painel de contexto — ali é só 1 contato
   * por vez, custo baixo, valor real). Solução provisória: uma versão melhor
   * (cache no servidor, por exemplo) fica para uma rodada futura.
   */
  fetchLive?: boolean;
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
  savedContactName,
  waitingForHuman = false,
  className,
  fetchLive = true,
}: ContactAvatarProps): JSX.Element {
  // `useContactAvatar` já trata sessionName/contactJid ausentes como "não
  // busca nada" — reaproveita essa mesma checagem em vez de pular o hook
  // condicionalmente (que violaria as Regras dos Hooks do React).
  const avatarUrl = useContactAvatar(
    fetchLive ? sessionName : undefined,
    fetchLive ? contactJid : undefined,
  );
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
          {formatContactInitials(contactJid, contactName, savedContactName)}
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
