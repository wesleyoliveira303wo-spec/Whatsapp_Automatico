import { Card } from '@/components/ui/card';

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
}

/**
 * Cartao de metrica agregada (Milestone 4, Bloco M4E). Valor SEMPRE string —
 * custo chega como string decimal exata (D46) e nunca e convertido aqui.
 *
 * Reskin 2026-08-07 (Design System, tela Analytics) — tamanhos exatos do
 * mockup: valor 25px/600 tabular-nums (era 24px/700), rótulo 12px acima
 * (era 14px), dica 11.5px (era 11px/70%-opacidade — trocado por
 * `text-muted-foreground` puro, sem opacidade extra, igual às outras telas
 * do reskin).
 */
export default function MetricCard({ label, value, hint }: MetricCardProps): JSX.Element {
  return (
    <Card className="rounded-lg px-[18px] py-4 shadow-none">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-[25px] font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}
