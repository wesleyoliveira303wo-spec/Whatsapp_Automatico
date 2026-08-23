import { useEffect } from 'react';
import {
  MotionGlobalConfig,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';

interface AnimatedNumberProps {
  /** Valor final. A contagem sempre parte do valor ANTERIOR (ou de 0 na primeira vez). */
  value: number;
  /**
   * Formata o número a cada quadro. Recebe o valor intermediário (fracionário)
   * — quem formata decide se arredonda, corta casas ou põe separador. Sem
   * isso, a contagem mostraria `41.38271` no meio do caminho.
   */
  format?: (value: number) => string;
  /** Duração em segundos. Default calibrado para "conta rápido, mas dá pra ver". */
  duration?: number;
  className?: string;
}

/**
 * Onda 2 do redesign (2026-08-23) — número que CONTA até o valor em vez de
 * aparecer pronto. Aplicado nos indicadores de topo (Analytics, Contatos,
 * Campanhas): é a animação de maior visibilidade do produto, porque acontece
 * no primeiro segundo em que a tela abre, no elemento de maior destaque
 * visual de cada tela.
 *
 * IMPLEMENTAÇÃO — dois detalhes que evitam problema de performance:
 *
 * 1. `useTransform` + `motion.span` renderizam o valor SEM passar por
 *    `setState`. Um `useState` no `onUpdate` dispararia um re-render do React
 *    por QUADRO (~60/s por número na tela); aqui o framer-motion escreve
 *    direto no nó do DOM. Com 4 cards de métrica na tela isso é a diferença
 *    entre ~240 re-renders/s e nenhum.
 *
 * 2. `useReducedMotion` corta a contagem para quem pede menos movimento —
 *    número pulando de 0 a 5.000 é exatamente o tipo de movimento que
 *    incomoda. Diferente das outras animações do produto, esta NÃO é coberta
 *    automaticamente pelo `MotionConfig` de `_app.tsx`: `MotionConfig` atua
 *    sobre props declarativas (`animate`/`initial`), não sobre a função
 *    imperativa `animate()` usada aqui — por isso a checagem é explícita.
 *
 * `tabular-nums` é obrigatório em quem usa este componente (já é padrão nos
 * cards do produto): sem largura fixa de dígito, o número "tremeria"
 * horizontalmente enquanto conta.
 */
export default function AnimatedNumber({
  value,
  format = (current) => String(Math.round(current)),
  duration = 0.7,
  className,
}: AnimatedNumberProps): JSX.Element {
  const motionValue = useMotionValue(0);
  const formatted = useTransform(motionValue, format);
  const prefersReducedMotion = useReducedMotion();

  /**
   * Caminho SEM animação — usado em dois casos, e renderiza texto normal do
   * React (não um `MotionValue`):
   *
   * - `prefers-reduced-motion`: número saltando de 0 a milhares é
   *   exatamente o tipo de movimento que a preferência pede para evitar.
   * - `MotionGlobalConfig.skipAnimations`: ligado no setup do Jest
   *   (`tests-jsdom/setup.ts`). É necessário tratar aqui explicitamente
   *   porque o `MotionValue` é escrito DIRETO no nó do DOM pelo
   *   framer-motion, fora do ciclo de render do React — `skipAnimations`
   *   sozinho pula a interpolação, mas o texto ainda não estaria no DOM no
   *   momento em que o teste consulta (regressão real observada em
   *   `ContactsPanel`: o card montava com `opacity: 1`, mas `getByText('23')`
   *   não achava o número).
   *
   * Efeito colateral positivo: quem lê o teste vê o número final de
   * verdade, e a asserção não depende de detalhe interno de animação.
   */
  const skipAnimation = prefersReducedMotion || MotionGlobalConfig.skipAnimations;

  useEffect(() => {
    if (skipAnimation) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, { duration, ease: EASE_OUT });
    return () => controls.stop();
  }, [value, duration, motionValue, skipAnimation]);

  if (skipAnimation) {
    return <span className={className}>{format(value)}</span>;
  }

  return <motion.span className={className}>{formatted}</motion.span>;
}
