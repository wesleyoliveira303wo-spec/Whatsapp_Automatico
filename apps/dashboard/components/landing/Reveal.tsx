import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Landing page — entrada suave de um bloco, na montagem.
 *
 * REGRA DE SEGURANÇA (o motivo desta implementação, aprendida na marra):
 * o conteúdo NUNCA pode ficar preso invisível.
 *
 *   - Sem scroll-trigger. Um `IntersectionObserver` (ou timer de fallback)
 *     pode nunca disparar em ambientes que estrangulam timers — foi
 *     exatamente o que aconteceu antes. Aqui a revelação é só na montagem.
 *   - O estado REVELADO é `opacity: 1` / `transform: none` aplicado como
 *     valor final e autoritativo (não um keyframe CSS `animation`, que
 *     reaplica o frame inicial enquanto está "running"). Se a transição CSS
 *     for travada/pulada, o valor commitado continua sendo `1` e o
 *     navegador pinta visível.
 *   - `useEffect` roda no commit do React, não depende de `requestAnimationFrame`
 *     nem de `setTimeout` — dispara de forma confiável logo após o 1º paint.
 *   - `prefers-reduced-motion`: sem transição nenhuma (aparece direto).
 *   - `delay` é limitado a 200ms: é só `transition-delay` (não
 *     `animation-delay` com fill-mode), então mesmo travado o alvo continua
 *     visível — o teto pequeno mantém a janela de risco irrelevante.
 *
 * SSR renderiza o estado inicial (`opacity: 0`); o JS revela no cliente.
 * O texto está no DOM desde o SSR (extraível por crawler/leitor de tela) —
 * só a opacidade depende do JS, que hidrata de forma confiável.
 */
export default function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  /** Atraso da entrada, em segundos (limitado a 0,2s). */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li';
}): JSX.Element {
  const [revealed, setRevealed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    setRevealed(true);
  }, []);

  const cappedDelay = Math.min(Math.max(delay, 0), 0.2);

  const style: CSSProperties = reducedMotion
    ? { opacity: 1 }
    : {
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'none' : 'translateY(12px)',
        transition: 'opacity 450ms ease-out, transform 450ms ease-out',
        transitionDelay: `${cappedDelay}s`,
        willChange: 'opacity, transform',
      };

  return (
    <Tag className={className} style={style}>
      {children}
    </Tag>
  );
}
