import { ResponsiveContainer, BarChart, Bar, Tooltip, XAxis } from 'recharts';
import { fillMissingDays, zeroMessageFlowPoint } from '@/lib/analyticsView';
import { CHART_COLORS } from '@/lib/chartTheme';
import ChartTooltip from './ChartTooltip';
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
    <div data-testid="message-flow-chart">
      <div className="h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 3, right: 3, bottom: 3, left: 3 }}
            barGap={2}
            barCategoryGap="18%"
          >
            {/* Ver nota em `AiUsageChart`: eixo oculto, existe só para o tooltip saber a data. */}
            <XAxis dataKey="date" hide />
            <Tooltip
              cursor={{ fill: CHART_COLORS.muted }}
              content={
                <ChartTooltip seriesLabels={{ inbound: 'Recebidas', outbound: 'Enviadas' }} />
              }
            />
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
      {/*
        LEGENDA (Onda 1 do redesign, 2026-08-22) — obrigatoria a partir de 2
        series: sem ela o leitor ve duas cores de barra e nao tem como saber
        qual e entrada e qual e saida. O subtitulo do card dizia "Entrada
        (cliente) vs. saida (IA + humano)", mas nao MAPEIA cor -> serie, que e
        justamente o que falta. Nao e o `<Legend>` do recharts: este segue os
        tokens de texto do Design System (o ponto colorido carrega a
        identidade; o texto fica em tinta neutra).
      */}
      <div className="mt-2.5 flex items-center gap-3.5">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{ backgroundColor: CHART_COLORS.primary }}
            aria-hidden="true"
          />
          Recebidas
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{ backgroundColor: CHART_COLORS.primaryFaint }}
            aria-hidden="true"
          />
          Enviadas
        </span>
      </div>
    </div>
  );
}
