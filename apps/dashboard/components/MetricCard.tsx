interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
}

/** Cartao de metrica agregada (Milestone 4, Bloco M4E). Valor SEMPRE string — custo chega como string decimal exata (D46) e nunca e convertido aqui. */
export default function MetricCard({ label, value, hint }: MetricCardProps): JSX.Element {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-800">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
