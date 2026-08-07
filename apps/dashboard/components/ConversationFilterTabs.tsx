export type ConversationFilterValue = 'all' | 'unread' | 'waiting' | 'bot' | 'human';

interface ConversationFilterTabsProps {
  value: ConversationFilterValue;
  onChange: (value: ConversationFilterValue) => void;
}

const OPTIONS: Array<{ label: string; value: ConversationFilterValue }> = [
  { label: 'Todas', value: 'all' },
  { label: 'Não lidas', value: 'unread' },
  { label: 'Aguardando', value: 'waiting' },
  { label: 'IA', value: 'bot' },
  { label: 'Humano', value: 'human' },
];

/**
 * Filtro de conversas (Milestone 3, Bloco 6 — D25; expandido no Redesign
 * 2026-08-05, R3, de 3 para 5 opções). Dois tipos de resolução, misturados
 * de propósito:
 * - `all`/`bot`/`human`/`waiting` são resolvidos no SERVIDOR (viram
 *   `?status=`/`?needsHumanAttention=` na `ConversationInbox`, que troca a
 *   URL do SSE — nunca filtra client-side, incompatível com paginação por
 *   cursor, D24).
 * - `unread` é resolvido no CLIENTE, sobre o que já foi carregado (mesma
 *   natureza da busca por texto — não filtra o que ainda não chegou).
 * Este componente não sabe dessa distinção — só emite o `value` escolhido;
 * `ConversationInbox` decide o que fazer com cada um.
 *
 * Reskin 2026-08-06 — pílulas SEM moldura (o mockup não usa `border`/`bg-card`
 * no container, só espaçamento entre os botões); ativo em `bg-foreground
 * text-background` (não `bg-primary`) — o Design System usa esse par
 * "segmentado escuro" para filtros/abas de modo em várias telas (mesmo par
 * de tokens que Cérebro da IA/Analytics vão reaproveitar), deliberadamente
 * distinto do verde do CTA primário.
 *
 * Correção 2026-08-07 (pedido do fundador): `flex-wrap` deixava "Humano"
 * cair para uma 2ª linha em telas mais estreitas (a lista de Conversas tem
 * só 344px) — o mockup nunca quebra linha aqui (`Francis Conversas.dc.html`
 * linha 99: `overflow-x: auto` sozinho, sem `flex-wrap`); trocado para
 * `flex-nowrap` + rolagem horizontal, igual ao HTML do Claude Design.
 *
 * Correção 2026-08-07b: `pb-2` DENTRO do próprio contêiner de rolagem (não
 * no wrapper de fora) — a barra de rolagem horizontal fica ancorada na borda
 * inferior da área com `overflow-x-auto`; sem esse respiro, ela encostava
 * direto nos botões.
 */
export default function ConversationFilterTabs({
  value,
  onChange,
}: ConversationFilterTabsProps): JSX.Element {
  return (
    <div
      className="fx-scroll flex flex-nowrap gap-1 overflow-x-auto pb-2"
      role="group"
      aria-label="Filtrar conversas"
    >
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`h-[27px] shrink-0 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-medium transition-colors ${
              active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
