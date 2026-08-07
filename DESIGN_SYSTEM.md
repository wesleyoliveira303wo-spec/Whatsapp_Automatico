# DESIGN_SYSTEM.md

> **Idioma:** Português (Brasil), conforme política oficial do projeto (`CLAUDE.md`).
> **Status:** Fonte de verdade da linguagem visual implementada. Documenta o **como** (tokens, componentes, convenções técnicas); `PRODUCT_PRINCIPLES.md` documenta o **porquê** (regras de experiência); `USER_JOURNEY.md` documenta o **quando/onde** (jornada). `CLAUDE.md` §9 é o registro histórico original — este documento o substitui como referência técnica a partir da Milestone 6.
> **Escopo desta versão:** Milestone 6, Blocos M6A–M6E. Tokens, marca e biblioteca de primitivos existem, funcionam e agora têm um primeiro retrofit real: conexão WhatsApp (Sessões) e inbox de Conversas (M6E, ver §8). Telas fora desse recorte (Analytics, Usuários, Cérebro da IA, Login) ainda não foram tocadas — retrofit é incremental, priorizado por `USER_JOURNEY.md` §9.

---

## 1. Stack

| Camada               | Tecnologia                                               | Papel                                                                                         |
| -------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Utilitários CSS      | Tailwind CSS 3.4                                         | Base de todo o styling                                                                        |
| Componentes          | shadcn/ui (style `new-york`)                             | Primitivos copiados para o repo (`components/ui/`), não uma dependência de bundle tradicional |
| Acessibilidade       | Radix UI                                                 | Primitivos sem estilo por trás dos componentes shadcn (foco, teclado, ARIA)                   |
| Ícones               | lucide-react                                             | Única biblioteca de ícones do produto                                                         |
| Animação             | Framer Motion                                            | Microinterações (a partir do Bloco M6H) — nunca transição de página inteira                   |
| Composição de classe | `class-variance-authority` (cva)                         | Variantes de componente (`variant`, `size`)                                                   |
| Merge de classe      | `clsx` + `tailwind-merge` (via `cn()` em `lib/utils.ts`) | Combina classes condicionais sem conflito de utilitário Tailwind                              |
| Fonte                | Inter, via `next/font/google`                            | Nativa do Next 13.5 — zero dependência extra, self-hosted em build time                       |

Ver ADR #62 (`DECISIONS.md`) para a decisão completa e alternativas descartadas.

---

## 2. Tokens de cor

Todas as cores são **CSS variables** em `apps/dashboard/styles/globals.css` (formato HSL sem a função `hsl()`, para permitir opacidade via `/` do Tailwind, ex. `bg-primary/90`), mapeadas em `tailwind.config.js`. **Nunca usar valor de cor hardcoded** — sempre um token abaixo. Valores da tabela são os do tema **claro** (`:root`); o bloco `.dark` (§2.3) redefine as mesmas variáveis para o tema escuro — nenhum componente referencia cor fora desses dois blocos.

| Token                                    | Variável CSS                                 | Valor (HSL, tema claro)                                   | Uso                                                                                                          |
| ---------------------------------------- | -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `background` / `foreground`              | `--background` / `--foreground`              | `0 0% 100%` / `222.2 84% 4.9%`                            | Fundo e texto padrão da página                                                                               |
| `card` / `card-foreground`               | `--card` / `--card-foreground`               | igual a background/foreground                             | Superfícies elevadas (cartões)                                                                               |
| `popover` / `popover-foreground`         | `--popover` / `--popover-foreground`         | igual a background/foreground                             | Menus, tooltips, popovers                                                                                    |
| `primary` / `primary-foreground`         | `--primary` / `--primary-foreground`         | `163 94% 24%` / `210 40% 98%`                             | Ação principal — verde-teal escuro (≈`#047857`), trocado do azul original (`#0A74DA`) no Redesign 2026-08-05 |
| `secondary` / `secondary-foreground`     | `--secondary` / `--secondary-foreground`     | `210 40% 96.1%` / `222.2 47.4% 11.2%`                     | Ação secundária                                                                                              |
| `muted` / `muted-foreground`             | `--muted` / `--muted-foreground`             | `210 40% 96.1%` / `215.4 16.3% 46.9%`                     | Conteúdo de menor ênfase, estado "inativo/bot"                                                               |
| `accent` / `accent-foreground`           | `--accent` / `--accent-foreground`           | `210 40% 96.1%` / `222.2 47.4% 11.2%`                     | Hover/destaque neutro                                                                                        |
| `destructive` / `destructive-foreground` | `--destructive` / `--destructive-foreground` | `0 84.2% 60.2%` / `210 40% 98%`                           | Erro, ação destrutiva                                                                                        |
| `success` / `success-foreground`         | `--success` / `--success-foreground`         | `142 72% 29%` / `210 40% 98%`                             | Estado saudável/conectado/sucesso                                                                            |
| `warning` / `warning-foreground`         | `--warning` / `--warning-foreground`         | `26 90% 37%` / `210 40% 98%`                              | Atenção / aguardando ação humana                                                                             |
| `border` / `input` / `ring`              | `--border` / `--input` / `--ring`            | `214.3 31.8% 91.4%` (border/input) / `163 94% 24%` (ring) | Bordas, contorno de campos, anel de foco                                                                     |

**Contrato de significado** (`PRODUCT_PRINCIPLES.md` §2.3 — vale para todo o produto, não só componentes novos):

- **`success`** — saudável / conectado / sucesso.
- **`warning`** — atenção / aguardando ação humana.
- **`destructive`** — erro / desconectado / falha.
- **`muted`** — inativo / bot / informação secundária.

> `success`/`warning` são conversões HSL calculadas manualmente a partir de tons de referência — conferir com ferramenta de contraste (ex. WebAIM) quando os primitivos que os usam forem construídos (Bloco M6C), não são pixel-perfect a mão. O mesmo vale para `primary` (Redesign 2026-08-05) e para todo o bloco `.dark` (§2.3).
>
> **`primary` e `success` são ambos verdes, em matizes DIFERENTES de propósito** (163° vs 142°) — nunca são a mesma cor lado a lado, mas a proximidade reforça a regra do contrato: **cor nunca é o único portador de significado**, sempre acompanhada de ícone ou rótulo (ex.: `ConversationStatusBadge` sempre mostra o texto "Bot respondendo"/"Atendimento humano" junto da cor).

### 2.1 O que NÃO foi redefinido (e por quê)

Tipografia (escala de tamanho), espaçamento e breakpoints **não têm override** em `tailwind.config.js` — já são exatamente os defaults do Tailwind 3, e esses defaults já batiam com `CLAUDE.md` §9 desde a Milestone 0:

| Aspecto          | Valor                                                                       | Fonte                                     |
| ---------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| Tamanho de texto | `text-sm` 0.875rem, `text-base` 1rem, `text-lg` 1.125rem, `text-xl` 1.25rem | Default Tailwind                          |
| Espaçamento      | múltiplos de 0.25rem (4px)                                                  | Default Tailwind                          |
| Breakpoints      | `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px                            | Default Tailwind                          |
| Sombra           | `shadow-sm`, `shadow`, `shadow-md`, `shadow-lg`                             | Default Tailwind, já em uso desde a M2/M4 |

Redefinir isso no config seria duplicar valor sem ganho (YAGNI) — registrado aqui para não parecer esquecimento.

### 2.2 Border radius

Baseado em uma única variável, `--radius: 0.5rem` (8px):

| Token        | Cálculo                     | Valor |
| ------------ | --------------------------- | ----- |
| `rounded-lg` | `var(--radius)`             | 8px   |
| `rounded-md` | `calc(var(--radius) - 2px)` | 6px   |
| `rounded-sm` | `calc(var(--radius) - 4px)` | 4px   |

### 2.3 Dark mode (Redesign 2026-08-05 — reverte a ADR #65)

`darkMode: ['class']` já estava configurado em `tailwind.config.js` desde a fundação do M6A (preparação deliberada, nunca usada até agora). O bloco `.dark` em `globals.css` redefine TODAS as variáveis do §2 — nenhum componente referencia cor fora de `:root`/`.dark`, então nenhum componente precisou mudar para ganhar suporte a tema escuro. Duas cores mudam de MATIZ (não só de luminosidade) no escuro, porque precisam de texto escuro em cima em vez de branco:

| Token     | Claro                                | Escuro                                                                | Por quê                                                      |
| --------- | ------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `primary` | `163 94% 24%` (escuro, texto branco) | `160 84% 39%` (mais claro/saturado, texto escuro `222.2 47.4% 11.2%`) | Fundo sólido claro precisa de texto escuro para contraste AA |
| `success` | `142 72% 29%`                        | `142 70% 45%` (texto escuro)                                          | Mesmo motivo                                                 |
| `warning` | `26 90% 37%`                         | `32 95% 55%` (texto escuro)                                           | Mesmo motivo                                                 |

**Ativação** (sem `next-themes` — mesmo racional de preferir solução nativa já usado no projeto):

- Script inline síncrono em `pages/_document.tsx`, ANTES de `<Main/>` — lê `localStorage['francis-theme']` (ou `prefers-color-scheme` do sistema, se nunca escolhido) e aplica `.dark` em `<html>` no mesmo tick do 1º paint, sem flash de tema claro.
- `components/ThemeToggle.tsx` — botão (ícone Sun/Moon) que alterna a classe e persiste a escolha na mesma chave de `localStorage`.

**Cores cruas migradas para token, pré-requisito do dark mode** (nenhuma tinha contraparte em `.dark`): `MessageBubble`, `AiInteractionPanel`, `AiInteractionRow`, `ConversationListItem` (badge do estágio `contacted`), `lib/formatters.ts` (`statusBadgeClassName`, `conversationStatusBadgeClassName`, `aiInteractionStatusBadgeClassName`), `components/brand/LoginChatPreview.tsx`.

---

## 3. Tipografia

Família única: **Inter** (`next/font/google`, self-hosted, `display: swap`), exposta como `--font-inter` e consumida por `fontFamily.sans` no Tailwind — `font-sans` (já o padrão de `body`) usa Inter automaticamente, com fallback para a pilha sans-serif padrão do sistema caso a fonte falhe ao carregar.

---

## 4. Ícones

**lucide-react** é a única biblioteca de ícones permitida no produto (`PRODUCT_PRINCIPLES.md` §2.5). Regras:

- Ícone acompanha rótulo quando o significado não é universal (fechar, buscar e afins podem ficar sozinhos).
- Ícone nunca é só decoração — reforça significado.
- Nenhum SVG customizado solto fora da biblioteca sem justificativa (ex.: o logo da marca é a exceção natural).

---

## 5. Movimento (Framer Motion)

A partir do Bloco M6H. Regras fixas (`PRODUCT_PRINCIPLES.md` §5):

- Só para feedback (hover, item entrando em lista, toast) — nunca transição de página inteira.
- Durações curtas; respeitar `prefers-reduced-motion`.
- Se a animação não comunica nada, ela não deveria existir.

---

## 6. Estrutura de componentes

```
apps/dashboard/
├─ components/
│  ├─ ui/                    ← primitivos shadcn/ui ("burros", sem lógica de negócio)
│  │  ├─ button.tsx          ← M6A-5, prova de pipeline
│  │  ├─ input.tsx, card.tsx, badge.tsx        ← M6C-1 (sem Radix)
│  │  ├─ select.tsx, dialog.tsx                ← M6C-2 (Radix Select/Dialog)
│  │  ├─ toast.tsx, use-toast.ts, toaster.tsx  ← M6C-3 (Radix Toast, `<Toaster/>` montado em `_app.tsx`)
│  │  ├─ table.tsx           ← M6C-3 (sem Radix, semântico)
│  │  └─ skeleton.tsx        ← M6D-1 (sem forma própria — className define o formato)
│  ├─ brand/                 ← marca (Bloco M6B): FrancisLogo, FrancisWordmark (SVG)
│  ├─ states/                ← convenções de UX do produto (Bloco M6D-2): EmptyState, ErrorState
│  └─ *.tsx                  ← componentes de DOMÍNIO (compõem os primitivos de ui/)
├─ lib/
│  ├─ utils.ts                ← cn() — helper de classe (clsx + tailwind-merge)
│  └─ brand.ts                ← fonte única da marca (nome/tagline/assistantName + pageTitle)
├─ styles/globals.css         ← CSS variables do tema (única fonte de valor de cor)
├─ tailwind.config.js         ← mapeia as CSS variables para classes utilitárias
└─ components.json            ← config do shadcn/ui (style, aliases, baseColor)
```

**Regra de fronteira:** `components/ui/*` nunca importa `lib/clientApi.ts`, nunca sabe o que é uma `Conversation` ou um `Tenant`. Componentes de domínio (`components/*.tsx`) é que compõem os primitivos — mesma disciplina de Clean Architecture do backend, aplicada à UI (ver ADR #62 e `PRODUCT_PRINCIPLES.md` §9).

### 6.1 Convenção de variantes (cva)

Todo primitivo com variações visuais usa `cva()` para declarar `variant`/`size` como union types verificados pelo TypeScript — nunca uma prop `color`/`type` livre de string. Ver `components/ui/button.tsx` como referência: variantes `default`/`destructive`/`outline`/`secondary`/`ghost`/`link`; tamanhos `default`/`sm`/`lg`/`icon`.

### 6.2 `cn()` — mesclando classes

Todo componente que aceita `className` como prop deve mesclá-lo com `cn(classesInternas, className)` (nunca concatenação de string crua) — `tailwind-merge` resolve conflitos entre utilitários do mesmo grupo automaticamente (ex.: `cn('p-2', 'p-4')` → só `p-4` sobrevive).

### 6.3 Catálogo de primitivos (`components/ui/`)

| Primitivo                                            | Radix por trás                     | Observação                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                             | `@radix-ui/react-slot` (`asChild`) | M6A-5, variantes `default`/`destructive`/`outline`/`secondary`/`ghost`/`link`                                                                                                                                                                                                                                                                                                           |
| `Input`                                              | —                                  | M6C-1, HTML nativo estilizado                                                                                                                                                                                                                                                                                                                                                           |
| `Card` (+ Header/Title/Description/Content/Footer)   | —                                  | M6C-1, compound component                                                                                                                                                                                                                                                                                                                                                               |
| `Badge`                                              | —                                  | M6C-1, variantes `default`/`secondary`/`destructive`/`success`/`warning`/`outline` — `success`/`warning` mapeiam o contrato de cor de `PRODUCT_PRINCIPLES.md` §2.3. Já consumido por `StatusBadge`/`ConversationStatusBadge`/`AiInteractionStatusBadge` (M6C-4, via `variant="outline"` + `className` da cor resolvida em `lib/formatters.ts` — dedup de estrutura, não de tipo/lógica) |
| `Select`                                             | `@radix-ui/react-select`           | M6C-2                                                                                                                                                                                                                                                                                                                                                                                   |
| `Dialog` (Modal)                                     | `@radix-ui/react-dialog`           | M6C-2                                                                                                                                                                                                                                                                                                                                                                                   |
| `Toast` + `useToast` + `Toaster`                     | `@radix-ui/react-toast`            | M6C-3. `<Toaster/>` montado uma vez em `_app.tsx`; `toast(...)` chamável de qualquer lugar (store de módulo, não precisa estar dentro de um componente)                                                                                                                                                                                                                                 |
| `Table` (+ Header/Body/Row/Head/Cell/Caption/Footer) | —                                  | M6C-3, HTML semântico                                                                                                                                                                                                                                                                                                                                                                   |
| `Skeleton`                                           | —                                  | M6D-1, sem forma própria (`className` define o formato)                                                                                                                                                                                                                                                                                                                                 |

Consumidos pelas telas de Sessões e Conversas a partir do M6E (`Button`, `Card`, `Dialog`, `Toast`, `Badge` — este último desde o M6C-4). `Select`/`Table` seguem sem consumidor ainda (nenhuma tela de domínio precisou até aqui).

### 6.4 Componentes de estado (`components/states/`)

| Componente   | Implementa     | Observação                                                                                                                                                      |
| ------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmptyState` | estado "Vazio" | ícone (lucide, opcional) + título + descrição + ação opcional (`Button`). Tom de convite ("Nenhuma sessão ainda" + CTA), nunca de pedido de desculpas           |
| `ErrorState` | estado "Erro"  | mesma estrutura, tom destrutivo (`AlertCircle`) + botão "Tentar de novo" opcional (`onRetry`) — alimentado pelos `refresh()` já expostos pelos hooks existentes |

Distintos de `components/ui/`: não são primitivos genéricos, são convenções de UX do produto (referenciam `PRODUCT_PRINCIPLES.md`). Em uso desde o M6E: `EmptyState` (sessões/conversas vazias) e `ErrorState` (sessão/conversa/mensagens que falharam ao carregar, com retry).

---

## 7. Contrato de estados (obrigatório em componentes de listagem)

Regra de `PRODUCT_PRINCIPLES.md` §3 / ADR #64 — repetida aqui por ser a peça mais operacional do sistema:

| Estado     | Regra                                                                                            | Peça que implementa               |
| ---------- | ------------------------------------------------------------------------------------------------ | --------------------------------- |
| Carregando | Skeleton com o formato do conteúdo real; nunca reaparece em atualizações de polling              | `Skeleton` (M6D-1)                |
| Vazio      | Mensagem + explicação + CTA quando aplicável; nunca tela em branco                               | `EmptyState` (M6D-2)              |
| Erro       | Linguagem humana + ação de tentar de novo; nunca apaga conteúdo já exibido por falha transitória | `ErrorState` (M6D-2)              |
| Conteúdo   | O dado, hierarquizado                                                                            | componentes de domínio existentes |

As 4 peças existem e funcionam (M6A–M6D). Aplicadas às telas de Sessões e Conversas no M6E (`pages/index.tsx`, `pages/sessions/[sessionName].tsx`, `pages/conversations/index.tsx`, `pages/conversations/[conversationId].tsx`, `MessageTimeline`) — as demais telas (`analytics.tsx`, `users.tsx`, `ai-profile.tsx`) seguem com o padrão antigo (`<p>Carregando…</p>`), retrofit incremental em blocos futuros.

---

## 8. O que ainda não existe (roadmap desta base)

| Item                                                                                                                                                                            | Chega em                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Identidade de marca v1 (logo/wordmark SVG, `<title>` por página)                                                                                                                | ✅ M6B (ver `BRAND.md`)                                         |
| Favicon / apple-touch-icon / PNGs de ícone                                                                                                                                      | Adiado (bloco futuro do M6) — marca v1 iterável, só SVG por ora |
| Biblioteca de primitivos (Input, Select, Card, Badge, Modal, Toast, Table)                                                                                                      | ✅ M6C (ver §6.3)                                               |
| `Skeleton` / `EmptyState` / `ErrorState` (contrato de estados)                                                                                                                  | ✅ M6D (ver §6.4/§7)                                            |
| Retrofit prioritário: conexão WhatsApp (Sessões) + inbox de Conversas                                                                                                           | ✅ M6E (ver ADR #70)                                            |
| Retrofit das demais telas (Analytics, Usuários, Cérebro da IA, Login) + responsividade mobile dedicada (caminho assumir→responder)                                              | M6F em diante                                                   |
| Dark mode                                                                                                                                                                       | ✅ Redesign 2026-08-05 (reverte a ADR #65 — ver §2.3)           |
| Paleta de marca verde (era azul `#0A74DA`) + reorganização da navegação (rail de ícones, agrupamento em Conversas/Pipeline/Analytics/IA/Configurações) + Conversas em 3 colunas | Redesign 2026-08-05, em andamento                               |

---

## 9. Referências

- `PRODUCT_PRINCIPLES.md` — regras de experiência (o porquê).
- `USER_JOURNEY.md` — jornada do usuário (o quando/onde).
- `BRAND.md` — identidade de marca v1 (nome, tagline, personalidade, símbolo).
- `DECISIONS.md` ADRs #61–#70 — decisões arquiteturais da Milestone 6 (#67 = marca v1, #70 = retrofit prioritário M6E).
- `CLAUDE.md` §9 — registro histórico original (superado por este documento a partir da M6).

---

_Este documento é atualizado a cada bloco da Milestone 6 que adicionar ou mudar tokens/componentes/convenções._
