import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { CHART_COLORS } from '@/lib/chartTheme';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import type { NewConversationsPoint, ConversationStatusCounts } from '@/lib/clientApi';

interface ConversationAnalyticsPanelProps {
  newConversations: NewConversationsPoint[] | null;
  statusCounts: ConversationStatusCounts | null;
  errorMessage: string | null;
}

/**
 * Painel de "Conversas novas" (Milestone 4, Bloco M4E — D42): série de novas
 * conversas por dia + retrato atual bot/humano.
 *
 * Reskin 2026-08-07 (Design System, tela Analytics) — gráfico igual ao de
 * `AiUsageChart` (sparkline sem eixo/grade/tooltip), com a legenda de status
 * abaixo (ponto colorido + rótulo + contagem), igual ao mockup. O mockup de
 * amostra inclui uma 3ª categoria fictícia ("Aguardando") que não existe nos
 * dados reais — `ConversationStatusCounts` só tem `bot`/`human` (o produto
 * não guarda uma contagem separada de "aguardando atendente" aqui); mostrar
 * um número inventado violaria a mesma regra que já vale para tamanho de
 * arquivo/duplo-check de leitura em outras telas — por isso a legenda real
 * tem 2 itens, não 3. Cores mantidas iguais ao resto do produto (bot=verde
 * `success`, humano=âmbar `warning`, mesmo par de `ConversationStatusBadge`).
 */
export default function ConversationAnalyticsPanel({
  newConversations,
  statusCounts,
  errorMessage,
}: ConversationAnalyticsPanelProps): JSX.Element {
  // Onda 1 do redesign (2026-08-22) — contrato de 4 estados, ver docstring equivalente em `AiUsageChart.tsx`.
  if (errorMessage) {
    return <ErrorState className="min-h-[100px] p-4" description={errorMessage} />;
  }
  if (newConversations === null || statusCounts === null) {
    // Reproduz a forma real (gráfico + legenda de 2 chips) para não pular de tamanho quando o dado chega.
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-[100px] w-full rounded-md" />
        <div className="flex flex-wrap gap-3.5">
          <Skeleton className="h-[18px] w-32 rounded-full" />
          <Skeleton className="h-[18px] w-40 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="conversation-analytics-panel">
      {newConversations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma conversa nova no período.</p>
      ) : (
        <div className="h-[100px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={newConversations} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
              <Area
                type="monotone"
                dataKey="count"
                stroke={CHART_COLORS.primary}
                strokeWidth={2}
                fill={CHART_COLORS.primary}
                fillOpacity={0.08}
                dot={{ r: 2.5, stroke: 'none', fill: CHART_COLORS.primary }}
                activeDot={false}
                isAnimationActive
                animationDuration={650}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex flex-wrap gap-3.5">
        <span className="flex items-center gap-1.5 text-xs text-foreground-secondary">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-success" aria-hidden="true" />
          Bot respondendo · {statusCounts.bot}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-foreground-secondary">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-warning" aria-hidden="true" />
          Atendimento humano · {statusCounts.human}
        </span>
      </div>
    </div>
  );
}
