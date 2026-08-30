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

/**
 * DropdownMenu do Radix (2026-08-29, achado real do fundador — substituiu o
 * menu "⋮" feito à mão de `CampaignsPanel.tsx` por
 * `@radix-ui/react-dropdown-menu` pra resolver um bug de vazamento visual da
 * coluna "Ações" contra o painel lateral). O Radix abre o menu no
 * `onPointerDown` do gatilho (nunca no `onClick`) — e este jsdom (20.0.3)
 * não implementa o CONSTRUTOR `PointerEvent` (confirmado: `new
 * window.PointerEvent(...)` lança "is not a constructor"). Sem isso,
 * `fireEvent.pointerDown` do Testing Library cai pra um `Event` genérico,
 * sem `pointerType`/`button`/`pointerId` — os campos que o handler do Radix
 * confere antes de abrir — e o menu nunca aparecia nos testes. Mesma classe
 * de "API que só existe no browser de verdade" do `ResizeObserver`/
 * `IntersectionObserver` acima: aqui a peça que falta é o CONSTRUTOR em si,
 * não um método solto, então o polyfill é a classe inteira (mínima, só os
 * campos que o Radix lê), não um stub de método.
 */
class PointerEventPolyfill extends MouseEvent {
  public readonly pointerId: number;
  public readonly pointerType: string;
  public readonly isPrimary: boolean;

  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params);
    this.pointerId = params.pointerId ?? 1;
    this.pointerType = params.pointerType ?? 'mouse';
    this.isPrimary = params.isPrimary ?? true;
  }
}

if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = (): boolean => false;
}
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = (): void => {};
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = (): void => {};
}
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = (): void => {};
}

export {};
