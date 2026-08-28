/**
 * Milestone 6, Bloco M6A (ADR #62) — base gerada no padrão shadcn/ui
 * (`components.json`, style "new-york", cssVariables: true), escrita
 * manualmente porque o CLI interativo não roda neste ambiente (mesmo valor
 * final que `npx shadcn@latest init` produziria). `darkMode: ["class"]` é
 * exigido pelos componentes shadcn mesmo sem dark mode ativo (ADR #65 —
 * fora de escopo da M6, mas a base fica pronta sem custo de refatoração
 * futura: nenhuma classe `.dark` é usada em lugar nenhum ainda).
 *
 * As cores abaixo são só o BASELINE do shadcn/ui (mapeadas para as CSS
 * variables definidas em `styles/globals.css`) — a paleta semântica
 * completa do produto (success/warning, tipografia, espaçamento, sombras)
 * é responsabilidade do Bloco M6A-3 seguinte, que ESTENDE este arquivo sem
 * remover nada daqui (aditivo, ordem aprovada pelo usuário: shadcn primeiro,
 * tokens finais depois, para aproveitar esta estrutura gerada).
 *
 * `primary` deixa de ser a string fixa `'#0A74DA'` (Bloco 6 da M3, D30) e
 * passa a ser `hsl(var(--primary))` — MESMA cor visual (209 91% 45% é a
 * conversão HSL exata de #0A74DA), agora indireta via variável CSS. Nenhum
 * componente existente que usa `bg-primary`/`text-primary` muda de
 * aparência; ganham a capacidade de trocar de tema no futuro sem editar
 * nenhum componente (só o valor da variável) — ver ADR #63 (marca ≠
 * sistema).
 */
const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,tsx}',
    './components/**/*.{js,ts,tsx}',
    // Reskin 2026-08-06 — `lib/formatters.ts`/`lib/avatarPalette.ts` passaram
    // a conter classes Tailwind ARBITRÁRIAS (`bg-[#hex]`, paletas de
    // tag/avatar) — sem este glob, o Tailwind nunca "vê" essas strings e
    // descarta as classes geradas (achado real: classes Tailwind PADRÃO já
    // usadas em `lib/formatters.ts` antes deste reskin sobreviviam por
    // coincidência, por já aparecerem em algum componente escaneado; um valor
    // arbitrário exclusivo deste arquivo não teria essa sorte).
    './lib/**/*.{js,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: {
          DEFAULT: 'hsl(var(--foreground))',
          // Reskin 2026-08-06 — 2º nível da hierarquia de texto do Design
          // System (`text-foreground-secondary`), entre `text-foreground` e
          // `text-muted-foreground`.
          secondary: 'hsl(var(--foreground-secondary))',
        },
        // Reskin 2026-08-06 — fundo da lista de conversas/aside (`bg-panel`),
        // distinto de `card` (conteúdo principal) e `background` (casca).
        panel: {
          DEFAULT: 'hsl(var(--panel))',
          foreground: 'hsl(var(--panel-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Bloco M6A-3 — extensão semântica do produto (ver comentário em
        // globals.css): status "saudável/sucesso" e "atenção/aguardando
        // humano", únicos dois significados de cor do PRODUCT_PRINCIPLES.md
        // §2.3 que ainda não tinham token central.
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          // Reskin 2026-08-06 — texto sobre selo translúcido (Design System
          // §6: "fundo translúcido ~12% + texto na versão escura da mesma
          // cor"), distinto do tom "ponto/ícone sólido" acima.
          emphasis: 'hsl(var(--success-emphasis))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          emphasis: 'hsl(var(--warning-emphasis))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          emphasis: 'hsl(var(--destructive-emphasis))',
        },
        // Reskin 2026-08-27 — tokens EXCLUSIVOS da tela de conversa
        // (referência WhatsApp Web). Ver comentário em globals.css:
        // deliberadamente separados de `primary`/`muted`, que continuam
        // servindo o resto do produto sem nenhuma mudança.
        chat: {
          'bubble-in': 'hsl(var(--chat-bubble-in))',
          'bubble-in-foreground': 'hsl(var(--chat-bubble-in-foreground))',
          'bubble-out': 'hsl(var(--chat-bubble-out))',
          'bubble-out-foreground': 'hsl(var(--chat-bubble-out-foreground))',
          meta: 'hsl(var(--chat-meta))',
          divider: 'hsl(var(--chat-divider))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Reskin 2026-08-06 — Design System §4: sombra só para o que flutua de
      // verdade (menus/popovers/toast) e o CTA primário (sombra sutil). Cards
      // de conteúdo continuam SEM sombra (fundo + borda), nada aqui os afeta.
      boxShadow: {
        menu: '0 12px 32px rgba(16,24,20,0.14)',
        cta: '0 1px 2px rgba(14,110,82,0.28)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      // `--font-sans` é gerado por `next/font/google` em `pages/_app.tsx` (os
      // dois são acoplados por construção). Reskin 2026-08-06: a fonte
      // carregada por trás desta variável passou de Inter para Instrument
      // Sans (Design System §3) — só o valor de `_app.tsx` mudou, a variável
      // e este fallback continuam os mesmos. Fallback é a pilha padrão de
      // sans-serif do próprio Tailwind, usada só se a fonte falhar ao carregar.
      fontFamily: {
        sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  // NOTA (Bloco M6A-3): tipografia (escala de tamanho), espaçamento e
  // breakpoints NÃO são sobrescritos aqui — conferidos contra CLAUDE.md §9
  // ("sm 0.875rem/base 1rem/lg 1.125rem/xl 1.25rem", espaçamento múltiplo de
  // 4, breakpoints 640/768/1024/1280) e já são EXATAMENTE os defaults do
  // Tailwind 3. Redefini-los aqui seria duplicar valor sem ganho (YAGNI) —
  // documentado explicitamente em DESIGN_SYSTEM.md para não parecer
  // esquecimento. Sombra (boxShadow) segue a escala default do Tailwind
  // (`shadow-sm`/`shadow`/`shadow-md`), já em uso desde a M2/M4.
  plugins: [require('tailwindcss-animate')],
};
