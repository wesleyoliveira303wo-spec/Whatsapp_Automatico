import { ResponsiveContainer, BarChart, Bar } from 'recharts';
import { fillMissingDays, zeroMessageFlowPoint } from '@/lib/analyticsView';
import { CHART_COLORS } from '@/lib/chartTheme';
import type { MessageFlowPoint } from '@/lib/clientApi';

interface MessageFlowChartProps {
  points: MessageFlowPoint[] | null;
  errorMessage: string | null;
  from: string;
  to: string;
}

/**
 * Gráfico de fluxo de mensagens inbound/outbound por dia (Milestone 4, Bloco
 * M4E). Dias sem dados preenchidos com zero (`fillMissingDays`) para não
 * distorcer a leitura.
 *
 * Reskin 2026-08-07 (Design System, tela Analytics: `dualBar()`) — duas
 * barras agrupadas por dia, sem eixo/grade/legenda/tooltip. Cores exatas do
 * mockup: recebidas no tom cheio do primário, enviadas num tom bem apagado
 * do mesmo primário (não duas cores distintas) — o Design System usa essa
 * dupla em todo gráfico de "entrada vs. saída".
 */
export default function MessageFlowChart({
  points,
  errorMessage,
  from,
  to,
}: MessageFlowChartProps): JSX.Element {
  if (errorMessage) {
    return <p className="text-sm text-destructive">{errorMessage}</p>;
  }
  if (points === null) {
    return <p className="text-sm text-muted-foreground">Carregando fluxo de mensagens…</p>;
  }
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma mensagem no período.</p>;
  }

  const data = fillMissingDays(points, from, to, zeroMessageFlowPoint);

  return (
    <div className="h-[120px] w-full" data-testid="message-flow-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 3, right: 3, bottom: 3, left: 3 }}
          barGap={2}
          barCategoryGap="18%"
        >
          <Bar
            dataKey="inbound"
            fill={CHART_COLORS.primary}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="outbound"
            fill={CHART_COLORS.primaryFaint}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
