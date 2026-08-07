import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { toAiUsageChartPoints } from '@/lib/analyticsView';
import { CHART_COLORS } from '@/lib/chartTheme';
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
export default function AiUsageChart({ points, errorMessage }: AiUsageChartProps): JSX.Element {
  if (errorMessage) {
    return <p className="text-sm text-destructive">{errorMessage}</p>;
  }
  if (points === null) {
    return <p className="text-sm text-muted-foreground">Carregando uso de IA…</p>;
  }
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma interação de IA no período.</p>;
  }

  const data = toAiUsageChartPoints(points);

  return (
    <div className="h-[120px] w-full" data-testid="ai-usage-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
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
