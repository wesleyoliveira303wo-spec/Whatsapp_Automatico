import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/**
 * Moldura compartilhada de UM gráfico da tela Analytics (Reskin 2026-08-07,
 * Design System) — título 13.5px/600 + subtítulo 11.5px muted + conteúdo,
 * mesmo cartão (fundo+borda, SEM sombra) repetido nos 6 gráficos. Extraído
 * como componente próprio em vez de repetir a mesma casca 6x em
 * `analytics.tsx` — os 6 gráficos (`AiUsageChart`/`MessageFlowChart`/
 * `ConversationAnalyticsPanel`/`PipelineFunnelChart`/`EscalationRateChart`/
 * `SessionStabilityChart`) continuam donos só do PRÓPRIO conteúdo
 * (loading/erro/vazio/dados), sem saber nada sobre título/moldura.
 */
export default function ChartCard({ title, subtitle, children }: ChartCardProps): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-[18px]">
      <h2 className="text-[13.5px] font-semibold leading-none text-foreground">{title}</h2>
      <p className="mb-3.5 mt-1 text-[11.5px] text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  );
}
