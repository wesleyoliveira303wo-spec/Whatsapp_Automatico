import { presetRange } from '@/lib/analyticsView';

interface AnalyticsRangePickerProps {
  value: { from: string; to: string };
  onChange: (range: { from: string; to: string }) => void;
}

const PRESETS: Array<{ label: string; days: number }> = [
  { label: '7 dias', days: 7 },
  { label: '14 dias', days: 14 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
];

/**
 * Seletor de faixa de tempo (Milestone 4, Bloco M4E — D50): presets simples
 * (UTC — D45), sem datepicker customizado (dependencia nova desnecessaria
 * para um painel interno; YAGNI). `aria-pressed` como em
 * `ConversationFilterTabs`.
 *
 * Reskin 2026-08-07 (Design System, tela Analytics) — migrado de cinza/branco
 * cru (`border-gray-200`/`bg-white`/`text-gray-600`) para tokens; ganhou o
 * preset "14 dias" (o mockup tem 4 opções, não 3); pílula ativa em
 * `bg-foreground text-background` (par "segmentado escuro", igual aos
 * filtros de Conversas), não mais `bg-primary` — o Design System reserva o
 * verde do CTA para ações, não para seleção de filtro/período.
 */
export default function AnalyticsRangePicker({
  value,
  onChange,
}: AnalyticsRangePickerProps): JSX.Element {
  return (
    <div
      className="flex gap-1 rounded-[10px] border border-border bg-panel p-[3px]"
      role="group"
      aria-label="Selecionar periodo"
    >
      {PRESETS.map((preset) => {
        const range = presetRange(preset.days);
        const active = value.from === range.from && value.to === range.to;
        return (
          <button
            key={preset.days}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(presetRange(preset.days))}
            className={`h-[27px] rounded-[7px] px-[11px] text-[12.5px] font-medium transition-colors ${
              active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
