import type { TooltipProps } from 'recharts';
import { formatChartDateLabel } from '@/lib/analyticsView';

interface ChartTooltipProps extends TooltipProps<number, string> {
  /** Rótulo legível de cada série, por `dataKey` (ex.: `{ inbound: 'Recebidas' }`). */
  seriesLabels?: Record<string, string>;
  /** Formata o valor de cada série (default: número pt-BR). */
  formatValue?: (value: number, dataKey: string) => string;
}

/**
 * Tooltip compartilhado dos gráficos de Analytics — Onda 1 do redesign
 * (2026-08-22).
 *
 * POR QUE EXISTE: o reskin de 2026-08-07 portou os gráficos do mockup como
 * sparklines minimalistas, deliberadamente "SEM eixo/grade/legenda/tooltip".
 * A estética está certa e foi preservada; o que faltava era o outro metade do
 * padrão sparkline — um jeito de ler o valor. Sem eixo E sem tooltip, a linha
 * não informa nada: o operador vê uma tendência sem escala e sem data, o que
 * a auditoria classificou como "gráfico decorativo, não informativo".
 *
 * A alternativa (devolver `XAxis`/`YAxis`/`CartesianGrid`) foi descartada:
 * contrariaria o Design System aprovado e encheria de cromo um cartão de
 * 120px de altura. O tooltip resolve a leitura pontual sem custo visual em
 * repouso — que é exatamente o que a diretriz de dataviz recomenda para
 * gráficos de linha/área ("ship a crosshair+tooltip on line/area").
 *
 * Visual: mesmos tokens de menu suspenso do Design System §4 (fundo `popover`,
 * raio 12px via `rounded-lg`, `shadow-menu` — a única família de sombra que o
 * sistema permite, reservada ao que de fato flutua).
 */
export default function ChartTooltip({
  active,
  payload,
  label,
  seriesLabels,
  formatValue,
}: ChartTooltipProps): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-menu">
      {typeof label === 'string' && (
        <p className="mb-1 text-[11px] font-semibold text-foreground">
          {formatChartDateLabel(label)}
        </p>
      )}
      <div className="flex flex-col gap-0.5">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? '');
          const value = typeof entry.value === 'number' ? entry.value : 0;
          return (
            <div key={key} className="flex items-center gap-2 text-[11.5px]">
              {/*
                O ponto colorido carrega a identidade da série; o TEXTO fica em
                tinta neutra (diretriz de dataviz: "text wears text tokens,
                never the series color").
              */}
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{seriesLabels?.[key] ?? key}</span>
              <span className="ml-auto font-semibold tabular-nums text-foreground">
                {formatValue
                  ? formatValue(value, key)
                  : new Intl.NumberFormat('pt-BR').format(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
