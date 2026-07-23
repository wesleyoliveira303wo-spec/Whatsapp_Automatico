import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { toAiUsageChartPoints } from '@/lib/analyticsView';
import type { AiUsagePoint } from '@/lib/clientApi';

interface AiUsageChartProps {
  points: AiUsagePoint[] | null;
  errorMessage: string | null;
}

/**
 * Grafico de uso/custo de IA por dia (Milestone 4, Bloco M4E — D49/recharts).
 * A conversao costUsd string->number acontece em `toAiUsageChartPoints`
 * (fronteira de renderizacao, D46) — o tooltip exibe a STRING exata.
 * Estados loading/erro/vazio seguem o padrao textual do projeto.
 */
export default function AiUsageChart({ points, errorMessage }: AiUsageChartProps): JSX.Element {
  if (errorMessage) {
    return <p className="text-sm text-red-600">{errorMessage}</p>;
  }
  if (points === null) {
    return <p className="text-sm text-gray-500">Carregando uso de IA…</p>;
  }
  if (points.length === 0) {
    return <p className="text-sm text-gray-500">Nenhuma interacao de IA no periodo.</p>;
  }

  const data = toAiUsageChartPoints(points);

  return (
    <div className="h-64 w-full" data-testid="ai-usage-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 12 }} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: unknown, name: string, entry: { payload?: { costUsd?: string } }) => {
              if (name === 'Custo (US$)') {
                // Exibe a string decimal EXATA no tooltip, nunca o number do eixo.
                return entry.payload?.costUsd ?? String(value);
              }
              return String(value);
            }}
          />
          <Line yAxisId="left" type="monotone" dataKey="interactions" name="Interacoes" stroke="#0A74DA" dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="costUsdNumber" name="Custo (US$)" stroke="#16a34a" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
