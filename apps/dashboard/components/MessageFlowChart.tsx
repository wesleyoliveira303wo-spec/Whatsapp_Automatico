import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { fillMissingDays, zeroMessageFlowPoint } from '@/lib/analyticsView';
import type { MessageFlowPoint } from '@/lib/clientApi';

interface MessageFlowChartProps {
  points: MessageFlowPoint[] | null;
  errorMessage: string | null;
  from: string;
  to: string;
}

/** Grafico de fluxo de mensagens inbound/outbound por dia (Milestone 4, Bloco M4E). Dias sem dados preenchidos com zero (`fillMissingDays`) para nao distorcer a leitura. */
export default function MessageFlowChart({ points, errorMessage, from, to }: MessageFlowChartProps): JSX.Element {
  if (errorMessage) {
    return <p className="text-sm text-red-600">{errorMessage}</p>;
  }
  if (points === null) {
    return <p className="text-sm text-gray-500">Carregando fluxo de mensagens…</p>;
  }
  if (points.length === 0) {
    return <p className="text-sm text-gray-500">Nenhuma mensagem no periodo.</p>;
  }

  const data = fillMissingDays(points, from, to, zeroMessageFlowPoint);

  return (
    <div className="h-64 w-full" data-testid="message-flow-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="inbound" name="Recebidas" fill="#0A74DA" />
          <Bar dataKey="outbound" name="Enviadas" fill="#16a34a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
