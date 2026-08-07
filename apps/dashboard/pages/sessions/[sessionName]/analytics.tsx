import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import AnalyticsRangePicker from '@/components/AnalyticsRangePicker';
import MetricCard from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import AiUsageChart from '@/components/AiUsageChart';
import MessageFlowChart from '@/components/MessageFlowChart';
import ConversationAnalyticsPanel from '@/components/ConversationAnalyticsPanel';
import PipelineFunnelChart from '@/components/PipelineFunnelChart';
import EscalationRateChart from '@/components/EscalationRateChart';
import SessionStabilityChart from '@/components/SessionStabilityChart';
import { requireProtectedPageSession } from '@/lib/auth';
import {
  useAiUsageAnalytics,
  useMessagesAnalytics,
  useConversationsAnalytics,
  usePipelineFunnelAnalytics,
  useEscalationRateAnalytics,
  useSessionStabilityAnalytics,
} from '@/hooks/useAnalytics';
import { presetRange, sumCostUsd, pipelineConversionRate } from '@/lib/analyticsView';
import { pageTitle } from '@/lib/brand';

interface AnalyticsPageProps {
  tenantId: string;
  sessionName: string;
}

/**
 * Analytics dentro da sessão (Milestone 6, Bloco M6H-1b, ADR #74). Mesmo
 * guard de sempre. Os NÚMEROS já são POR SESSÃO de verdade a partir do
 * M6H-4, 2026-07-26 (antes eram tenant-wide, movido só de moldura/URL na
 * M6H-1b) — cada WhatsApp tem suas próprias métricas.
 */
export const getServerSideProps: GetServerSideProps<AnalyticsPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const session = guard.session;
  const sessionName = context.params?.sessionName;
  if (typeof sessionName !== 'string') {
    return { notFound: true };
  }
  return { props: { tenantId: session.tenantId, sessionName } };
};

export default function AnalyticsPage({ tenantId, sessionName }: AnalyticsPageProps): JSX.Element {
  const [range, setRange] = useState(() => presetRange(30));

  const aiUsage = useAiUsageAnalytics(sessionName, range);
  const messages = useMessagesAnalytics(sessionName, range);
  const conversations = useConversationsAnalytics(sessionName, range);
  const pipelineFunnel = usePipelineFunnelAnalytics(sessionName);
  const escalationRate = useEscalationRateAnalytics(sessionName, range);
  const sessionStability = useSessionStabilityAnalytics(sessionName, range);

  const totalCost = aiUsage.data ? sumCostUsd(aiUsage.data.points) : null;
  const totalInteractions = aiUsage.data
    ? aiUsage.data.points.reduce((sum, p) => sum + p.interactions, 0)
    : null;
  const totalMessages = messages.data
    ? messages.data.points.reduce((sum, p) => sum + p.inbound + p.outbound, 0)
    : null;
  const inboundCount = messages.data
    ? messages.data.points.reduce((sum, p) => sum + p.inbound, 0)
    : null;
  const outboundCount = messages.data
    ? messages.data.points.reduce((sum, p) => sum + p.outbound, 0)
    : null;

  const conversionRate = pipelineFunnel.data
    ? pipelineConversionRate(pipelineFunnel.data.funnel)
    : null;
  const funnelSubtitle =
    conversionRate !== null
      ? `Retrato atual — não varia com o período selecionado. Taxa de conversão: ${conversionRate}%.`
      : 'Retrato atual — não varia com o período selecionado.';

  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Analytics · ${sessionName}`)}</title>
      </Head>
      <div className="fx-scroll h-full overflow-y-auto">
        <div className="max-w-[1120px] px-6 pb-10 pt-5">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h1 className="text-[21px] font-semibold tracking-tight text-foreground">
                Analytics
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Métricas de custo, volume e estabilidade da operação.
              </p>
            </div>
            <AnalyticsRangePicker value={range} onChange={setRange} />
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              label="Custo de IA no período"
              value={totalCost !== null ? `US$ ${totalCost}` : '…'}
              hint={totalInteractions !== null ? `${totalInteractions} interações` : undefined}
            />
            <MetricCard
              label="Interações de IA"
              value={totalInteractions !== null ? String(totalInteractions) : '…'}
              hint="String decimal exata, sem arredondamento"
            />
            <MetricCard
              label="Mensagens (entrada + saída)"
              value={totalMessages !== null ? String(totalMessages) : '…'}
              hint={
                inboundCount !== null && outboundCount !== null
                  ? `${inboundCount} recebidas · ${outboundCount} enviadas`
                  : undefined
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ChartCard
              title="Uso de IA por dia"
              subtitle="Custo estimado em dólares, por dia do período."
            >
              <AiUsageChart
                points={aiUsage.data?.points ?? null}
                errorMessage={aiUsage.errorMessage}
              />
            </ChartCard>

            <ChartCard
              title="Fluxo de mensagens"
              subtitle="Entrada (cliente) vs. saída (IA + humano)."
            >
              <MessageFlowChart
                points={messages.data?.points ?? null}
                errorMessage={messages.errorMessage}
                from={range.from}
                to={range.to}
              />
            </ChartCard>

            <ChartCard
              title="Conversas novas"
              subtitle="Novas conversas por dia e distribuição por status atual."
            >
              <ConversationAnalyticsPanel
                newConversations={conversations.data?.newConversations ?? null}
                statusCounts={conversations.data?.statusCounts ?? null}
                errorMessage={conversations.errorMessage}
              />
            </ChartCard>

            <ChartCard title="Funil do Pipeline" subtitle={funnelSubtitle}>
              <PipelineFunnelChart
                funnel={pipelineFunnel.data?.funnel ?? null}
                errorMessage={pipelineFunnel.errorMessage}
              />
            </ChartCard>

            <ChartCard
              title="Taxa de escalonamento"
              subtitle="% de conversas que precisaram de humano, por dia."
            >
              <EscalationRateChart
                points={escalationRate.data?.points ?? null}
                errorMessage={escalationRate.errorMessage}
                from={range.from}
                to={range.to}
              />
            </ChartCard>

            <ChartCard
              title="Estabilidade da sessão"
              subtitle="Quedas de conexão registradas por dia."
            >
              <SessionStabilityChart
                points={sessionStability.data?.points ?? null}
                errorMessage={sessionStability.errorMessage}
                from={range.from}
                to={range.to}
              />
            </ChartCard>
          </div>
        </div>
      </div>
    </SessionLayout>
  );
}
