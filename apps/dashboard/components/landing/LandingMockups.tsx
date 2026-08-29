import { Sparkles, TriangleAlert } from 'lucide-react';

/**
 * Landing page (2026-08-29) — mocks fiéis de duas telas reais do produto,
 * construídos com os mesmos tokens do Design System. São decorativos
 * (`aria-hidden`) — a informação que vendem está no texto ao lado.
 *
 * Nada aqui representa funcionalidade inexistente: o board é o Pipeline
 * (estágios classificados pela IA, M6H-5) e a lista é "Interações de IA"
 * (M3/N-blocks), inclusive o estado "Escalado".
 */

const PIPELINE_COLUMNS = [
  {
    name: 'Novo',
    accent: false,
    cards: [
      { title: 'Marina S.', note: 'Tem no tamanho G?' },
      { title: 'Auto Peças BR', note: 'Orçamento de pastilha' },
    ],
  },
  {
    name: 'Contatado',
    accent: false,
    cards: [{ title: 'João P.', note: 'Vou pensar e volto' }],
  },
  {
    name: 'Negociando',
    accent: true,
    cards: [
      { title: 'Trigo de Ouro', note: 'Fechar bolo de chocolate', highlight: true },
      { title: 'Studio Ável', note: 'Enviar proposta' },
    ],
  },
  {
    name: 'Fechado',
    accent: false,
    cards: [{ title: 'Camila R.', note: 'Pagou via Pix' }],
  },
] as const;

export function PipelineMockup(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="w-full rounded-2xl border border-border bg-background p-4 shadow-2xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-semibold">Pipeline · WhatsApp Vendas</p>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Atualizado pela IA
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {PIPELINE_COLUMNS.map((col) => (
          <div key={col.name}>
            <p
              className={`mb-2 text-[10px] uppercase tracking-wider ${
                col.accent ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {col.name}
            </p>
            <div className="flex flex-col gap-2">
              {col.cards.map((card) => (
                <div
                  key={card.title}
                  className={`rounded-lg border p-2.5 ${
                    'highlight' in card && card.highlight
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-border bg-card'
                  }`}
                >
                  <p className="text-[12px] font-semibold">{card.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{card.note}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const AI_ROWS = [
  {
    kind: 'ai' as const,
    text: '"Confirmo o bolo de chocolate pra amanhã às 15h?"',
    meta: '09:12 · estágio: Negociando · 412 tokens',
  },
  {
    kind: 'ai' as const,
    text: '"Nosso horário é das 8h às 18h. Retorno amanhã cedo!"',
    meta: '21:47 · fora do horário de atendimento',
  },
  {
    kind: 'escalated' as const,
    text: 'Cliente pediu atendente — conversa enviada pra fila humana',
    meta: '09:13 · motivo: pedido explícito',
  },
];

export function AiInteractionsMockup(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="w-full overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
    >
      <p className="border-b border-border px-4 py-3.5 text-[13px] font-semibold">Interações de IA</p>
      <div className="flex flex-col divide-y divide-border/60">
        {AI_ROWS.map((row) => (
          <div key={row.text} className="flex gap-3 px-4 py-3.5">
            {row.kind === 'ai' ? (
              <span className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/15 px-2 text-[11px] font-semibold text-primary">
                <Sparkles className="h-3 w-3" />
                Gerada por IA
              </span>
            ) : (
              <span className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 text-[11px] font-semibold text-warning-emphasis">
                <TriangleAlert className="h-3 w-3" />
                Escalado
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[13px]">{row.text}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{row.meta}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
