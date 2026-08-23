import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis } from 'recharts';
import { toAiUsageChartPoints } from '@/lib/analyticsView';
import { CHART_COLORS } from '@/lib/chartTheme';
import ChartTooltip from './ChartTooltip';
import { formatCostUsd } from '@/lib/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import type { AiUsagePoint } from '@/lib/clientApi';

interface AiUsageChartProps {
  points: AiUsagePoint[] | null;
  errorMessage: string | null;
}

/**
 * Gráfico de uso/custo de IA por dia (Milestone 4, Bloco M4E — D49/recharts).
 * A conversão costUsd string->number acontece em `toAiUsageChartPoints`
 * (fronteira de renderização, D46).
 *
 * Reskin 2026-08-07 (Design System, tela Analytics: `lineChart()`) — o
 * mockup usa um traço minimalista (linha 2px + área preenchida a 8% +
 * pontos, SEM eixo/grade/legenda/tooltip): trocado de `LineChart`+eixos para
 * `AreaChart` sem `XAxis`/`YAxis`/`CartesianGrid`/`Tooltip`, replicando essa
 * estética "sparkline" pixel a pixel em vez de reinterpretar como um
 * gráfico cheio.
 */
/**
 * Onda 1 do redesign (2026-08-22) — contrato de 4 estados
 * (`PRODUCT_PRINCIPLES.md` §3): loading vira `Skeleton` do MESMO tamanho do
 * gráfico real (`h-[120px]`, evita CLS quando o dado chega) em vez de texto
 * solto; erro vira `ErrorState` (mesmo componente usado no resto do
 * produto). `onRetry` fica de fora de propósito — `useAiUsageAnalytics` não
 * expõe uma função de refetch hoje (só refaz a busca quando `range`/
 * `sessionName` mudam); `ErrorState` já suporta mostrar só a mensagem sem
 * botão quando `onRetry` está ausente, então nada foi inventado.
 */
export default function AiUsageChart({ points, errorMessage }: AiUsageChartProps): JSX.Element {
  if (errorMessage) {
    return <ErrorState className="min-h-[120px] p-4" description={errorMessage} />;
  }
  if (points === null) {
    return <Skeleton className="h-[120px] w-full rounded-md" />;
  }
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma interação de IA no período.</p>;
  }

  const data = toAiUsageChartPoints(points);

  return (
    <div className="h-[120px] w-full" data-testid="ai-usage-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
          {/*
            Onda 1 do redesign (2026-08-22) — `XAxis` existe apenas para dar
            ao tooltip a data do ponto (`hide`, sem cromo visual: a estética
            sparkline do Design System fica intacta).
          */}
          <XAxis dataKey="date" hide />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.mutedForeground, strokeWidth: 1 }}
            content={
              <ChartTooltip
                seriesLabels={{ costUsdNumber: 'Custo de IA' }}
                formatValue={(value) => formatCostUsd(String(value))}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="costUsdNumber"
            stroke={CHART_COLORS.primary}
            strokeWidth={2}
            fill={CHART_COLORS.primary}
            fillOpacity={0.08}
            dot={{ r: 2.5, stroke: 'none', fill: CHART_COLORS.primary }}
            activeDot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
