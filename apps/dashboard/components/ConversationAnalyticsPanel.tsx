import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { NewConversationsPoint, ConversationStatusCounts } from '@/lib/clientApi';

interface ConversationAnalyticsPanelProps {
  newConversations: NewConversationsPoint[] | null;
  statusCounts: ConversationStatusCounts | null;
  errorMessage: string | null;
}

/** Painel de conversas (Milestone 4, Bloco M4E — D42): serie de novas conversas por dia + retrato atual bot/humano. */
export default function ConversationAnalyticsPanel({
  newConversations,
  statusCounts,
  errorMessage,
}: ConversationAnalyticsPanelProps): JSX.Element {
  if (errorMessage) {
    return <p className="text-sm text-red-600">{errorMessage}</p>;
  }
  if (newConversations === null || statusCounts === null) {
    return <p className="text-sm text-gray-500">Carregando conversas…</p>;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="conversation-analytics-panel">
      <div className="flex gap-4 text-sm">
        <span className="rounded-full bg-green-100 px-3 py-1 font-semibold text-green-800">Bot: {statusCounts.bot}</span>
        <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">Humano: {statusCounts.human}</span>
      </div>
      {newConversations.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma conversa nova no periodo.</p>
      ) : (
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={newConversations} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" name="Novas conversas" stroke="#0A74DA" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
