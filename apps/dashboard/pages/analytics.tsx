import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import AnalyticsRangePicker from '@/components/AnalyticsRangePicker';
import MetricCard from '@/components/MetricCard';
import AiUsageChart from '@/components/AiUsageChart';
import MessageFlowChart from '@/components/MessageFlowChart';
import ConversationAnalyticsPanel from '@/components/ConversationAnalyticsPanel';
import { requireProtectedPageSession } from '@/lib/auth';
import { useAiUsageAnalytics, useMessagesAnalytics, useConversationsAnalytics } from '@/hooks/useAnalytics';
import { presetRange, sumCostUsd } from '@/lib/analyticsView';

interface AnalyticsPageProps {
  tenantId: string;
}

/**
 * Pagina de Analytics (Milestone 4, Bloco M4E — D42/D50): uso/custo de IA,
 * fluxo de mensagens e conversas por periodo, derivados em tempo de consulta
 * (D51 — nada pre-agregado). Buckets diarios em UTC (D45, limitacao
 * documentada na propria tela). Mesmo guard de autenticacao das demais
 * paginas protegidas.
 */
export const getServerSideProps: GetServerSideProps<AnalyticsPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const session = guard.session;
  return { props: { tenantId: session.tenantId } };
};

export default function AnalyticsPage({ tenantId }: AnalyticsPageProps): JSX.Element {
  const [range, setRange] = useState(() => presetRange(30));

  const aiUsage = useAiUsageAnalytics(range);
  const messages = useMessagesAnalytics(range);
  const conversations = useConversationsAnalytics(range);

  const totalCost = aiUsage.data ? sumCostUsd(aiUsage.data.points) : null;
  const totalInteractions = aiUsage.data ? aiUsage.data.points.reduce((sum, p) => sum + p.interactions, 0) : null;
  const totalMessages = messages.data ? messages.data.points.reduce((sum, p) => sum + p.inbound + p.outbound, 0) : null;

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex flex-col flex-1">
        <Header tenantId={tenantId} />
        <main className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Analytics</h1>
              <p className="text-xs text-gray-400">Buckets diarios em UTC — derivado em tempo de consulta, sem pre-agregacao.</p>
            </div>
            <AnalyticsRangePicker value={range} onChange={setRange} />
          </div>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard label="Custo de IA no periodo" value={totalCost !== null ? `US$ ${totalCost}` : '…'} hint="String decimal exata, sem arredondamento" />
            <MetricCard label="Interacoes de IA" value={totalInteractions !== null ? String(totalInteractions) : '…'} />
            <MetricCard label="Mensagens (in+out)" value={totalMessages !== null ? String(totalMessages) : '…'} />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Uso de IA por dia</h2>
            <AiUsageChart points={aiUsage.data?.points ?? null} errorMessage={aiUsage.errorMessage} />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Fluxo de mensagens por dia</h2>
            <MessageFlowChart points={messages.data?.points ?? null} errorMessage={messages.errorMessage} from={range.from} to={range.to} />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Conversas</h2>
            <ConversationAnalyticsPanel
              newConversations={conversations.data?.newConversations ?? null}
              statusCounts={conversations.data?.statusCounts ?? null}
              errorMessage={conversations.errorMessage}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
