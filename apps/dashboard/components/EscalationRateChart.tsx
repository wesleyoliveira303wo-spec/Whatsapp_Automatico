import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import {
  fillMissingDays,
  toEscalationRateChartPoints,
  zeroEscalationRatePoint,
} from '@/lib/analyticsView';
import { CHART_COLORS } from '@/lib/chartTheme';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import type { EscalationRatePoint } from '@/lib/clientApi';

interface EscalationRateChartProps {
  points: EscalationRatePoint[] | null;
  errorMessage: string | null;
  from: string;
  to: string;
}

/**
 * Taxa de escalonamento por dia (Fase 1, Bloco F1.6 — Analytics de
 * NEGÓCIO): % das conversas criadas naquele dia que em algum momento
 * precisaram de ajuda humana (`escalatedAt` preenchido).
 *
 * Reskin 2026-08-07 (Design System, tela Analytics: `lineChart()`, cor
 * âmbar) — mesma estética sparkline de `AiUsageChart`, sem eixo/grade/
 * tooltip.
 */
export default function EscalationRateChart({
  points,
  errorMessage,
  from,
  to,
}: EscalationRateChartProps): JSX.Element {
  // Onda 1 do redesign (2026-08-22) — contrato de 4 estados, ver docstring equivalente em `AiUsageChart.tsx`.
  if (errorMessage) {
    return <ErrorState className="min-h-[120px] p-4" description={errorMessage} />;
  }
  if (points === null) {
    return <Skeleton className="h-[120px] w-full rounded-md" />;
  }
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma conversa nova no período.</p>;
  }

  const data = fillMissingDays(
    toEscalationRateChartPoints(points),
    from,
    to,
    zeroEscalationRatePoint,
  );

  return (
    <div className="h-[100px] w-full" data-testid="escalation-rate-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
          <Area
            type="monotone"
            dataKey="rate"
            stroke={CHART_COLORS.warning}
            strokeWidth={2}
            fill={CHART_COLORS.warning}
            fillOpacity={0.08}
            dot={{ r: 2.5, stroke: 'none', fill: CHART_COLORS.warning }}
            activeDot={false}
            isAnimationActive
            animationDuration={650}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
