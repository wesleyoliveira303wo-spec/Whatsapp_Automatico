import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { MessageSquare, Brain, BarChart3, Kanban, Contact, Send } from 'lucide-react';
import { useMe } from '@/hooks/useMe';
import { useWaitingForHuman } from '@/hooks/useWaitingForHuman';
import { useSessionDetail } from '@/hooks/useSessionDetail';
import ContactAvatar from '@/components/ContactAvatar';
import FrancisLogo from '@/components/brand/FrancisLogo';
import StatusDot from '@/components/StatusDot';
import ThemeToggle from '@/components/ThemeToggle';
import AccountMenu from '@/components/AccountMenu';
import { cn } from '@/lib/utils';

interface SessionRailProps {
  sessionName: string;
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
 * navegação e o botão de conta. O antigo link direto "Configurações" vira
 * `AccountMenu` — um popover com identidade do usuário + Configurações da
 * sessão + Trocar senha + Sair (tudo que antes vivia como texto solto no
 * `Header`, agora fora do fluxo das 5 telas de sessão).
 *
 * Ajuste 2026-08-07 (pedido do fundador, comparando com o HTML do Claude
 * Design): o rail tinha DOIS elementos separados no topo (seta "voltar" +
 * ícone da sessão) — o mockup (`Francis Pipeline.dc.html` linha 45) usa só
 * UM botão. Tamanhos/raios recalibrados para os valores exatos do mockup
 * (ícone-sessão 34px/raio 11; ícones de nav/tema/conta 38px/raio 11, glifo
 * 19px) — antes usavam os derivados genéricos do Design System (36/40px,
 * raio 8/10).
 *
 * Correção 2026-08-07 (2ª rodada, pedido do fundador): esse ícone deixou de
 * ser um link — vira só a IDENTIDADE VISUAL do WhatsApp conectado (foto de
 * perfil real do número, via `ContactAvatar`/`useContactAvatar`, mesmo
 * mecanismo já usado para contatos — aqui aplicado ao PRÓPRIO número da
 * sessão, `session.phoneNumber@s.whatsapp.net`). "Voltar a todos os
 * WhatsApps" migrou para a marca no `SessionHeader` (ver sua docstring) —
 * não sobra nenhum caminho de navegação perdido. Sem `phoneNumber` ainda
 * carregado (sessão nunca conectada, ou dado ainda chegando pelo SSE), cai
 * de volta na logo da marca — nunca um círculo vazio.
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
  const waitingHere = countBySession[sessionName] ?? 0;
  const { session } = useSessionDetail(sessionName);

  const base = `/sessions/${encodeURIComponent(sessionName)}`;
  const items: RailItem[] = [
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
    { href: `${base}/campaigns`, label: 'Campanhas', icon: Send },
    { href: `${base}/pipeline`, label: 'Pipeline', icon: Kanban },
    { href: `${base}/analytics`, label: 'Analytics', icon: BarChart3, requiresManager: true },
    { href: `${base}/ai`, label: 'IA', icon: Brain, requiresManager: true },
  ];

  const sessionTitle = session ? `${sessionName} · ${session.status}` : sessionName;

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center border-r border-border bg-background pb-3 pt-[10px]">
      <div
        title={sessionTitle}
        className="relative mb-3.5 mt-0.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary"
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
      </div>

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
                isActive ? 'text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
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

      <ThemeToggle className="h-[38px] w-[38px] rounded-[11px]" />
      <AccountMenu sessionName={sessionName} />
    </aside>
  );
}
