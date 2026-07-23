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

export {};
