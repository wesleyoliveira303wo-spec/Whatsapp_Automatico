import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

import AnimatedNumber from '@/components/ui/animated-number';
import { fadeInUp, staggerContainer } from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface BroadcastStat {
  icon: LucideIcon;
  label: string;
  /** Texto final; usado enquanto não há número para contar (ex.: "—" carregando). */
  value: string;
  /** Quando presente, o número CONTA até o valor (mesmo padrão de `MetricCard`). */
  numericValue?: number;
  /** Formata cada quadro da contagem; precisa devolver exatamente `value` no final. */
  formatValue?: (current: number) => string;
  deltaPct?: number;
}

/** `+N%`/`-N%` colorido — `undefined` não mostra nada (nunca inventa "0%"). */
function TrendBadge({ deltaPct }: { deltaPct?: number }): JSX.Element | null {
  if (deltaPct === undefined) return null;
  const positive = deltaPct >= 0;
  return (
    <span className={cn('text-[11.5px] font-medium', positive ? 'text-success' : 'text-destructive')}>
      {positive ? '+' : ''}
      {deltaPct}% vs. mês anterior
    </span>
  );
}

interface BroadcastStatRowProps {
  stats: BroadcastStat[];
  testId?: string;
}

/**
 * Faixa de indicadores de uma tela de disparos — Revisão de Disparos
 * (2026-09-12).
 *
 * Por que compartilhada: as abas "Para contatos" e "Para grupos" divergiram
 * justamente por terem crescido cada uma por conta própria (uma tinha quatro
 * indicadores, a outra nenhum). A anatomia agora mora num lugar só; para as
 * duas voltarem a divergir, alguém precisa mexer AQUI — e aí muda as duas.
 *
 * Regra: no máximo quatro indicadores. O quinto sempre parece importante e
 * nunca é; se um número novo merece a tela, ele substitui um dos quatro.
 */
export default function BroadcastStatRow({ stats, testId }: BroadcastStatRowProps): JSX.Element {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
      data-testid={testId}
    >
      {stats.slice(0, 4).map((stat) => (
        <motion.div
          key={stat.label}
          variants={fadeInUp}
          className="rounded-lg border border-border bg-card px-4 py-3.5"
        >
          <div className="mb-2 flex items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <stat.icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="text-[12.5px] text-muted-foreground">{stat.label}</p>
          </div>
          <p className="text-[22px] font-semibold leading-tight tabular-nums text-foreground">
            {stat.numericValue !== undefined ? (
              <AnimatedNumber value={stat.numericValue} format={stat.formatValue} />
            ) : (
              stat.value
            )}
          </p>
          <TrendBadge deltaPct={stat.deltaPct} />
        </motion.div>
      ))}
    </motion.div>
  );
}
