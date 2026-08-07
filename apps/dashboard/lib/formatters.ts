import type { WhatsAppDisconnectReason, WhatsAppSessionStatus } from './clientApi';

/**
 * Funções puras de formatação (M2, Fase 4 — UI). Deliberadamente sem
 * nenhuma dependência de React/DOM: são o único pedaço de lógica da Fase 4
 * testável no ambiente de testes atual (`testEnvironment: 'node'`, sem
 * jsdom — ver auto-auditoria da entrega para a justificativa completa de
 * por que os componentes React em si não ganharam testes automatizados
 * nesta fase). Cada função aqui tem uma entrada/saída determinística, sem
 * estado, sem I/O — o tipo de lógica que mais vale a pena isolar do JSX.
 *
 * Redesign 2026-08-05 (R1 — dark mode): as classes de badge migraram de
 * paleta crua do Tailwind (`bg-green-100`/`bg-amber-100`/etc.) para os
 * tokens semânticos (`bg-success/15 text-success` etc.) — a paleta crua não
 * tem contraparte no tema escuro (`.dark`), ficaria ilegível/sem sentido de
 * cor. O significado por status (verde=saudável, âmbar=atenção,
 * vermelho=erro, cinza=inativo) continua o mesmo, só a implementação virou
 * tema-agnóstica.
 */

const STATUS_LABELS: Record<WhatsAppSessionStatus, string> = {
  connected: 'Conectado',
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
};

const STATUS_BADGE_CLASSES: Record<WhatsAppSessionStatus, string> = {
  connected: 'bg-success/15 text-success',
  connecting: 'bg-warning/15 text-warning',
  disconnected: 'bg-muted text-muted-foreground',
};

const DISCONNECT_REASON_LABELS: Record<WhatsAppDisconnectReason, string> = {
  logged_out: 'Desconectado pelo celular (logout)',
  restart_required: 'Reinício exigido pelo protocolo',
  connection_lost: 'Conexão perdida',
  timed_out: 'Tempo de conexão esgotado',
  unknown: 'Motivo desconhecido',
};

export function formatStatusLabel(status: WhatsAppSessionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusBadgeClassName(status: WhatsAppSessionStatus): string {
  return STATUS_BADGE_CLASSES[status] ?? 'bg-muted text-muted-foreground';
}

/**
 * Cor sólida da BOLINHA de status (2026-07-25, pedido do fundador) —
 * distinta de `statusBadgeClassName` (fundo claro + texto, para o `Badge`
 * de pílula): aqui é só a cor de preenchimento de um círculo pequeno, mesmo
 * contrato de cor por status (`connected` = verde, `connecting` = amarelo,
 * `disconnected` = cinza), reaproveitado em `StatusDot`.
 */
const STATUS_DOT_CLASSES: Record<WhatsAppSessionStatus, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning',
  disconnected: 'bg-muted-foreground/40',
};

export function statusDotClassName(status: WhatsAppSessionStatus): string {
  return STATUS_DOT_CLASSES[status] ?? 'bg-muted-foreground/40';
}

export function formatDisconnectReasonLabel(
  reason: WhatsAppDisconnectReason | undefined,
): string | undefined {
  if (!reason) return undefined;
  return DISCONNECT_REASON_LABELS[reason] ?? reason;
}

/**
 * Formata uma data ISO 8601 (formato em que `apps/api` sempre serializa
 * `Date` via `JSON.stringify` — nunca chega ao browser como `Date` de
 * verdade) para `pt-BR`. Devolve `'—'` para `undefined`/string inválida —
 * evita espalhar esse guard em cada componente que exibe uma data opcional
 * (`connectedAt`, `lastSeen`).
 */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

// --- Milestone 3, Bloco 6 (D24/D27/D28): formatadores de conversas/IA ---
// Mesmo racional da secao acima (M2, Fase 4): funcoes puras, sem React/DOM,
// testaveis em `testEnvironment: 'node'` (D29).

import type {
  ConversationStatus,
  ConversationStage,
  AiInteractionStatus,
  AiInteractionSummary,
  TagColor,
} from './clientApi';

const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  bot: 'Bot respondendo',
  human: 'Atendimento humano',
};

export function formatConversationStatusLabel(status: ConversationStatus): string {
  return CONVERSATION_STATUS_LABELS[status] ?? status;
}

/**
 * Pipeline de CRM (Milestone 6, Bloco M6H-5) — ordem fixa das colunas do
 * board Kanban (funil clássico, 3 estágios em andamento + 2 terminais lado
 * a lado no fim). Exportado como array (não só o `Record` de rótulos)
 * porque `PipelineBoard` precisa iterar nesta ordem específica para montar
 * as colunas — mesmo espírito de constantes ordenadas já usado no projeto
 * quando a ordem de exibição importa e não é alfabética/enum natural.
 */
export const CONVERSATION_STAGE_ORDER: readonly ConversationStage[] = [
  'new',
  'contacted',
  'negotiating',
  'closed_won',
  'closed_lost',
];

const CONVERSATION_STAGE_LABELS: Record<ConversationStage, string> = {
  new: 'Novo',
  contacted: 'Contatado',
  negotiating: 'Negociando',
  closed_won: 'Fechado',
  closed_lost: 'Perdido',
};

export function formatConversationStageLabel(stage: ConversationStage): string {
  return CONVERSATION_STAGE_LABELS[stage] ?? stage;
}

/**
 * Coluna "Não cliente" do board Kanban (2026-08-01, ADR #96 — revisão da ADR
 * #94). Deliberadamente NÃO é um valor de `ConversationStage`: quem decide se
 * uma conversa está fora do funil comercial é o booleano
 * `ConversationSummary.excludedFromPipeline`, e esta chave existe só na
 * camada de APRESENTAÇÃO do board, para que a exclusão deixe de ser uma
 * configuração escondida e passe a ser uma coluna visível/arrastável.
 *
 * Consequência arquitetural importante: o enum do domínio segue com 5
 * valores, então `STAGE_ORDER`/`shouldAiUpdateStage` (`apps/api`) continuam
 * sendo uma reta de funil sem exceções, e a IA não tem como classificar uma
 * conversa como "não cliente" (ela nunca escreve esse booleano) — ver ADR #96
 * para o descarte da alternativa de virar um 6º valor de enum.
 */
export const NOT_CLIENT_COLUMN = 'not_client' as const;

/** Chave de coluna do board: um estágio real do funil OU a coluna derivada "Não cliente". */
export type PipelineColumnKey = ConversationStage | typeof NOT_CLIENT_COLUMN;

/**
 * Ordem das COLUNAS DO BOARD — "Não cliente" primeiro, depois os 5 estágios
 * do funil. Distinto de `CONVERSATION_STAGE_ORDER` de propósito: aquela
 * constante é a ordem do FUNIL (consumida por quem raciocina sobre estágio
 * de venda), esta é a ordem de LAYOUT do Kanban. Manter as duas separadas é
 * o que mantém o gráfico de funil do Analytics com 5 barras sem nenhuma
 * exceção espalhada pelo código.
 *
 * Reskin 2026-08-07 — reordenado de "funil + Não cliente no fim" para "Não
 * cliente primeiro" para bater com `Francis Pipeline.dc.html` (`STAGES`
 * começa por `excluded`); puramente uma escolha de LAYOUT aprovada no
 * Design System, sem efeito em `groupConversationsByPipelineColumn` (agrupa
 * por chave, não por posição) nem no funil do Analytics (usa
 * `CONVERSATION_STAGE_ORDER`, intocada).
 */
export const PIPELINE_COLUMN_ORDER: readonly PipelineColumnKey[] = [
  NOT_CLIENT_COLUMN,
  ...CONVERSATION_STAGE_ORDER,
];

export function formatPipelineColumnLabel(column: PipelineColumnKey): string {
  return column === NOT_CLIENT_COLUMN ? 'Não cliente' : formatConversationStageLabel(column);
}

/**
 * Cor do "ponto" de estágio no cabeçalho de cada coluna do board (Design
 * System, tela Pipeline: `STAGES[].dot`) — token, não hex fixo (o mockup usa
 * `#5C6B64`/`#C4790C`/`#16A34A`/`#D0342C`, que são exatamente
 * `--muted-foreground`/`--warning`/`--success`/`--destructive`). "Não
 * cliente"/"Novo"/"Contatado" compartilham o tom neutro (nenhum dos três é
 * um sinal de atenção); "Negociando" chama atenção (âmbar); os dois estágios
 * terminais usam a cor de desfecho (verde "Fechado", vermelho "Perdido").
 */
export function pipelineColumnDotClassName(column: PipelineColumnKey): string {
  if (column === 'negotiating') return 'bg-warning';
  if (column === 'closed_won') return 'bg-success';
  if (column === 'closed_lost') return 'bg-destructive';
  return 'bg-muted-foreground';
}

/**
 * Tags livres (Redesign 2026-08-05, R4; recalibrado no reskin 2026-08-06 com
 * os hex EXATOS de `TAG_COLORS`/`SWATCHES` do Design System — as 3 telas do
 * mockup que usam tags, Conversas/Pipeline/Configurações, repetem a MESMA
 * tabela, confirmando que é canônica). Paleta FIXA de 8 cores (decisão do
 * fundador, sem escolha livre de hex) — exceção deliberada à regra de "cor só
 * vem de token": aqui a cor é uma escolha ARBITRÁRIA de categorização do
 * usuário (like GitHub labels/Trello), não um estado semântico do produto,
 * então não há token correspondente ao qual mapeá-la. Valores via Tailwind
 * arbitrário (`bg-[#hex]`) — mesmo padrão já usado no projeto quando um valor
 * não tem equivalente na paleta padrão. Tema escuro EXTRAPOLADO (o mockup não
 * cobre dark mode): fundo = cor "ponto" (`TAG_COLOR_SWATCH_CLASSES`) a 20% de
 * opacidade, texto = a própria cor "ponto" (já saturada o bastante para ler
 * sobre fundo escuro).
 */
const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  gray: 'bg-[#EFF0EC] text-[#4E5A54] dark:bg-[#8B958F]/20 dark:text-[#8B958F]',
  red: 'bg-[#FBE9E7] text-[#9B2F26] dark:bg-[#D0342C]/20 dark:text-[#D0342C]',
  orange: 'bg-[#FCEDE1] text-[#8F4C12] dark:bg-[#C25A15]/20 dark:text-[#C25A15]',
  amber: 'bg-[#FAF0DA] text-[#8A5F09] dark:bg-[#C4790C]/20 dark:text-[#C4790C]',
  green: 'bg-[#E6F2EA] text-[#1F6438] dark:bg-[#16A34A]/20 dark:text-[#16A34A]',
  teal: 'bg-[#E2F1EE] text-[#0E6153] dark:bg-[#0E6E52]/20 dark:text-[#0E6E52]',
  blue: 'bg-[#E7EEFB] text-[#1E4C93] dark:bg-[#2A5FBF]/20 dark:text-[#2A5FBF]',
  purple: 'bg-[#EFEAFA] text-[#523499] dark:bg-[#6B3FCB]/20 dark:text-[#6B3FCB]',
};

/** Classe de fundo/texto para um chip/swatch da cor de uma tag — ver `TAG_COLOR_CLASSES`. */
export function tagBadgeClassName(color: TagColor): string {
  return TAG_COLOR_CLASSES[color] ?? TAG_COLOR_CLASSES.gray;
}

/** Só o fundo sólido (sem texto) — usado no swatch circular do seletor de cor. Hex exatos de `SWATCHES` (Design System, tela Configurações). */
const TAG_COLOR_SWATCH_CLASSES: Record<TagColor, string> = {
  gray: 'bg-[#8B958F]',
  red: 'bg-[#D0342C]',
  orange: 'bg-[#C25A15]',
  amber: 'bg-[#C4790C]',
  green: 'bg-[#16A34A]',
  teal: 'bg-[#0E6E52]',
  blue: 'bg-[#2A5FBF]',
  purple: 'bg-[#6B3FCB]',
};

export function tagSwatchClassName(color: TagColor): string {
  return TAG_COLOR_SWATCH_CLASSES[color] ?? TAG_COLOR_SWATCH_CLASSES.gray;
}

const AI_INTERACTION_STATUS_LABELS: Record<AiInteractionStatus, string> = {
  success: 'Sucesso',
  validation_rejected: 'Resposta rejeitada na validacao',
  provider_error: 'Erro do provider',
};

const AI_INTERACTION_STATUS_CLASSES: Record<AiInteractionStatus, string> = {
  success: 'bg-success/15 text-success',
  validation_rejected: 'bg-warning/15 text-warning',
  provider_error: 'bg-destructive/15 text-destructive',
};

export function formatAiInteractionStatusLabel(status: AiInteractionStatus): string {
  return AI_INTERACTION_STATUS_LABELS[status] ?? status;
}

export function aiInteractionStatusBadgeClassName(status: AiInteractionStatus): string {
  return AI_INTERACTION_STATUS_CLASSES[status] ?? 'bg-muted text-muted-foreground';
}

/**
 * Reskin 2026-08-06 — linha de detalhe compacta de UMA interação de IA, para
 * o painel de contexto da conversa (Design System, tela Conversas: `{{
 * i.detail }}`, ex. "1.204 tokens · US$ 0,0021 · 1,4s"). Condensa os MESMOS
 * campos já auditados em `AiInteractionRow` (tokens/custo/latência) numa
 * única string — nenhum dado é descartado, só reformatado; a tabela de
 * auditoria completa (`AiInteractionRow`, com prompt/tokens/custo/latência
 * em colunas próprias) continua existindo sem mudança nesta reskin, fora do
 * escopo do painel de contexto.
 */
export function formatAiInteractionCompactDetail(interaction: AiInteractionSummary): string {
  const latency = `${(interaction.latencyMs / 1000).toFixed(1)}s`;
  if (interaction.status === 'success') {
    const totalTokens = interaction.tokensInput + interaction.tokensOutput;
    return `${totalTokens} tokens · ${formatCostUsd(interaction.costUsd)} · ${latency}`;
  }
  const label =
    interaction.status === 'validation_rejected' ? 'Resposta rejeitada' : 'Erro do provider';
  return `${label} · ${latency}`;
}

/**
 * Reskin 2026-08-06 — tempo relativo BEM curto ("2 min"/"1h"/"1 dia"), sem o
 * prefixo "há" (Design System: `{{ i.ago }}` aparece sozinho ao lado do
 * detalhe da interação). Deliberadamente distinto de `formatElapsedDays`
 * (usado no card do Pipeline, sempre com "há" — contexto de frase própria).
 */
export function formatShortRelativeTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? '1 dia' : `${diffDays} dias`;
}

/**
 * Exibe o JID do WhatsApp de forma legivel: `5511999999999@s.whatsapp.net`
 * vira `5511999999999`. Nao tenta formatar como telefone (E.164 com
 * mascara) — o JID nao e garantidamente um numero discavel em todos os
 * casos, e uma mascara errada seria pior que o valor cru.
 */
export function formatContactJid(contactJid: string): string {
  const atIndex = contactJid.indexOf('@');
  return atIndex > 0 ? contactJid.slice(0, atIndex) : contactJid;
}

/**
 * Nome de exibição do contato para a UI (Milestone 6, Bloco M6H-2b):
 * `contactName` (pushName do WhatsApp), se presente; senão o número
 * (`formatContactJid`) como sempre foi antes deste bloco — nunca deixa a UI
 * em branco.
 */
export function formatContactDisplayName(contactJid: string, contactName?: string): string {
  return contactName && contactName.trim() ? contactName.trim() : formatContactJid(contactJid);
}

/**
 * Iniciais para o avatar-fallback (círculo com texto) quando não há foto de
 * perfil (Milestone 6, Bloco M6H-2b): 1-2 letras do `contactName`, se
 * houver (ex.: "Maria Silva" → "MS", "Loja" → "L"); senão os últimos 2
 * dígitos do número — mesmo fallback usado antes deste bloco, preservado
 * para contatos sem nome capturado.
 */
export function formatContactInitials(contactJid: string, contactName?: string): string {
  const trimmed = contactName?.trim();
  if (!trimmed) return formatContactJid(contactJid).slice(-2);
  const words = trimmed.split(/\s+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
  return (initials || trimmed.slice(0, 2)).toUpperCase();
}

/**
 * Milestone 6, Bloco M6H-2 — timestamp compacto para a linha da lista de
 * conversas (padrão WhatsApp/Telegram): hoje mostra só a hora (`14:32`);
 * antes de hoje mostra a data curta (`24/07`). Evita a data+hora completa de
 * `formatDateTime`, longa demais para uma linha de inbox. Devolve `'—'` para
 * entrada inválida — mesmo contrato de `formatDateTime`.
 */
export function formatConversationTimestamp(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
}

/** Custo em USD para exibicao: `costUsd` chega como string decimal exata (nunca number — Bloco 3b); exibe com prefixo e sem cortar precisao. */
export function formatCostUsd(costUsd: string): string {
  return `US$ ${costUsd}`;
}

/**
 * Redesign 2026-08-05 (R3) — telefone formatado para o painel de contexto da
 * conversa (`ConversationContextPanel`). Só aplica a máscara brasileira
 * (`+55 11 98122-4471`) quando o número CASA EXATAMENTE com o padrão local
 * (55 + DDD de 2 dígitos + linha de 8 ou 9 dígitos); fora disso devolve o
 * número cru (`formatContactJid`) — mesmo racional já documentado ali:
 * mascarar errado é pior que não mascarar.
 */
export function formatPhoneNumber(contactJid: string): string {
  const raw = formatContactJid(contactJid);
  const match = /^55(\d{2})(\d{8,9})$/.exec(raw);
  if (!match) return raw;
  const [, ddd, line] = match;
  const lineFormatted =
    line.length === 9
      ? `${line.slice(0, 5)}-${line.slice(5)}`
      : `${line.slice(0, 4)}-${line.slice(4)}`;
  return `+55 ${ddd} ${lineFormatted}`;
}

/**
 * Redesign 2026-08-05 (R3) — "Cliente há X" no painel de contexto, a partir
 * de `Conversation.createdAt` (quando a 1ª mensagem chegou). Diferença
 * calendário-aware de anos/meses (não múltiplos fixos de dias/30) — mesma
 * intuição de "1 ano e 2 meses" que uma pessoa usaria. Devolve `'—'` para
 * entrada inválida, mesmo contrato dos demais formatadores de data.
 */
export function formatClientSince(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  let years = now.getFullYear() - date.getFullYear();
  let months = now.getMonth() - date.getMonth();
  if (now.getDate() < date.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0 && months <= 0) return 'menos de 1 mês';
  if (years === 0) return months === 1 ? '1 mês' : `${months} meses`;
  if (months === 0) return years === 1 ? '1 ano' : `${years} anos`;
  const yearPart = years === 1 ? '1 ano' : `${years} anos`;
  const monthPart = months === 1 ? '1 mês' : `${months} meses`;
  return `${yearPart} e ${monthPart}`;
}

/**
 * Redesign 2026-08-05 (R3) — rótulo do divisor de data na timeline de
 * mensagens (padrão WhatsApp/Telegram: "Hoje"/"Ontem"/data curta). Devolve
 * `''` para entrada inválida — `MessageTimeline` simplesmente não desenha o
 * divisor nesse caso (degradação graciosa, nunca quebra a lista).
 */
export function formatDayDivider(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** Redesign 2026-08-05 (R3) — duas datas caem no mesmo dia (calendário local)? Usado por `MessageTimeline` para decidir quando inserir um divisor. Entrada inválida em qualquer lado devolve `false` (nunca insere divisor por engano). */
export function isSameCalendarDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA);
  const b = new Date(isoB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Fase 1, Bloco F1.7 — "há quanto tempo" desde uma data, para o card do
 * Pipeline (`stageUpdatedAt`): "agora há pouco" (< 1h), "há Xh" (mesmo dia),
 * "há 1 dia"/"há N dias" (dias corridos, calendário — não múltiplos de 24h,
 * para bater com a intuição de "desde ontem"). Devolve `'—'` para entrada
 * inválida, mesmo contrato de `formatConversationTimestamp`.
 */
export function formatElapsedDays(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffHours < 1) return 'agora há pouco';
  if (diffHours < 24) return `há ${diffHours}h`;

  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return `há ${diffHours}h`;
  if (diffDays === 1) return 'há 1 dia';
  return `há ${diffDays} dias`;
}

/**
 * Redesign 2026-08-05 (R5) — "o resumo da IA está desatualizado?": `true`
 * só quando AMBAS as datas existem E a última mensagem (`lastMessageAt`,
 * qualquer direção — F1.7) é estritamente posterior à última geração do
 * resumo (`aiSummaryUpdatedAt`). Deliberadamente não usa
 * `aiSummaryMessageCount` para esta comparação (embora o campo exista e seja
 * gravado) — `lastMessageAt` já responde exatamente "chegou mensagem nova
 * depois do resumo?" sem precisar buscar a contagem atual de mensagens.
 * Sem resumo gerado ainda (`aiSummaryUpdatedAt` ausente), não há "resumo
 * desatualizado" — só "resumo inexistente", tratado à parte pela UI.
 */
export function isSummaryOutdated(
  lastMessageAt: string | undefined,
  aiSummaryUpdatedAt: string | undefined,
): boolean {
  if (!lastMessageAt || !aiSummaryUpdatedAt) return false;
  const lastMessage = new Date(lastMessageAt).getTime();
  const summary = new Date(aiSummaryUpdatedAt).getTime();
  if (Number.isNaN(lastMessage) || Number.isNaN(summary)) return false;
  return lastMessage > summary;
}
