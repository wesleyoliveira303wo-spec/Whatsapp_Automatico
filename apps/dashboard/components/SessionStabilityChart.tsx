import { ResponsiveContainer, BarChart, Bar } from 'recharts';
import { fillMissingDays, formatChartDateLabel } from '@/lib/analyticsView';
import { CHART_COLORS } from '@/lib/chartTheme';
import type { SessionStabilityPoint } from '@/lib/clientApi';

interface SessionStabilityChartProps {
  points: SessionStabilityPoint[] | null;
  errorMessage: string | null;
  from: string;
  to: string;
}

function zeroSessionStabilityPoint(date: string): SessionStabilityPoint {
  return { date, connected: 0, disconnected: 0, connecting: 0 };
}

interface StabilityBarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: SessionStabilityPoint;
}

/**
 * Barra com `<title>` nativo (tooltip do navegador) trazendo os 3 contadores
 * reais (conectou/desconectou/conectando) — preserva o dado completo mesmo
 * a barra só mostrando "desconectou" visualmente (ver docstring abaixo).
 *
 * Recharts tipa `shape` como `(props: unknown) => Element` — o parâmetro
 * chega como `unknown` de propósito (a lib aceita formatos internos
 * diferentes conforme o gráfico); por isso a assinatura recebe `unknown` e
 * faz o cast para `StabilityBarShapeProps` no corpo, não na assinatura.
 */
function StabilityBar(props: unknown): JSX.Element {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props as StabilityBarShapeProps;
  if (!payload) return <g />;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={Math.max(height, 0)}
      rx={2}
      fill={CHART_COLORS.destructive}
    >
      <title>
        {`${formatChartDateLabel(payload.date)} — Desconectou ${payload.disconnected} · Conectou ${payload.connected} · Conectando ${payload.connecting}`}
      </title>
    </rect>
  );
}

/**
 * Estabilidade de sessão por dia (Milestone 4, Bloco M4B/M4D). Conta quantas
 * transições de status (`WhatsAppSessionEvent`) aconteceram por dia.
 *
 * Reskin 2026-08-07 (Design System, tela Analytics: `dualBar()` com a 2ª
 * série zerada) — o mockup mostra UMA barra por dia, rotulada "quedas de
 * conexão" (o subtítulo do card já diz isso); o dado real tem 3 contadores
 * (conectou/desconectou/conectando) — a barra visual usa só `disconnected`
 * (a métrica que o próprio mockup nomeia), e os outros dois continuam
 * acessíveis via `title` nativo em cada barra (nenhum dado é descartado, só
 * deixa de ocupar uma legenda/3 séries coloridas fixas na tela).
 */
export default function SessionStabilityChart({
  points,
  errorMessage,
  from,
  to,
}: SessionStabilityChartProps): JSX.Element {
  if (errorMessage) {
    return <p className="text-sm text-destructive">{errorMessage}</p>;
  }
  if (points === null) {
    return <p className="text-sm text-muted-foreground">Carregando estabilidade da sessão…</p>;
  }
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma transição de status no período.</p>;
  }

  const data = fillMissingDays(points, from, to, zeroSessionStabilityPoint);

  return (
    <div className="h-[100px] w-full" data-testid="session-stability-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 3, right: 3, bottom: 3, left: 3 }}
          barCategoryGap="18%"
        >
          <Bar dataKey="disconnected" shape={StabilityBar} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
