import { cn } from '@/lib/utils';
import { formatConversationStatusLabel } from '@/lib/formatters';
import type { ConversationStatus } from '@/lib/clientApi';

interface ConversationStatusBadgeProps {
  status: ConversationStatus;
  /**
   * Reforma do escalonamento (2026-07-25) — quando presente, a conversa está
   * sinalizada como "precisando de atenção humana" (a IA continua
   * respondendo, `status` normalmente ainda `'bot'`). Sobrepõe o rótulo/cor
   * normais por "Aguardando atendente" em destaque (mesmo tom de aviso já
   * usado em `ConversationListItem`) — o cabeçalho da conversa aberta é o
   * lugar mais contextual para avisar quem está olhando que precisa agir.
   */
  escalatedAt?: string;
  /**
   * Fase 1 (2026-08-07, pedido do fundador) — Botão POWER da sessão. Quando
   * `false`, sobrepõe QUALQUER combinação de `status`/`escalatedAt` por "IA
   * desativada" em vermelho — inclusive conversas já com `status: 'human'`
   * (decisão explícita do fundador: simplifica a leitura da tela inteira
   * enquanto o botão estiver desligado, sem exceção por selo). Default
   * `true` (comportamento de sempre) para não quebrar nenhum consumidor
   * existente.
   */
  aiEnabled?: boolean;
}

/**
 * Badge de status de conversa (Milestone 3, Bloco 6). Componente PROPRIO,
 * deliberadamente separado de `StatusBadge` (M2) — aquele e tipado a
 * `WhatsAppSessionStatus`; reaproveita-lo aqui exigiria quebrar o tipo ou
 * um `as any` (risco registrado no levantamento arquitetural do Bloco 6).
 *
 * Reskin 2026-08-06 — pílula compacta com ponto (Design System §6: "Badge de
 * estado: pílula 20–22px de altura, ponto de 5px + texto 11–11.5px/600,
 * fundo translúcido"), a MESMA anatomia usada pelos selos da lista de
 * conversas (`ConversationListItem`) e do painel de contexto — não compõe
 * mais o primitivo `Badge` genérico (que não tem noção de ponto), renderiza
 * direto.
 */
export default function ConversationStatusBadge({
  status,
  escalatedAt,
  aiEnabled = true,
}: ConversationStatusBadgeProps): JSX.Element {
  const isWaiting = Boolean(escalatedAt);
  const isHuman = status === 'human';
  const aiOff = !aiEnabled;
  const tone = aiOff ? 'destructive' : isWaiting || isHuman ? 'warning' : 'success';
  const label = aiOff
    ? 'IA desativada'
    : isWaiting
      ? 'Aguardando atendente'
      : formatConversationStatusLabel(status);

  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11.5px] font-semibold',
        tone === 'destructive'
          ? 'bg-destructive/10 text-destructive'
          : tone === 'warning'
            ? 'bg-warning/[.13] text-warning-emphasis'
            : 'bg-success/[.12] text-success-emphasis',
      )}
    >
      <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-current opacity-85" />
      {label}
    </span>
  );
}
