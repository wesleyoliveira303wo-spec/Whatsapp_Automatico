import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import AnimatedNumber from '@/components/ui/animated-number';
import { fadeInUp } from '@/lib/motion';

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  /**
   * Valor bruto/exato por trás do `value` exibido (Onda 1 do redesign,
   * 2026-08-22) — vai para o `title`, para quem precisa auditar a precisão
   * completa sem que ela ocupe o destaque visual do card.
   */
  exactValue?: string;
  /**
   * Onda 2 do redesign (2026-08-23) — quando informado, o card CONTA até
   * este número em vez de exibir `value` pronto. Opcional de propósito:
   * `value` continua sendo a fonte de verdade do texto (pode ser
   * "US$ 0,00", "—", "1.234"), e nem todo card tem um número puro por trás
   * (ex.: um valor ausente exibido como travessão). Quem tem o número passa
   * os dois — `value` define o formato, `numericValue` a contagem.
   */
  numericValue?: number;
  /**
   * Formata cada quadro da contagem. Só é usado junto com `numericValue`;
   * precisa produzir exatamente o mesmo texto de `value` quando recebe o
   * valor final, senão o número "salta" no fim da animação.
   */
  formatValue?: (current: number) => string;
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
 *
 * Onda 2 do redesign (2026-08-23) — o card inteiro entra com `fadeInUp`
 * (herdando a cascata quando a página o envolve num contêiner de stagger) e
 * o número conta até o valor quando `numericValue` é informado.
 */
export default function MetricCard({
  label,
  value,
  hint,
  exactValue,
  numericValue,
  formatValue,
}: MetricCardProps): JSX.Element {
  return (
    <motion.div variants={fadeInUp}>
      <Card className="rounded-lg px-[18px] py-4 shadow-none">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className="mt-2 text-[25px] font-semibold tabular-nums tracking-tight text-foreground"
          title={exactValue}
        >
          {numericValue !== undefined ? (
            <AnimatedNumber value={numericValue} format={formatValue} />
          ) : (
            value
          )}
        </p>
        {hint && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{hint}</p>}
      </Card>
    </motion.div>
  );
}
