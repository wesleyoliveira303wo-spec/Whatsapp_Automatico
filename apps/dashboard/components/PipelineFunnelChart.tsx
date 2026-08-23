import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, LabelList } from 'recharts';
import { formatConversationStageLabel } from '@/lib/formatters';
import { CHART_COLORS } from '@/lib/chartTheme';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import type { PipelineFunnelCounts, ConversationStage } from '@/lib/clientApi';

interface PipelineFunnelChartProps {
  funnel: PipelineFunnelCounts | null;
  errorMessage: string | null;
}

/** Ordem de exibição do funil — mesma ordem do board Kanban (M6H-5), não a ordem alfabética das chaves do DTO. */
const STAGE_ORDER: ConversationStage[] = [
  'new',
  'contacted',
  'negotiating',
  'closed_won',
  'closed_lost',
];

/**
 * Funil do Pipeline (Fase 1, Bloco F1.6 — Analytics de NEGÓCIO). Retrato
 * atual (sem faixa de tempo).
 *
 * Reskin 2026-08-07 (Design System, tela Analytics: `hBars()`) — barras
 * horizontais com o rótulo do estágio à esquerda e a contagem ao final da
 * barra, opacidade decrescente por linha (o estágio mais recente do funil
 * "salta mais" visualmente) — sem badges ao lado (existiam antes do
 * reskin); a taxa de conversão que elas mostravam não foi descartada, só
 * migrou para o subtítulo do card em `analytics.tsx`
 * (`pipelineConversionRate`, `lib/analyticsView.ts`).
 */
export default function PipelineFunnelChart({
  funnel,
  errorMessage,
}: PipelineFunnelChartProps): JSX.Element {
  // Onda 1 do redesign (2026-08-22) — contrato de 4 estados, ver docstring equivalente em `AiUsageChart.tsx`.
  if (errorMessage) {
    return <ErrorState className="min-h-[190px] p-4" description={errorMessage} />;
  }
  if (funnel === null) {
    return <Skeleton className="h-[190px] w-full rounded-md" />;
  }

  const total = STAGE_ORDER.reduce((sum, stage) => sum + funnel[stage], 0);
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma conversa no Pipeline ainda.</p>;
  }

  const data = STAGE_ORDER.map((stage) => ({
    stage: formatConversationStageLabel(stage),
    count: funnel[stage],
  }));

  return (
    <div className="h-[190px] w-full" data-testid="pipeline-funnel-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 3, right: 22, bottom: 3, left: 3 }}
          barSize={22}
          barCategoryGap={12}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="stage"
            width={86}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11.5, fill: CHART_COLORS.foregroundSecondary }}
          />
          <Bar
            dataKey="count"
            radius={5}
            background={{ fill: CHART_COLORS.muted, radius: 5 }}
            isAnimationActive={false}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={CHART_COLORS.primary} fillOpacity={0.85 - index * 0.09} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              style={{ fontSize: 11.5, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
