import { presetRange } from '@/lib/analyticsView';

interface AnalyticsRangePickerProps {
  value: { from: string; to: string };
  onChange: (range: { from: string; to: string }) => void;
}

const PRESETS: Array<{ label: string; days: number }> = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
];

/**
 * Seletor de faixa de tempo (Milestone 4, Bloco M4E — D50): presets simples
 * (7/30/90 dias, UTC — D45), sem datepicker customizado (dependencia nova
 * desnecessaria para um painel interno; YAGNI). `aria-pressed` como em
 * `ConversationFilterTabs`.
 */
export default function AnalyticsRangePicker({ value, onChange }: AnalyticsRangePickerProps): JSX.Element {
  return (
    <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1" role="group" aria-label="Selecionar periodo">
      {PRESETS.map((preset) => {
        const range = presetRange(preset.days);
        const active = value.from === range.from && value.to === range.to;
        return (
          <button
            key={preset.days}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(presetRange(preset.days))}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
