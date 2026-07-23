import type { ConversationStatus } from '@/lib/clientApi';

interface ConversationFilterTabsProps {
  value: ConversationStatus | undefined;
  onChange: (value: ConversationStatus | undefined) => void;
}

const OPTIONS: Array<{ label: string; value: ConversationStatus | undefined }> = [
  { label: 'Todas', value: undefined },
  { label: 'Bot', value: 'bot' },
  { label: 'Humano', value: 'human' },
];

/**
 * Filtro de conversas por status (Milestone 3, Bloco 6 — D25): resolvido no
 * SERVIDOR — trocar a aba refaz a query (`?status=`), nunca filtra
 * client-side (incompativel com paginacao por cursor, D24). Grupo de botoes
 * com `aria-pressed` (padrao acessivel simples, sem dependencia nova).
 */
export default function ConversationFilterTabs({ value, onChange }: ConversationFilterTabsProps): JSX.Element {
  return (
    <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1" role="group" aria-label="Filtrar conversas por status">
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
