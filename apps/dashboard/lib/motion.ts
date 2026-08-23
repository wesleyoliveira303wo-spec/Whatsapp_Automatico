import type { Easing, Transition, Variants } from 'framer-motion';

/**
 * Onda 2 do redesign (2026-08-23) — vocabulário ÚNICO de movimento do
 * produto. Existe para que toda animação da Dashboard use as mesmas
 * durações/curvas/distâncias: sem isso, cada tela inventaria seus próprios
 * valores e o resultado pareceria um conjunto de peças de produtos
 * diferentes — exatamente o defeito que o redesign está corrigindo no
 * visual estático (`Francis Design System.dc.html` §1: "Ritmo previsível...
 * o olho aprende o padrão uma vez").
 *
 * REGRAS aplicadas em todos os presets abaixo (Web Interface Guidelines):
 * - Só `transform`/`opacity` — as duas únicas propriedades que o navegador
 *   anima no compositor, sem recalcular layout a cada quadro. Nunca
 *   `width`/`height`/`top`/`left`.
 * - Durações curtas: 150–260ms. Acima de ~300ms uma microinteração deixa de
 *   parecer resposta e passa a parecer espera.
 * - Distâncias curtas: 6–12px. Deslocamento grande chama atenção para o
 *   movimento em si, não para o conteúdo que chegou.
 * - `ease-out` para entrada (rápido no começo, desacelera): dá sensação de
 *   "o elemento chegou ao seu lugar", em vez de "está sendo empurrado".
 *
 * `prefers-reduced-motion` NÃO é tratado aqui: o `MotionConfig
 * reducedMotion="user"` de `pages/_app.tsx` já neutraliza todo `motion.*`
 * globalmente, e a regra CSS de `globals.css` cobre o que é transição pura
 * de CSS. Repetir a checagem em cada preset seria redundante e daria a
 * falsa impressão de que animações novas precisam lembrar disso.
 */

/** Curva padrão de entrada de todo o produto (cubic-bezier "ease-out expo" suave). */
export const EASE_OUT: Easing = [0.16, 1, 0.3, 1];

/**
 * Item que aparece subindo levemente. Base de quase tudo: linha de lista,
 * card, bloco de conteúdo.
 */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.26, ease: EASE_OUT },
  },
};

/** Igual a `fadeInUp`, mas sem deslocamento — para quando o elemento não pode se mover (ex.: dentro de uma tabela). */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22, ease: EASE_OUT } },
};

/** Entrada com leve crescimento — para cards de destaque e números. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.24, ease: EASE_OUT },
  },
};

/**
 * Contêiner que revela os filhos EM CASCATA (cada um 40ms depois do
 * anterior). É o efeito que faz uma tela "montar" em vez de "aparecer
 * pronta" — o maior ganho de percepção de qualidade por linha de código.
 *
 * `staggerChildren: 0.04` é deliberadamente curto: com 50 itens numa lista,
 * um valor de 0.1s levaria 5 SEGUNDOS até o último aparecer. `delayChildren`
 * pequeno evita que a cascata comece antes do contêiner existir.
 */
export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

/**
 * Variante de cascata para listas LONGAS (Conversas, Contatos, Pipeline):
 * intervalo menor ainda, e um teto natural — como o stagger é proporcional
 * ao índice, listas de 50+ itens precisam de um passo bem curto para o
 * último item não demorar visivelmente.
 */
export const staggerContainerFast: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.018 },
  },
};

/** Transição padrão para mudanças de estado já visíveis (hover, cor, posição). */
export const SNAPPY: Transition = { duration: 0.18, ease: EASE_OUT };
