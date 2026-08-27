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
 * - `all`/`bot`/`waiting` são resolvidos no SERVIDOR (viram
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
 *
 * Correção 2026-08-26 (pedido do fundador) — a rolagem horizontal da correção
 * anterior resolvia o corte tecnicamente, mas sem NENHUM indício visual de
 * que havia mais pílulas fora da tela: "Humano" aparecia com a borda cortada
 * em cru, parecendo bug (não "role para o lado"). Tentativa inicial removeu
 * a opção — REVERTIDA no mesmo dia: o pedido real era enquadrar as 5 sem
 * cortar, não reduzir a funcionalidade. Fix definitivo: padding horizontal
 * (`px-2.5`→`px-2`), espaçamento entre pílulas (`gap-1`→`gap-[3px]`) e fonte
 * (`text-[12.5px]`→`text-[11.5px]`) reduzidos até as 5 caberem inteiras nos
 * ~320px de conteúdo da coluna (344px − `px-3` de 12px de cada lado) sem
 * precisar de `overflow-x-auto` — medido de verdade no navegador (soma das
 * larguras reais das 5 pílulas ≤ largura do contêiner), não estimado.
 *
 * Correção 2026-08-26b (pedido do fundador) — mesmo cabendo, a linha ficava
 * `justify-start` (default do flex): as 5 pílulas somam ~319px dentro de um
 * contêiner de ~319px de conteúdo disponível na maioria das telas, mas
 * quando sobra folga ela toda ia pro lado DIREITO (depois de "Humano"),
 * deixando a margem esquerda (antes de "Todas") visivelmente menor que a
 * direita. `justify-center` reparte a folga igualmente nos dois lados — as
 * margens esquerda/direita da linha inteira ficam sempre iguais entre si,
 * qualquer que seja a largura disponível.
 */
export default function ConversationFilterTabs({
  value,
  onChange,
}: ConversationFilterTabsProps): JSX.Element {
  return (
    <div
      className="flex flex-nowrap items-center justify-center gap-[3px]"
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
            className={`h-[26px] shrink-0 whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium transition-colors ${
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
