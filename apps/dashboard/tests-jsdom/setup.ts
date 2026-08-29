import { MotionGlobalConfig } from 'framer-motion';

/**
 * Setup do projeto Jest `dashboard-jsdom` (Milestone 4, Bloco M4E — D49).
 *
 * `ResizeObserver` nao existe no jsdom, mas o `ResponsiveContainer` do
 * recharts o exige ao montar (regressao real encontrada na validacao na
 * maquina do usuario, 2026-07-18: "ReferenceError: ResizeObserver is not
 * defined" no unico caso que renderiza o grafico com dados). Stub minimo e
 * inerte: os testes de componente verificam ESTADOS de renderizacao
 * (loading/erro/vazio/container presente), nunca medidas reais de layout —
 * observar redimensionamento de verdade e irrelevante aqui.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  // Conversao via `unknown` (exigencia do TS para tipos sem sobreposicao):
  // o stub nao implementa a assinatura completa do construtor nativo de
  // proposito — e inerte, so precisa existir para o recharts montar.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

/**
 * Landing page (2026-08-29) — `IntersectionObserver` tambem nao existe no
 * jsdom. Stub defensivo, mesmo racional do `ResizeObserver` acima: qualquer
 * componente que venha a observar interseccao (o `Reveal` da landing ja teve
 * versoes assim) monta sem quebrar; os testes verificam conteudo/estrutura,
 * nunca visibilidade real de scroll.
 */
class IntersectionObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    IntersectionObserverStub;
}

/**
 * Onda 2 do redesign (2026-08-23) — desliga TODA animacao do framer-motion
 * nos testes.
 *
 * Por que e necessario: a partir desta rodada varios componentes entram com
 * `initial`/`animate` (cascata de listas, contagem de numeros nos cards de
 * indicador). Num teste, `render()` e a consulta acontecem no mesmo tick, e
 * o elemento ainda esta no PRIMEIRO quadro da animacao — regressao real
 * observada em `ContactsPanel`/`CampaignsPanel`: o card existia no DOM com
 * `opacity: 0.20` e o numero exibia um valor intermediario, entao
 * `getByText('23')` nao encontrava nada.
 *
 * `skipAnimations` e o interruptor oficial do framer-motion para exatamente
 * este caso: os valores saltam direto para o estado final, sem passar por
 * `requestAnimationFrame`. Preferido a reescrever dezenas de assercoes com
 * `findBy*`/`waitFor` — aquilo mascararia o problema, deixaria os testes
 * mais lentos e ainda os tornaria sensiveis a duracao de cada animacao (uma
 * fonte classica de teste intermitente).
 */
MotionGlobalConfig.skipAnimations = true;

export {};
