import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { MessageSquare, Brain, BarChart3, Kanban, Contact, Send, Settings } from 'lucide-react';
import { useMe } from '@/hooks/useMe';
import { useWaitingForHuman } from '@/hooks/useWaitingForHuman';
import { useSessionDetail } from '@/hooks/useSessionDetail';
import ContactAvatar from '@/components/ContactAvatar';
import UserAvatar from '@/components/UserAvatar';
import StatusDot from '@/components/StatusDot';
import FrancisLogo from '@/components/brand/FrancisLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

interface SessionRailProps {
  /**
   * Auditoria do Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fase 1) —
   * agora OPCIONAL: `/perfil` não pertence a nenhuma sessão de WhatsApp
   * (é da PESSOA), mas o fundador pediu explicitamente que o rail continue
   * visível mesmo lá — só ESCONDENDO os itens que só fazem sentido dentro
   * de uma sessão (Conversas/Contatos/Campanhas/Pipeline/Analytics/IA).
   * Sem `sessionName`: o círculo do topo volta a ser a marca (leva ao
   * Workspace) e "Configurações" aponta para `/settings` (nível tenant) em
   * vez de `/sessions/:s/settings`.
   */
  sessionName?: string;
}

interface RailItem {
  href: string;
  label: string;
  icon: typeof MessageSquare;
  /** Só quem gerencia (administrator/owner) vê — mesma régua de cortesia de UX de sempre (quem barra de verdade é a API). */
  requiresManager?: boolean;
}

/**
 * Redesign 2026-08-05 (R2) — substitui `SessionSidebar.tsx` (w-64, rótulos
 * por extenso) por um rail vertical só de ícones (w-14), reduzindo os 8
 * itens soltos do menu antigo para 4 destinos + Configurações:
 *
 * - Conversas · Pipeline · Analytics · **IA** (agrupa Cérebro da IA +
 *   Respostas Rápidas, agora abas de `/sessions/:s/ai`)
 * - **Configurações** no rodapé (agrupa Conexão/QR + Equipe + Auditoria,
 *   agora abas de `/sessions/:s/settings`)
 *
 * Fase L (pedido do fundador, 2026-08-15) — 5º destino: **Contatos**, entre
 * Conversas e Pipeline. Nasceu como aba "Leads" de Configurações (Bloco
 * L1b) e migrou para cá: é consulta/importação do dia a dia, não
 * administração da empresa.
 *
 * Reskin 2026-08-06 (Design System §5/§7): `ThemeToggle` migra para AQUI
 * (antes vivia isolado no `Header` genérico, que não é mais renderizado
 * dentro de uma sessão — ver `SessionHeader`/`SessionLayout`), entre a
 * navegação e o ícone de Configurações.
 *
 * Reorganização Perfil/Configurações (2026-08-27, ver DECISIONS.md #106) —
 * DOIS pontos deste rail mudaram de papel, pedido explícito do fundador:
 *
 * 1. O círculo do topo MOSTRAVA a foto do WhatsApp conectado (identidade da
 *    SESSÃO — `ContactAvatar` no número da própria sessão). Auditoria
 *    apontou isso como a raiz de uma confusão real ("Whatsapp Sites" parecia
 *    ser o perfil do usuário). Virou o AVATAR DA PESSOA logada
 *    (`UserAvatar` — iniciais, ou foto se configurada no Perfil), e o
 *    clique leva ao Workspace (`/`) — assume o papel que antes era da marca
 *    no `SessionHeader` (essa marca deixou de ser um link, ver sua
 *    docstring).
 * 2. O ícone de engrenagem abria `AccountMenu` (popover com identidade +
 *    Configurações da sessão + Trocar senha + Sair). `AccountMenu` foi
 *    REMOVIDO — a engrenagem agora navega DIRETO para `/settings`, a nova
 *    dashboard de Configurações (nível TENANT, não mais aninhada numa
 *    sessão) — Trocar senha e Sair vivem lá dentro, aba Perfil → Segurança.
 *
 * Cada gate de papel é preservado EXATAMENTE como era (`requiresManager` =
 * administrator/owner, mesma régua de antes para IA/Analytics — ver
 * `settings.tsx`/`ai.tsx` para os gates por aba dentro de Configurações/IA).
 *
 * Tooltip nativo (`title`) no lugar do rótulo por extenso — sem
 * `@radix-ui/react-tooltip` novo (ícone só, mesmo racional de preferir
 * solução nativa já usado no projeto). Badge de "aguardando atendimento"
 * (`useWaitingForHuman`) migra do rótulo "Conversas" para um ponto sobre o
 * ícone.
 */
export default function SessionRail({ sessionName }: SessionRailProps): JSX.Element {
  const router = useRouter();
  const { user } = useMe();
  const canManageUsers = user?.role === 'administrator' || user?.role === 'owner';
  const { countBySession } = useWaitingForHuman();
  const waitingHere = sessionName ? (countBySession[sessionName] ?? 0) : 0;
  const { session } = useSessionDetail(sessionName ?? null);

  const base = sessionName ? `/sessions/${encodeURIComponent(sessionName)}` : null;
  const items: RailItem[] = base
    ? [
        { href: `${base}/conversations`, label: 'Conversas', icon: MessageSquare },
        // Fase L (pedido do fundador, 2026-08-15): item próprio do rail, entre
        // Conversas e Pipeline — antes vivia como aba "Leads" dentro de
        // Configurações. Sem `requiresManager`: a base de contatos é consulta do
        // dia a dia (permissão `contact:read` já libera desde OPERATOR); só a
        // IMPORTAÇÃO em lote, dentro da própria tela, exige administrator/owner.
        { href: `${base}/contacts`, label: 'Contatos', icon: Contact },
        // Reorganização Contatos/Campanhas (2026-08-17, 2ª rodada — pedido do
        // fundador): Campanhas volta a ser destino PRÓPRIO do rail — "Contatos"
        // é CRM puro, "Campanhas" é a ferramenta de disparo, domínios separados
        // de propósito (ver docstring de `CampaignsSidePanel`... removido; a
        // criação/gestão de campanhas mora nas páginas `/campaigns`).
        { href: `${base}/campaigns`, label: 'Disparos', icon: Send },
        { href: `${base}/pipeline`, label: 'Pipeline', icon: Kanban },
        { href: `${base}/analytics`, label: 'Analytics', icon: BarChart3, requiresManager: true },
        { href: `${base}/ai`, label: 'IA', icon: Brain, requiresManager: true },
      ]
    : [];

  const settingsHref = base ? `${base}/settings` : '/settings';
  const settingsActive = router.asPath.startsWith(settingsHref);

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center border-r border-border bg-background pb-3 pt-[10px]">
      {/*
        Identidade da SESSÃO ativa (não do usuário) — decisão do fundador,
        3ª rodada da Reorganização Perfil/Configurações (2026-08-27).
        Histórico, porque este círculo trocou de papel duas vezes:
        - Até 2026-08-27: foto do WhatsApp conectado, sem link (puramente
          visual). A auditoria apontou isso como a raiz da confusão
          "Whatsapp Sites = perfil do usuário".
        - 1ª correção: virou o avatar da PESSOA logada, com link para o
          Workspace.
        - AGORA: volta a ser a foto do WhatsApp da sessão — mas com função
          de navegação clara, que era o que faltava antes: leva aos DADOS
          daquela sessão (`/sessions/:s/settings?session=:s` — aba
          WhatsApps já com esta sessão aberta: status, número, histórico,
          conectar/desconectar). De lá, "← Todos os WhatsApps" lista as
          demais sessões, permitindo alternar. A identidade da PESSOA não
          se perde: vive em `/perfil`, area propria desde a Fase 4 da
          Reestruturação de Configurações.
      */}
      {/*
        Sem sessão (2026-08-28, Auditoria do Perfil): não há "dados desta
        conexão" pra levar — o círculo volta a ser a marca, link pro
        Workspace, mesmo destino/título do `Header.tsx` genérico.
      */}
      {sessionName && base ? (
        <Link
          href={`${settingsHref}/whatsapps?session=${encodeURIComponent(sessionName)}`}
          title={`${sessionName} — dados desta conexão`}
          aria-label={`${sessionName} — dados desta conexão`}
          className="relative mb-3.5 mt-0.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {session?.phoneNumber ? (
            <ContactAvatar
              sessionName={sessionName}
              contactJid={`${session.phoneNumber}@s.whatsapp.net`}
              className="h-[34px] w-[34px] text-[11px]"
            />
          ) : (
            <FrancisLogo size={16} />
          )}
          {session && (
            <span className="absolute -bottom-0.5 -right-0.5">
              <StatusDot status={session.status} className="border-2 border-background" />
            </span>
          )}
        </Link>
      ) : (
        <Link
          href="/app"
          title="Voltar para Todos os WhatsApps"
          aria-label="Voltar para Todos os WhatsApps"
          className="relative mb-3.5 mt-0.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FrancisLogo size={16} />
        </Link>
      )}

      <nav className="flex flex-1 flex-col items-center gap-1">
        {items.map(({ href, label, icon: Icon, requiresManager }) => {
          if (requiresManager && !canManageUsers) return null;
          const isActive =
            router.asPath === href ||
            router.asPath.startsWith(`${href}/`) ||
            router.asPath.startsWith(`${href}?`);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              className={cn(
                'relative flex h-[38px] w-[38px] items-center justify-center rounded-[11px] transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {/*
                Onda 2 do redesign (2026-08-23) — o realce do item ativo era
                uma classe estática (`bg-primary/10`), então trocar de tela
                fazia o fundo simplesmente pular de um ícone para outro. Com
                `layoutId` compartilhado, o framer-motion entende que é o
                MESMO elemento mudando de lugar e o desliza entre os itens —
                é a mesma técnica usada por Linear/Vercel na navegação
                lateral, e o efeito mais reconhecível de "produto bem
                acabado" por unidade de esforço.

                Fica atrás do ícone (`-z-10` + `absolute inset-0`), nunca
                envolvendo-o: assim o ícone não é remontado durante a
                transição e o texto/acessibilidade seguem intactos.
              */}
              {isActive && (
                <motion.span
                  layoutId="rail-active-indicator"
                  className="absolute inset-0 -z-10 rounded-[11px] bg-primary/10"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  aria-hidden="true"
                />
              )}
              <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
              {label === 'Conversas' && waitingHere > 0 && (
                <motion.span
                  // Entra "pulsando" uma vez: é um alerta (alguém esperando
                  // atendimento humano), então aparecer sem nenhum movimento
                  // fazia o sinal passar despercebido no canto do ícone.
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  className="absolute right-[5px] top-[5px] inline-flex h-2 w-2 rounded-full bg-destructive"
                  title={`${waitingHere} conversa(s) aguardando atendimento humano`}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/*
        Perfil — Reestruturação de Configurações, Fase 4 (2026-08-27).
        Precisa de porta PRÓPRIA no rail porque o círculo do topo é a
        identidade da SESSÃO (foto do WhatsApp), não da pessoa: sem este
        item, "eu" não teria acesso nenhum depois que Perfil saiu de
        Configurações. Avatar da PESSOA (iniciais/foto), coerente com o que
        o item representa.
      */}
      {user && !user.isSupport && (
        <Link
          href="/perfil"
          title="Meu perfil"
          aria-label="Meu perfil"
          className={cn(
            'mb-1 flex h-[38px] w-[38px] items-center justify-center rounded-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            router.asPath.startsWith('/perfil') ? 'bg-muted' : 'hover:bg-muted',
          )}
        >
          <UserAvatar
            email={user.email}
            name={user.name}
            avatarUrl={user.avatarUrl}
            className="h-[26px] w-[26px] text-[10px]"
          />
        </Link>
      )}

      <ThemeToggle className="h-[38px] w-[38px] rounded-[11px]" />
      {/*
        Reorganização Perfil/Configurações (2026-08-27) — antes abria um
        popover (`AccountMenu`, removido) com identidade + Configurações da
        sessão + Trocar senha + Sair. Agora navega DIRETO para Configurações
        (Perfil/WhatsApps/Equipe/Auditoria — Trocar senha e Sair vivem na aba
        Perfil → Segurança).
        3ª rodada: aponta para `/sessions/:s/settings` (não mais `/settings`
        solto) para que o RAIL CONTINUE VISÍVEL — o fundador reportou que
        perder o menu lateral ao abrir Configurações quebrava a navegação. E
        ganha o MESMO destaque verde dos outros destinos quando ativa
        (incluindo o indicador deslizante), em vez do cinza discreto de
        antes: é um destino como os demais, não um botão de canto.
        Reestruturação de Configurações, Fase 3/4 (2026-08-27): Perfil SAIU
        de Configurações (virou `/perfil`, area propria — ver
        `CONFIGURACOES_REDESIGN_PLAN.md`), entao a engrenagem abre a primeira
        secao de WORKSPACE que o papel alcança. Cada secao tem URL propria
        agora; sem `?tab=`, o servidor resolve e normaliza a URL.
      */}
      <Link
        href={settingsHref}
        title="Configurações"
        aria-label="Configurações"
        className={cn(
          'relative flex h-[38px] w-[38px] items-center justify-center rounded-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          settingsActive
            ? 'text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {settingsActive && (
          <motion.span
            layoutId="rail-active-indicator"
            className="absolute inset-0 -z-10 rounded-[11px] bg-primary/10"
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            aria-hidden="true"
          />
        )}
        <Settings className="h-[19px] w-[19px]" aria-hidden="true" />
      </Link>
    </aside>
  );
}
