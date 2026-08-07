/**
 * Reskin 2026-08-07 (Design System, tela Analytics) — paleta dos gráficos
 * `recharts`, centralizada num único lugar em vez de hex soltos espalhados
 * por cada componente de gráfico (achado do levantamento: `AiUsageChart`/
 * `MessageFlowChart`/etc. tinham `#0A74DA` — a cor de marca ANTIGA, de antes
 * do rebrand verde da R1 — e `#16a34a`/`#dc2626`/`#d97706` soltos).
 *
 * Valores são strings `hsl(var(--token))`, não hex: funcionam direto como
 * atributo `stroke`/`fill` do SVG (recharts só passa a string adiante) e
 * herdam automaticamente o tema claro/escuro via CSS custom property — sem
 * precisar de uma 2ª tabela de cores para `.dark`.
 */
export const CHART_COLORS = {
  primary: 'hsl(var(--primary))',
  /** Tom bem apagado do primário — série secundária de um gráfico de duas barras (ex. mensagens enviadas vs. recebidas), igual ao par usado no Design System. */
  primaryFaint: 'hsl(var(--primary) / 0.22)',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  destructive: 'hsl(var(--destructive))',
  muted: 'hsl(var(--muted))',
  mutedForeground: 'hsl(var(--muted-foreground))',
  foregroundSecondary: 'hsl(var(--foreground-secondary))',
} as const;
