# Reskin de Fidelidade — Tela de Conversa (referência WhatsApp Web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar a tela de conversa aberta do dashboard para reproduzir fielmente a linguagem visual do WhatsApp Web (bolhas, horário dentro da bolha, ticks de status, divisor de data, áudio com waveform, documento, composer em pill), sem alterar nenhuma funcionalidade, contrato de API/BFF ou outra tela.

**Architecture:** Todos os componentes já existem (`MessageBubble`, `MessageTimeline`, `MessageAudioPlayer`, `MessageComposer`, `ConversationDetailPanel`) e são **refatorados, não recriados**. Introduz-se uma família de tokens CSS `--chat-*` (isolada dos tokens do Design System, que continuam intactos para o resto do app) e três componentes novos e pequenos: `MessageStatus`, `MessageMeta` e `DateSeparator`. A direção da mensagem (`message.direction`) continua sendo a única fonte de alinhamento/cor — nunca se duplica lógica entre inbound e outbound.

**Tech Stack:** Next.js 13 (Pages Router), React 18, TypeScript, Tailwind CSS 3 (tokens via CSS variables, padrão shadcn/ui), lucide-react, Jest + Testing Library (projeto `dashboard-jsdom`).

## Global Constraints

- **Idioma:** código/identificadores em inglês; comentários e documentação em português (pt-BR); textos de UI em pt-BR.
- **Zero mudança em `apps/api`.** Nenhuma migration, nenhum endpoint, nenhum contrato de dados novo.
- **Zero dependência nova.** Nada de `npm install` — a waveform, o autosize da textarea e o toggle de ícones são implementados com o que já existe.
- **Nenhum dado inventado.** Documento exibe só extensão real (derivada do MIME/nome); **não** exibe tamanho nem número de páginas (a API não guarda esses dados). Ticks sempre `'sent'` — o backend não conhece entrega/leitura.
- **Sem toggle mic↔enviar.** Decisão explícita do fundador: botão **Enviar fixo**, sem botão de microfone e sem botão de emoji.
- **Estética plana.** Sem gradiente, sem glassmorphism, sem sombra forte, sem animação nova. Única sombra permitida nas bolhas: `0 1px 0.5px rgba(11,20,26,0.13)`.
- **Testes:** rodar sempre a partir da raiz do repositório. Comando de suíte jsdom: `npx jest --selectProjects dashboard-jsdom`. Comando da suíte node do dashboard: `npx jest --selectProjects dashboard`.
- **Lint:** `npm run lint -w apps/dashboard` (usa `cross-env ESLINT_USE_FLAT_CONFIG=false`). **Typecheck:** `npm run typecheck -w apps/dashboard`.
- **Commits:** Conventional Commits em inglês, uma linha de assunto + corpo opcional em português.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `apps/dashboard/styles/globals.css` | tokens `--chat-*` + utility `.chat-bubble-shadow` | Modificar |
| `apps/dashboard/tailwind.config.js` | expõe os tokens como classes `bg-chat-*`/`text-chat-meta` | Modificar |
| `apps/dashboard/lib/formatters.ts` | `formatMessageTime` (HH:MM) | Modificar |
| `apps/dashboard/components/MessageStatus.tsx` | ícone de status de entrega (4 estados) | **Criar** |
| `apps/dashboard/components/MessageMeta.tsx` | grupo `horário + status`, 2 variantes (normal / overlay sobre mídia) | **Criar** |
| `apps/dashboard/components/DateSeparator.tsx` | pill central de data | **Criar** |
| `apps/dashboard/components/MessageTimeline.tsx` | usa `DateSeparator`; calcula agrupamento de espaçamento | Modificar |
| `apps/dashboard/components/MessageBubble.tsx` | bolha: cores `--chat-*`, meta dentro, selo de IA acima, meta em overlay sobre mídia, extensão do documento | Modificar |
| `apps/dashboard/components/MessageAudioPlayer.tsx` | play/pause + waveform em barras + duração | Modificar |
| `apps/dashboard/components/MessageComposer.tsx` | casca em pill, textarea autosize, Enviar fixo | Modificar |
| `apps/dashboard/components/ConversationDetailPanel.tsx` | densidade/padding da área de mensagens | Modificar |

Testes correspondentes em `apps/dashboard/tests-jsdom/components/` (jsdom) e `apps/dashboard/tests/lib/formatters.test.ts` (node).

---

### Task 1: Tokens de chat, sombra da bolha e `formatMessageTime`

Fundação puramente de estilo + uma função pura. Nenhum componente muda de aparência ainda (nada consome os tokens até a Task 4).

**Files:**
- Modify: `apps/dashboard/styles/globals.css`
- Modify: `apps/dashboard/tailwind.config.js`
- Modify: `apps/dashboard/lib/formatters.ts`
- Test: `apps/dashboard/tests/lib/formatters.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `formatMessageTime(iso: string | undefined): string` — exportada de `@/lib/formatters`, devolve `"HH:MM"` em pt-BR ou `'—'` para entrada inválida/ausente.
  - Classes Tailwind: `bg-chat-bubble-in`, `text-chat-bubble-in-foreground`, `bg-chat-bubble-out`, `text-chat-bubble-out-foreground`, `text-chat-meta`, `bg-chat-divider`.
  - Classe CSS global: `.chat-bubble-shadow`.

- [ ] **Step 1: Escrever o teste que falha (`formatMessageTime`)**

Adicionar ao final de `apps/dashboard/tests/lib/formatters.test.ts` (o arquivo já existe e já importa de `../../lib/formatters` — acrescentar `formatMessageTime` à lista de imports do topo do arquivo):

```ts
describe('formatMessageTime (reskin 2026-08-27 — horário dentro da bolha)', () => {
  it('devolve apenas hora e minuto, sem data e sem segundos', () => {
    // 2026-07-24T12:31:00Z. O teste roda no fuso da máquina, então a asserção
    // é sobre o FORMATO (HH:MM), não sobre o valor absoluto da hora.
    expect(formatMessageTime('2026-07-24T12:31:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('devolve "—" para entrada ausente', () => {
    expect(formatMessageTime(undefined)).toBe('—');
  });

  it('devolve "—" para string inválida', () => {
    expect(formatMessageTime('não é uma data')).toBe('—');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest --selectProjects dashboard -t "formatMessageTime"`
Expected: FAIL — `formatMessageTime is not a function` / erro de compilação por export inexistente.

- [ ] **Step 3: Implementar `formatMessageTime`**

Em `apps/dashboard/lib/formatters.ts`, logo abaixo da função `formatDateTime`, acrescentar:

```ts
/**
 * Reskin 2026-08-27 — horário exibido DENTRO da bolha de mensagem, no padrão
 * WhatsApp: só `HH:MM`. Distinto de `formatDateTime` (que devolve
 * `DD/MM/AAAA HH:MM:SS`, longo demais para caber no canto de uma bolha e
 * fora do padrão da referência visual). Mesmo contrato de degradação:
 * `'—'` para entrada ausente/inválida.
 */
export function formatMessageTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest --selectProjects dashboard -t "formatMessageTime"`
Expected: PASS — 3 testes verdes.

- [ ] **Step 5: Adicionar os tokens `--chat-*` ao tema claro**

Em `apps/dashboard/styles/globals.css`, dentro do bloco `:root { ... }` (`@layer base`), logo antes da chave de fechamento (após a linha `--destructive-emphasis: 5 55% 37%;`), acrescentar:

```css
    /*
     * Reskin 2026-08-27 — família de tokens EXCLUSIVA da tela de conversa
     * (referência visual: WhatsApp Web). Deliberadamente separada dos tokens
     * do Design System: a bolha enviada do WhatsApp é verde-CLARO com texto
     * escuro, enquanto `--primary` do produto é verde-escuro com texto
     * branco. Reaproveitar `--primary` aqui obrigaria a escolher entre
     * fidelidade à referência e consistência do resto do app — tokens
     * próprios resolvem os dois (decisão registrada na spec de 2026-08-27).
     * Nenhuma outra tela usa `--chat-*`.
     */
    --chat-bubble-in: 0 0% 100%;              /* #FFFFFF — bolha recebida */
    --chat-bubble-in-foreground: 153 20% 11%; /* mesmo texto primário do app */
    --chat-bubble-out: 111 91% 91%;           /* #D9FDD3 — bolha enviada (WhatsApp) */
    --chat-bubble-out-foreground: 153 20% 11%;
    --chat-meta: 202 12% 45%;                 /* #667781 — horário/ticks dentro da bolha */
    --chat-divider: 0 0% 100%;                /* pill de data ("Hoje"/"domingo") */
```

- [ ] **Step 6: Adicionar os tokens `--chat-*` ao tema escuro**

No mesmo arquivo, dentro do bloco `.dark { ... }`, logo antes da chave de fechamento (após a linha `--destructive-emphasis: 3 55% 62%;`), acrescentar:

```css
    /*
     * Reskin 2026-08-27 — variante escura dos tokens de chat, calibrada pelo
     * WhatsApp Web escuro: bolha recebida em superfície elevada sobre
     * `--panel`, bolha enviada no teal escuro (#005C4B) com texto claro —
     * inversão deliberada do tema claro (lá o texto da bolha enviada é
     * escuro), exatamente como a referência faz.
     */
    --chat-bubble-in: 222 20% 13%;
    --chat-bubble-in-foreground: 210 40% 98%;
    --chat-bubble-out: 169 100% 18%;          /* #005C4B */
    --chat-bubble-out-foreground: 210 40% 98%;
    --chat-meta: 202 10% 65%;
    --chat-divider: 203 24% 15%;              /* #1D282F */
```

- [ ] **Step 7: Adicionar a utility `.chat-bubble-shadow`**

No mesmo arquivo, logo após o bloco `.chat-wallpaper` / `.dark .chat-wallpaper` (por volta da linha 222), acrescentar:

```css
/*
 * Reskin 2026-08-27 — sombra da bolha de mensagem. Valor copiado da
 * referência (WhatsApp Web): quase imperceptível, serve só para descolar a
 * bolha do papel de parede. Não usa a escala `shadow-*` do Tailwind de
 * propósito — a menor delas (`shadow-sm`) já é forte demais e destoaria da
 * estética plana da referência (Design System §4: sombra só para o que
 * flutua de verdade).
 */
.chat-bubble-shadow {
  box-shadow: 0 1px 0.5px rgba(11, 20, 26, 0.13);
}
.dark .chat-bubble-shadow {
  box-shadow: 0 1px 0.5px rgba(0, 0, 0, 0.2);
}
```

- [ ] **Step 8: Expor os tokens no Tailwind**

Em `apps/dashboard/tailwind.config.js`, dentro de `theme.extend.colors`, logo após o bloco `destructive: { ... }` (antes do fechamento de `colors`), acrescentar:

```js
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
```

- [ ] **Step 9: Verificar typecheck e lint**

Run: `npm run typecheck -w apps/dashboard && npm run lint -w apps/dashboard`
Expected: ambos sem erro.

- [ ] **Step 10: Commit**

```bash
git add apps/dashboard/styles/globals.css apps/dashboard/tailwind.config.js apps/dashboard/lib/formatters.ts apps/dashboard/tests/lib/formatters.test.ts
git commit -m "feat(dashboard): add chat design tokens and formatMessageTime

Tokens --chat-* exclusivos da tela de conversa (bolha recebida branca,
enviada verde-claro, meta cinza), utility .chat-bubble-shadow e o
formatador HH:MM que a bolha vai usar. Nenhum componente consome ainda.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `MessageStatus` e `MessageMeta`

Dois componentes pequenos e puros que a bolha vai compor. `MessageStatus` nasce com os 4 estados visuais; `MessageBubble` alimentará sempre `'sent'` (Task 4).

**Files:**
- Create: `apps/dashboard/components/MessageStatus.tsx`
- Create: `apps/dashboard/components/MessageMeta.tsx`
- Test: `apps/dashboard/tests-jsdom/components/MessageStatus.test.tsx`
- Test: `apps/dashboard/tests-jsdom/components/MessageMeta.test.tsx`

**Interfaces:**
- Consumes: `formatMessageTime` de `@/lib/formatters` (Task 1); `cn` de `@/lib/utils`.
- Produces:
  - `export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read';`
  - `export default function MessageStatus({ status, className }: { status: MessageDeliveryStatus; className?: string }): JSX.Element`
  - `export default function MessageMeta({ occurredAt, status, overlay, className }: { occurredAt: string; status?: MessageDeliveryStatus; overlay?: boolean; className?: string }): JSX.Element`

- [ ] **Step 1: Escrever o teste que falha (`MessageStatus`)**

Criar `apps/dashboard/tests-jsdom/components/MessageStatus.test.tsx`:

```tsx
/**
 * Reskin 2026-08-27 — indicador de entrega dentro da bolha enviada.
 * O componente nasce com os 4 estados visuais da referência (WhatsApp);
 * hoje o backend só conhece "enviado" e `MessageBubble` sempre passa
 * `'sent'` — ver comentário no próprio componente.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageStatus from '../../components/MessageStatus';

describe('MessageStatus', () => {
  it('estado "sending": rótulo acessível "Enviando"', () => {
    render(<MessageStatus status="sending" />);
    expect(screen.getByLabelText('Enviando')).toBeInTheDocument();
  });

  it('estado "sent": rótulo acessível "Enviado"', () => {
    render(<MessageStatus status="sent" />);
    expect(screen.getByLabelText('Enviado')).toBeInTheDocument();
  });

  it('estado "delivered": rótulo acessível "Entregue"', () => {
    render(<MessageStatus status="delivered" />);
    expect(screen.getByLabelText('Entregue')).toBeInTheDocument();
  });

  it('estado "read": rótulo acessível "Lido" e cor azul da referência', () => {
    const { container } = render(<MessageStatus status="read" />);
    expect(screen.getByLabelText('Lido')).toBeInTheDocument();
    expect(container.querySelector('.text-\\[\\#53bdeb\\]')).toBeInTheDocument();
  });

  it('aceita className extra sem perder o rótulo', () => {
    const { container } = render(<MessageStatus status="sent" className="ml-1" />);
    expect(container.querySelector('.ml-1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest --selectProjects dashboard-jsdom MessageStatus`
Expected: FAIL — `Cannot find module '../../components/MessageStatus'`.

- [ ] **Step 3: Implementar `MessageStatus`**

Criar `apps/dashboard/components/MessageStatus.tsx`:

```tsx
import { Check, CheckCheck, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Estados de entrega de uma mensagem enviada, no vocabulário da referência
 * visual (WhatsApp): relógio → 1 check → 2 checks cinza → 2 checks azuis.
 */
export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read';

const STATUS_LABELS: Record<MessageDeliveryStatus, string> = {
  sending: 'Enviando',
  sent: 'Enviado',
  delivered: 'Entregue',
  read: 'Lido',
};

interface MessageStatusProps {
  status: MessageDeliveryStatus;
  className?: string;
}

/**
 * Reskin 2026-08-27 — indicador de status ao lado do horário, dentro da
 * bolha enviada. Pequeno e discreto por construção (13px): é informação
 * periférica, nunca um controle clicável.
 *
 * IMPORTANTE — o produto hoje só sabe dizer "enviado": `WhatsAppMessage` não
 * guarda confirmação de entrega/leitura do WhatsApp do contato (exigiria
 * `providerMessageId` + assinar `messages.update` no `BaileysProvider`).
 * `MessageBubble` portanto sempre passa `'sent'`. Os outros três estados
 * existem aqui prontos para o dia em que esse dado existir — e ficam num
 * lugar só, para a troca ser de uma linha. Nunca exibir `delivered`/`read`
 * sem dado real por trás: prometeria algo que o produto não cumpre.
 */
export default function MessageStatus({ status, className }: MessageStatusProps): JSX.Element {
  const label = STATUS_LABELS[status];
  const iconClassName = cn('h-[13px] w-[13px] shrink-0', className);

  if (status === 'sending') {
    return <Clock3 className={iconClassName} aria-label={label} />;
  }
  if (status === 'sent') {
    return <Check className={iconClassName} aria-label={label} />;
  }
  if (status === 'delivered') {
    return <CheckCheck className={iconClassName} aria-label={label} />;
  }
  return <CheckCheck className={cn(iconClassName, 'text-[#53bdeb]')} aria-label={label} />;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest --selectProjects dashboard-jsdom MessageStatus`
Expected: PASS — 5 testes verdes.

- [ ] **Step 5: Escrever o teste que falha (`MessageMeta`)**

Criar `apps/dashboard/tests-jsdom/components/MessageMeta.test.tsx`:

```tsx
/**
 * Reskin 2026-08-27 — grupo "horário + status" que vive DENTRO da bolha
 * (variante normal) ou como chip sobre a mídia (variante overlay).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageMeta from '../../components/MessageMeta';

describe('MessageMeta', () => {
  it('renderiza o horário no formato HH:MM', () => {
    render(<MessageMeta occurredAt="2026-07-24T12:31:00.000Z" />);
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('sem status: não renderiza nenhum indicador de entrega', () => {
    render(<MessageMeta occurredAt="2026-07-24T12:31:00.000Z" />);
    expect(screen.queryByLabelText('Enviado')).not.toBeInTheDocument();
  });

  it('com status: renderiza o indicador de entrega ao lado do horário', () => {
    render(<MessageMeta occurredAt="2026-07-24T12:31:00.000Z" status="sent" />);
    expect(screen.getByLabelText('Enviado')).toBeInTheDocument();
  });

  it('variante overlay: aplica o chip escuro translúcido usado sobre mídia', () => {
    const { container } = render(<MessageMeta occurredAt="2026-07-24T12:31:00.000Z" overlay />);
    expect(container.querySelector('.bg-black\\/45')).toBeInTheDocument();
  });

  it('variante normal: usa a cor de meta do chat, não o chip de overlay', () => {
    const { container } = render(<MessageMeta occurredAt="2026-07-24T12:31:00.000Z" />);
    expect(container.querySelector('.text-chat-meta')).toBeInTheDocument();
    expect(container.querySelector('.bg-black\\/45')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `npx jest --selectProjects dashboard-jsdom MessageMeta`
Expected: FAIL — `Cannot find module '../../components/MessageMeta'`.

- [ ] **Step 7: Implementar `MessageMeta`**

Criar `apps/dashboard/components/MessageMeta.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { formatMessageTime } from '@/lib/formatters';
import MessageStatus, { type MessageDeliveryStatus } from './MessageStatus';

interface MessageMetaProps {
  occurredAt: string;
  /** Ausente em mensagens recebidas (não existe status de entrega para o que o contato mandou). */
  status?: MessageDeliveryStatus;
  /** `true` quando desenhado SOBRE uma mídia (imagem/vídeo), onde a cor de fundo é imprevisível. */
  overlay?: boolean;
  className?: string;
}

/**
 * Reskin 2026-08-27 — horário (+ status, quando enviada) no canto inferior
 * direito da mensagem, exatamente como na referência: NUNCA um elemento
 * solto abaixo da bolha, e sempre ocupando o mínimo de espaço possível.
 *
 * Duas variantes, porque o fundo por trás muda:
 * - normal: sobre a cor da própria bolha → texto em `--chat-meta`;
 * - `overlay`: sobre uma foto/vídeo (cor arbitrária) → chip preto
 *   translúcido com texto branco, mesma solução da referência.
 *
 * O posicionamento em si (absoluto no canto, ou inline numa linha) é
 * responsabilidade de quem usa, via `className` — este componente só
 * decide a APARÊNCIA do grupo, mantendo-a idêntica nos quatro lugares onde
 * aparece (texto, mídia, áudio, documento).
 */
export default function MessageMeta({
  occurredAt,
  status,
  overlay = false,
  className,
}: MessageMetaProps): JSX.Element {
  return (
    <span
      className={cn(
        'pointer-events-none flex select-none items-center gap-[3px] whitespace-nowrap text-[11px] leading-none tabular-nums',
        overlay ? 'rounded-full bg-black/45 px-1.5 py-[3px] text-white' : 'text-chat-meta',
        className,
      )}
    >
      {formatMessageTime(occurredAt)}
      {status && <MessageStatus status={status} />}
    </span>
  );
}
```

- [ ] **Step 8: Rodar os dois testes e confirmar que passam**

Run: `npx jest --selectProjects dashboard-jsdom MessageStatus MessageMeta`
Expected: PASS — 10 testes verdes no total.

- [ ] **Step 9: Verificar typecheck e lint**

Run: `npm run typecheck -w apps/dashboard && npm run lint -w apps/dashboard`
Expected: ambos sem erro.

- [ ] **Step 10: Commit**

```bash
git add apps/dashboard/components/MessageStatus.tsx apps/dashboard/components/MessageMeta.tsx apps/dashboard/tests-jsdom/components/MessageStatus.test.tsx apps/dashboard/tests-jsdom/components/MessageMeta.test.tsx
git commit -m "feat(dashboard): add MessageStatus and MessageMeta components

MessageStatus com os 4 estados visuais da referencia (sending/sent/
delivered/read); MessageBubble alimentara sempre 'sent' porque o backend
so conhece esse. MessageMeta agrupa horario+status em duas variantes
(sobre a bolha e sobre midia). Nenhum consumidor ainda.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `DateSeparator` e espaçamento da timeline

Extrai a pill de data (hoje é markup inline dentro de `MessageTimeline`) e ajusta a densidade vertical: mensagens consecutivas do mesmo lado ficam coladas; troca de lado abre respiro — como na referência.

**Files:**
- Create: `apps/dashboard/components/DateSeparator.tsx`
- Modify: `apps/dashboard/components/MessageTimeline.tsx`
- Test: `apps/dashboard/tests-jsdom/components/DateSeparator.test.tsx`
- Test: `apps/dashboard/tests-jsdom/components/MessageTimeline.test.tsx` (existente — acrescentar casos)

**Interfaces:**
- Consumes: `formatDayDivider` e `isSameCalendarDay` de `@/lib/formatters` (já existem, sem mudança); tokens `bg-chat-divider`, `text-chat-meta` e `.chat-bubble-shadow` (Task 1).
- Produces:
  - `export default function DateSeparator({ occurredAt }: { occurredAt: string }): JSX.Element`
  - `MessageBubble` passa a aceitar a prop opcional `spacedFromPrevious?: boolean` (implementada na Task 4; nesta task `MessageTimeline` já a envia — TypeScript aceita props extras apenas se declaradas, então **a Task 4 é obrigatória para o typecheck fechar**; por isso o passo de typecheck desta task só cobre `DateSeparator`, e a verificação completa acontece na Task 4).

> **Ordem de execução:** para evitar um estado intermediário que não compila, esta task adiciona a prop `spacedFromPrevious` na interface de `MessageBubble` (só a declaração e o uso na classe do `<li>`), e a Task 4 refatora o resto do componente. É uma edição de 3 linhas em `MessageBubble.tsx`, descrita nos passos abaixo.

- [ ] **Step 1: Escrever o teste que falha (`DateSeparator`)**

Criar `apps/dashboard/tests-jsdom/components/DateSeparator.test.tsx`:

```tsx
/**
 * Reskin 2026-08-27 — pill central de data ("Hoje"/"Ontem"/data curta),
 * extraída do markup inline de `MessageTimeline` para virar componente
 * próprio, com a aparência da referência (cápsula clara e centralizada).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DateSeparator from '../../components/DateSeparator';

describe('DateSeparator', () => {
  it('mostra "Hoje" para a data de hoje', () => {
    render(<DateSeparator occurredAt={new Date().toISOString()} />);
    expect(screen.getByText('Hoje')).toBeInTheDocument();
  });

  it('mostra a data curta para uma data antiga', () => {
    render(<DateSeparator occurredAt="2020-03-15T10:00:00.000Z" />);
    expect(screen.getByText(/15\/03\/2020/)).toBeInTheDocument();
  });

  it('é centralizado horizontalmente e tem formato de cápsula', () => {
    const { container } = render(<DateSeparator occurredAt={new Date().toISOString()} />);
    const item = container.querySelector('li');
    expect(item).toHaveClass('justify-center');
    expect(container.querySelector('.rounded-lg')).toBeInTheDocument();
  });

  it('data inválida: não renderiza pill vazia', () => {
    const { container } = render(<DateSeparator occurredAt="não é data" />);
    expect(container.querySelector('li')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest --selectProjects dashboard-jsdom DateSeparator`
Expected: FAIL — `Cannot find module '../../components/DateSeparator'`.

- [ ] **Step 3: Implementar `DateSeparator`**

Criar `apps/dashboard/components/DateSeparator.tsx`:

```tsx
import { formatDayDivider } from '@/lib/formatters';

interface DateSeparatorProps {
  occurredAt: string;
}

/**
 * Reskin 2026-08-27 — divisor de dia da timeline, extraído do markup inline
 * que vivia dentro de `MessageTimeline`. Cápsula pequena e centralizada,
 * sobre o papel de parede (mesmo fundo e mesma sombra sutil das bolhas, como
 * na referência) — nunca uma faixa de largura total.
 *
 * `formatDayDivider` devolve `''` para data inválida; nesse caso este
 * componente não desenha nada (degradação graciosa, mesma decisão que já
 * existia antes da extração).
 */
export default function DateSeparator({ occurredAt }: DateSeparatorProps): JSX.Element | null {
  const label = formatDayDivider(occurredAt);
  if (!label) return null;

  return (
    <li className="flex justify-center py-3" aria-hidden="true">
      <span className="chat-bubble-shadow rounded-lg bg-chat-divider px-3 py-[5px] text-[12.5px] font-medium text-chat-meta">
        {label}
      </span>
    </li>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest --selectProjects dashboard-jsdom DateSeparator`
Expected: PASS — 4 testes verdes.

- [ ] **Step 5: Declarar `spacedFromPrevious` em `MessageBubble`**

Em `apps/dashboard/components/MessageBubble.tsx`, na interface `MessageBubbleProps` (linhas 8-12), acrescentar a prop:

```tsx
interface MessageBubbleProps {
  message: ConversationMessage;
  /** Interacao de IA que GEROU esta mensagem (correlacao por `messageId`, D27) — presente so em outbound geradas pela IA. */
  aiInteraction?: AiInteractionSummary;
  /**
   * Reskin 2026-08-27 — `true` quando a mensagem anterior veio do OUTRO
   * lado da conversa (ou não existe). Abre respiro vertical entre grupos,
   * mantendo mensagens consecutivas do mesmo lado coladas — padrão da
   * referência. Default `true` (comportamento espaçado) para quem renderiza
   * uma bolha isolada, sem contexto de lista.
   */
  spacedFromPrevious?: boolean;
}
```

Na assinatura da função (linha 120), trocar:

```tsx
export default function MessageBubble({ message, aiInteraction }: MessageBubbleProps): JSX.Element {
```

por:

```tsx
export default function MessageBubble({
  message,
  aiInteraction,
  spacedFromPrevious = true,
}: MessageBubbleProps): JSX.Element {
```

E na classe do `<li>` (linha 126), trocar:

```tsx
    <li className={cn('flex flex-col', outbound ? 'items-end' : 'items-start')}>
```

por:

```tsx
    <li
      className={cn(
        'flex flex-col',
        spacedFromPrevious ? 'mt-[10px]' : 'mt-[2px]',
        outbound ? 'items-end' : 'items-start',
      )}
    >
```

- [ ] **Step 6: Escrever os testes que falham em `MessageTimeline`**

Em `apps/dashboard/tests-jsdom/components/MessageTimeline.test.tsx`, acrescentar antes do fechamento do `describe` externo:

```tsx
  describe('Reskin 2026-08-27 — divisor de data e agrupamento', () => {
    it('insere o divisor de data antes da primeira mensagem', () => {
      render(
        <MessageTimeline
          messages={[buildMessage({ occurredAt: '2020-03-15T10:00:00.000Z' })]}
          interactions={null}
          errorMessage={null}
          onRetry={jest.fn()}
        />,
      );
      expect(screen.getByText(/15\/03\/2020/)).toBeInTheDocument();
    });

    it('não repete o divisor entre mensagens do mesmo dia', () => {
      render(
        <MessageTimeline
          messages={[
            buildMessage({ id: 'm1', occurredAt: '2020-03-15T10:00:00.000Z' }),
            buildMessage({ id: 'm2', occurredAt: '2020-03-15T11:00:00.000Z' }),
          ]}
          interactions={null}
          errorMessage={null}
          onRetry={jest.fn()}
        />,
      );
      expect(screen.getAllByText(/15\/03\/2020/)).toHaveLength(1);
    });

    it('mensagens consecutivas do MESMO lado ficam coladas; troca de lado abre respiro', () => {
      const { container } = render(
        <MessageTimeline
          messages={[
            buildMessage({ id: 'm1', direction: 'inbound' }),
            buildMessage({ id: 'm2', direction: 'inbound' }),
            buildMessage({ id: 'm3', direction: 'outbound' }),
          ]}
          interactions={null}
          errorMessage={null}
          onRetry={jest.fn()}
        />,
      );
      // O primeiro <li> é o divisor de data (aria-hidden); as bolhas vêm depois.
      const bubbles = Array.from(container.querySelectorAll('li')).filter(
        (li) => !li.hasAttribute('aria-hidden'),
      );
      expect(bubbles).toHaveLength(3);
      expect(bubbles[0]).toHaveClass('mt-[10px]'); // primeira do grupo
      expect(bubbles[1]).toHaveClass('mt-[2px]'); // mesma direção da anterior
      expect(bubbles[2]).toHaveClass('mt-[10px]'); // trocou de lado
    });
  });
```

- [ ] **Step 7: Rodar o teste e confirmar que falha**

Run: `npx jest --selectProjects dashboard-jsdom MessageTimeline`
Expected: FAIL — o caso de agrupamento falha (`mt-[2px]` não aplicado; `MessageTimeline` ainda não passa a prop).

- [ ] **Step 8: Reescrever o corpo de `MessageTimeline` para usar `DateSeparator` e calcular o agrupamento**

Em `apps/dashboard/components/MessageTimeline.tsx`:

Trocar o import de formatters (linha 5) por:

```tsx
import { isSameCalendarDay } from '@/lib/formatters';
import DateSeparator from './DateSeparator';
```

Trocar o `return` final (linhas 76-114) por:

```tsx
  return (
    <ul className="flex flex-col">
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const showDivider =
          !previous || !isSameCalendarDay(previous.occurredAt, message.occurredAt);
        // Reskin 2026-08-27 — respiro vertical só quando o "turno" muda
        // (troca de lado, primeira mensagem, ou logo após um divisor de
        // data). Mensagens seguidas do mesmo lado ficam coladas, como na
        // referência.
        const spacedFromPrevious =
          !previous || showDivider || previous.direction !== message.direction;
        return (
          <Fragment key={message.id}>
            {showDivider && <DateSeparator occurredAt={message.occurredAt} />}
            <MessageBubble
              message={message}
              spacedFromPrevious={spacedFromPrevious}
              // CORREÇÃO 2026-08-18: `AiInteraction.messageId` é um campo de
              // DUPLO PROPÓSITO no backend — grava a mensagem INBOUND que
              // originou a geração (Fase 1, F1.4) até o envio outbound ter
              // sucesso, quando `linkMessage()` o REESCREVE para apontar à
              // Message outbound enviada (Bloco 3b/4). Enquanto o envio não
              // é confirmado (ex.: falha de conexão do WhatsApp), o campo
              // ainda aponta para a mensagem INBOUND — sem esta guarda, o
              // selo "Gerada por IA" aparecia por engano numa bolha do
              // PRÓPRIO cliente (achado real: um áudio recebido do cliente
              // marcado como "gerado pela IA"). `Gerada por IA` só faz
              // sentido em mensagens outbound; nunca inferir o contrário.
              aiInteraction={
                message.direction === 'outbound'
                  ? interactionByMessageId.get(message.id)
                  : undefined
              }
            />
          </Fragment>
        );
      })}
    </ul>
  );
```

Também atualizar a docstring do componente, acrescentando ao final (antes do `*/`):

```
 * Reskin 2026-08-27: o divisor virou o componente `DateSeparator` e o
 * espaçamento entre bolhas passou a ser calculado aqui (`spacedFromPrevious`)
 * — o `gap-2` uniforme foi removido: na referência, mensagens seguidas do
 * mesmo lado ficam coladas e só a troca de turno abre respiro.
```

- [ ] **Step 9: Rodar os testes e confirmar que passam**

Run: `npx jest --selectProjects dashboard-jsdom MessageTimeline DateSeparator`
Expected: PASS — todos os casos antigos de `MessageTimeline` + 3 novos + 4 de `DateSeparator`.

- [ ] **Step 10: Verificar typecheck e lint**

Run: `npm run typecheck -w apps/dashboard && npm run lint -w apps/dashboard`
Expected: ambos sem erro.

- [ ] **Step 11: Commit**

```bash
git add apps/dashboard/components/DateSeparator.tsx apps/dashboard/components/MessageTimeline.tsx apps/dashboard/components/MessageBubble.tsx apps/dashboard/tests-jsdom/components/DateSeparator.test.tsx apps/dashboard/tests-jsdom/components/MessageTimeline.test.tsx
git commit -m "feat(dashboard): extract DateSeparator and group consecutive bubbles

Divisor de data vira componente proprio com a capsula da referencia.
Espacamento deixa de ser uniforme: mensagens seguidas do mesmo lado ficam
coladas, troca de turno abre respiro.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `MessageBubble` — cores da referência, horário dentro da bolha, status e documento

O coração do reskin. A bolha muda de cor, o horário sai de baixo e entra no canto inferior direito, o selo "Gerada por IA" sobe para cima da bolha e o documento ganha a extensão real do arquivo.

**Files:**
- Modify: `apps/dashboard/components/MessageBubble.tsx`
- Test: `apps/dashboard/tests-jsdom/components/MessageBubble.test.tsx` (existente — acrescentar casos)

**Interfaces:**
- Consumes: `MessageMeta` e `MessageDeliveryStatus` (Task 2); tokens `bg-chat-bubble-in`/`bg-chat-bubble-out`/`text-chat-bubble-*-foreground` e `.chat-bubble-shadow` (Task 1); `spacedFromPrevious` (Task 3).
- Produces: nenhuma interface nova consumida por outras tasks — `MessageBubble` continua sendo usado apenas por `MessageTimeline` com a mesma assinatura.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/dashboard/tests-jsdom/components/MessageBubble.test.tsx`, acrescentar antes do fechamento do `describe` externo:

```tsx
  describe('Reskin 2026-08-27 — fidelidade à referência', () => {
    it('mensagem recebida: bolha clara à esquerda', () => {
      const { container } = render(<MessageBubble message={buildMessage()} />);
      expect(container.querySelector('li')).toHaveClass('items-start');
      expect(container.querySelector('.bg-chat-bubble-in')).toBeInTheDocument();
    });

    it('mensagem enviada: bolha verde-clara à direita', () => {
      const { container } = render(
        <MessageBubble message={buildMessage({ direction: 'outbound' })} />,
      );
      expect(container.querySelector('li')).toHaveClass('items-end');
      expect(container.querySelector('.bg-chat-bubble-out')).toBeInTheDocument();
    });

    it('horário aparece só como HH:MM (não a data completa)', () => {
      render(<MessageBubble message={buildMessage()} />);
      expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
      expect(screen.queryByText(/\d{2}\/\d{2}\/\d{4}/)).not.toBeInTheDocument();
    });

    it('mensagem enviada: mostra o indicador "Enviado"', () => {
      render(<MessageBubble message={buildMessage({ direction: 'outbound' })} />);
      expect(screen.getByLabelText('Enviado')).toBeInTheDocument();
    });

    it('mensagem recebida: NÃO mostra indicador de entrega', () => {
      render(<MessageBubble message={buildMessage()} />);
      expect(screen.queryByLabelText('Enviado')).not.toBeInTheDocument();
    });

    it('nunca mostra check duplo de "lido" (o backend não tem esse dado)', () => {
      render(<MessageBubble message={buildMessage({ direction: 'outbound' })} />);
      expect(screen.queryByLabelText('Lido')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Entregue')).not.toBeInTheDocument();
    });

    it('selo "Gerada por IA" fica ACIMA da bolha, não dentro dela', () => {
      const { container } = render(
        <MessageBubble
          message={buildMessage({ direction: 'outbound' })}
          aiInteraction={{
            id: 'i1',
            tenantId: 't1',
            conversationId: 'c1',
            provider: 'gemini',
            model: 'gemini-3.5-flash',
            promptVersion: 'v4',
            tokensInput: 1,
            tokensOutput: 1,
            costUsd: '0',
            latencyMs: 1,
            status: 'success',
          }}
        />,
      );
      const badge = screen.getByText(/Gerada por IA/);
      const bubble = container.querySelector('.bg-chat-bubble-out') as HTMLElement;
      expect(bubble).toBeInTheDocument();
      expect(bubble.contains(badge)).toBe(false);
    });

    it('documento: mostra a extensão real derivada do nome do arquivo', () => {
      render(
        <MessageBubble
          message={buildMessage({
            contentType: 'document',
            content: '',
            media: {
              mimeType: 'application/pdf',
              url: 'https://mmg.whatsapp.net/x.enc',
              mediaKeyEncrypted: 'enc:abc',
              fileName: 'contrato.pdf',
            },
          })}
        />,
      );
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });

    it('documento: NUNCA inventa tamanho nem número de páginas', () => {
      render(
        <MessageBubble
          message={buildMessage({
            contentType: 'document',
            content: '',
            media: {
              mimeType: 'application/pdf',
              url: 'https://mmg.whatsapp.net/x.enc',
              mediaKeyEncrypted: 'enc:abc',
              fileName: 'contrato.pdf',
            },
          })}
        />,
      );
      expect(screen.queryByText(/página/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/KB|MB/)).not.toBeInTheDocument();
    });

    it('imagem: horário aparece como chip sobreposto à mídia', () => {
      const { container } = render(
        <MessageBubble
          message={buildMessage({
            contentType: 'image',
            content: '',
            media: {
              mimeType: 'image/jpeg',
              url: 'https://mmg.whatsapp.net/x.enc',
              mediaKeyEncrypted: 'enc:abc',
            },
          })}
        />,
      );
      expect(container.querySelector('.bg-black\\/45')).toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest --selectProjects dashboard-jsdom MessageBubble`
Expected: FAIL — vários casos (bolha ainda usa `bg-muted`/`bg-primary`, horário ainda é `DD/MM/AAAA HH:MM:SS`, sem status, sem extensão).

- [ ] **Step 3: Reescrever `MessageBubble.tsx`**

Substituir o conteúdo INTEIRO de `apps/dashboard/components/MessageBubble.tsx` por:

```tsx
import { FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMessageMediaUrl } from '@/lib/clientApi';
import MessageAudioPlayer from './MessageAudioPlayer';
import MessageMeta from './MessageMeta';
import type { MessageDeliveryStatus } from './MessageStatus';
import type { ConversationMessage, AiInteractionSummary } from '@/lib/clientApi';

interface MessageBubbleProps {
  message: ConversationMessage;
  /** Interacao de IA que GEROU esta mensagem (correlacao por `messageId`, D27) — presente so em outbound geradas pela IA. */
  aiInteraction?: AiInteractionSummary;
  /**
   * Reskin 2026-08-27 — `true` quando a mensagem anterior veio do OUTRO
   * lado da conversa (ou não existe). Abre respiro vertical entre grupos,
   * mantendo mensagens consecutivas do mesmo lado coladas — padrão da
   * referência. Default `true` (comportamento espaçado) para quem renderiza
   * uma bolha isolada, sem contexto de lista.
   */
  spacedFromPrevious?: boolean;
}

/**
 * Único status de entrega que o produto sabe afirmar hoje. `WhatsAppMessage`
 * não guarda confirmação de entrega/leitura do WhatsApp do contato — exibir
 * "entregue"/"lido" seria prometer o que o produto não cumpre. Quando esse
 * dado existir (`providerMessageId` + `messages.update` no `BaileysProvider`),
 * esta constante vira o campo real da mensagem e nada mais muda.
 */
const OUTBOUND_DELIVERY_STATUS: MessageDeliveryStatus = 'sent';

/** Cor da bolha, direção-dependente — tokens EXCLUSIVOS da tela de conversa (ver globals.css). */
function bubbleColorClassName(outbound: boolean): string {
  return outbound
    ? 'bg-chat-bubble-out text-chat-bubble-out-foreground'
    : 'bg-chat-bubble-in text-chat-bubble-in-foreground';
}

/**
 * Raio da bolha na referência: 12px em três cantos e ~4px no canto que
 * aponta para o interlocutor ("cauda"), do lado correspondente à direção.
 */
function bubbleTailClassName(outbound: boolean): string {
  return outbound ? 'rounded-xl rounded-br-[4px]' : 'rounded-xl rounded-bl-[4px]';
}

/** Largura máxima responsiva — bolha cresce com o conteúdo, mas nunca toma a tela toda. */
const BUBBLE_MAX_WIDTH = 'max-w-[85%] sm:max-w-[75%] lg:max-w-[min(75%,30rem)]';

/**
 * Extensão do arquivo, para a linha de metadados do documento. Deriva do
 * NOME (fonte mais confiável) e cai no subtipo do MIME quando o nome não
 * tem extensão. NUNCA exibimos tamanho nem contagem de páginas: a API não
 * guarda esses dados (`MessageMediaReference` não tem campo de tamanho), e
 * inventar um valor violaria a regra de nunca prometer o que o produto não
 * entrega.
 */
function documentExtensionLabel(fileName: string | undefined, mimeType: string): string {
  const fromName = fileName && fileName.includes('.') ? fileName.split('.').pop() : undefined;
  if (fromName) return fromName.toUpperCase();
  const fromMime = mimeType.split('/')[1];
  return fromMime ? fromMime.toUpperCase() : 'ARQUIVO';
}

/**
 * Conteúdo de uma mensagem de MÍDIA (Fase 1, Bloco F1.1, ADR #90) — a URL
 * de `src`/`href` sempre aponta para o proxy BFF (`getMessageMediaUrl`),
 * NUNCA para `message.media.url` diretamente: aquela é a URL `.enc` crua do
 * WhatsApp (criptografada, inútil sem decifrar a `mediaKey` primeiro) — só
 * o BFF/API sabem decifrar. O navegador baixa nativamente via `<img>`/
 * `<video>`/`<a>`, sem nenhum fetch manual no cliente.
 *
 * Reskin 2026-08-27 — cada tipo de mídia carrega o PRÓPRIO `MessageMeta`
 * (horário + status), como na referência: sobre a foto/vídeo vira um chip
 * escuro translúcido; em áudio/documento fica na moldura, junto do
 * conteúdo. Isso é o que impede o horário de virar um elemento solto
 * abaixo da mensagem.
 *
 * `outbound`/mensagem sem `media` (dado antigo/inconsistente) cai no
 * fallback de texto — nunca quebra a tela por falta de referência.
 */
function MessageMediaContent({
  message,
  outbound,
}: {
  message: ConversationMessage;
  outbound: boolean;
}): JSX.Element | null {
  if (!message.media) {
    return null;
  }
  const mediaUrl = getMessageMediaUrl(message.conversationId, message.id);
  const status = outbound ? OUTBOUND_DELIVERY_STATUS : undefined;

  switch (message.contentType) {
    case 'image':
    case 'sticker':
      return (
        <div className={cn('relative', BUBBLE_MAX_WIDTH)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- binário servido pelo proxy BFF (sessão/cookie), não um asset otimizável pelo next/image. */}
          <img
            src={mediaUrl}
            alt={message.content || 'Imagem recebida'}
            className="chat-bubble-shadow max-h-64 rounded-xl object-contain"
          />
          <MessageMeta
            occurredAt={message.occurredAt}
            status={status}
            overlay
            className="absolute bottom-2 right-2"
          />
        </div>
      );
    case 'video':
      return (
        <div className={cn('relative', BUBBLE_MAX_WIDTH)}>
          <video src={mediaUrl} controls className="chat-bubble-shadow max-h-64 rounded-xl" />
          <MessageMeta
            occurredAt={message.occurredAt}
            status={status}
            overlay
            className="absolute bottom-2 right-2"
          />
        </div>
      );
    case 'audio':
      return (
        <MessageAudioPlayer
          src={mediaUrl}
          outbound={outbound}
          occurredAt={message.occurredAt}
          status={status}
          className={cn(
            'chat-bubble-shadow',
            BUBBLE_MAX_WIDTH,
            bubbleColorClassName(outbound),
            bubbleTailClassName(outbound),
          )}
        />
      );
    case 'document':
      return (
        <div
          className={cn(
            'chat-bubble-shadow flex min-w-[240px] flex-col gap-[7px] px-[9px] pb-[6px] pt-[7px]',
            BUBBLE_MAX_WIDTH,
            bubbleColorClassName(outbound),
            bubbleTailClassName(outbound),
          )}
        >
          <div className="flex items-center gap-[11px]">
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-current/[.16]">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
              {message.media.fileName ?? 'Documento'}
            </span>
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Baixar"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-current/[.14] hover:bg-current/[.26]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase text-chat-meta">
              {documentExtensionLabel(message.media.fileName, message.media.mimeType)}
            </span>
            <MessageMeta occurredAt={message.occurredAt} status={status} />
          </div>
        </div>
      );
    default:
      return null;
  }
}

/**
 * Uma mensagem na timeline (Milestone 3, Bloco 6). Inbound a esquerda
 * (contato), outbound a direita (bot/operador) — a direção é a ÚNICA fonte
 * de alinhamento e cor; nada de lógica duplicada entre os dois casos.
 * Outbound correlacionada a uma `AiInteraction` (D27) ganha o selo "Gerada
 * por IA" com o modelo — na ausencia de correlacao, nenhuma inferencia e
 * feita (D26: nada de heuristica; so o que os dados afirmam).
 *
 * Reskin 2026-08-27 (reverte a decisão de 2026-08-06 de tirar o horário da
 * bolha): na referência, horário e status vivem DENTRO da bolha, no canto
 * inferior direito, e a última linha do texto reserva espaço para eles.
 * Isso é feito com um espaçador inline invisível no fim do parágrafo + o
 * `MessageMeta` posicionado em `absolute` — técnica da própria referência.
 * Uma bolha curta cresce o suficiente para o horário caber ao lado do texto;
 * uma bolha longa empurra o horário para o canto da última linha.
 *
 * O selo "Gerada por IA" sobe para FORA e ACIMA da bolha: é informação
 * nossa, não do WhatsApp, e dentro da bolha competiria com o horário.
 */
export default function MessageBubble({
  message,
  aiInteraction,
  spacedFromPrevious = true,
}: MessageBubbleProps): JSX.Element {
  const outbound = message.direction === 'outbound';
  const contentType = message.contentType ?? 'text';
  const isMedia = contentType !== 'text';
  const status = outbound ? OUTBOUND_DELIVERY_STATUS : undefined;

  return (
    <li
      className={cn(
        'flex flex-col',
        spacedFromPrevious ? 'mt-[10px]' : 'mt-[2px]',
        outbound ? 'items-end' : 'items-start',
      )}
    >
      {aiInteraction && (
        <span
          title="Mensagem escrita pela IA"
          className="mb-[3px] px-1 text-[11px] font-medium text-primary"
        >
          Gerada por IA{aiInteraction.model ? ` · ${aiInteraction.model}` : ''}
        </span>
      )}

      {isMedia ? (
        <MessageMediaContent message={message} outbound={outbound} />
      ) : (
        <div
          className={cn(
            'chat-bubble-shadow relative px-[9px] pb-[6px] pt-[6px] text-[14.2px] leading-[19px]',
            BUBBLE_MAX_WIDTH,
            bubbleColorClassName(outbound),
            bubbleTailClassName(outbound),
          )}
        >
          <p className="whitespace-pre-wrap break-words text-pretty">
            {message.content}
            {/*
              Espaçador invisível: reserva, no FLUXO do texto, a largura que o
              horário (+ tick) ocupa no canto. Sem ele, a última linha passaria
              por baixo do `MessageMeta` absoluto. É exatamente a técnica da
              referência — e é o que faz uma bolha curta crescer o tanto certo
              para o horário caber ao lado, em vez de descer uma linha.
            */}
            <span className={cn('inline-block h-1', outbound ? 'w-[62px]' : 'w-[44px]')} aria-hidden="true" />
          </p>
          <MessageMeta
            occurredAt={message.occurredAt}
            status={status}
            className="absolute bottom-[6px] right-[9px]"
          />
        </div>
      )}

      {isMedia && message.content && (
        <p
          className={cn(
            'mt-[3px] px-1 text-[12.5px] leading-[1.45] text-muted-foreground',
            BUBBLE_MAX_WIDTH,
          )}
        >
          {message.content}
        </p>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx jest --selectProjects dashboard-jsdom MessageBubble`
Expected: FAIL nos testes de áudio — `MessageAudioPlayer` ainda não aceita as props `outbound`/`occurredAt`/`status` (isso é a Task 5). O passo seguinte contorna isso mantendo compatibilidade temporária.

- [ ] **Step 5: Tornar `MessageAudioPlayer` compatível com as props novas (mínimo para compilar)**

Em `apps/dashboard/components/MessageAudioPlayer.tsx`, trocar a interface (linhas 5-8) por:

```tsx
import MessageMeta from './MessageMeta';
import type { MessageDeliveryStatus } from './MessageStatus';

interface MessageAudioPlayerProps {
  src: string;
  className?: string;
  /** Reskin 2026-08-27 — direção da mensagem; muda a cor da trilha de progresso. */
  outbound?: boolean;
  /** Reskin 2026-08-27 — horário exibido dentro da própria moldura do áudio (nunca abaixo dela). */
  occurredAt?: string;
  /** Reskin 2026-08-27 — indicador de entrega, só em mensagens enviadas. */
  status?: MessageDeliveryStatus;
}
```

E na assinatura da função (linhas 26-29), trocar por:

```tsx
export default function MessageAudioPlayer({
  src,
  className,
  outbound = false,
  occurredAt,
  status,
}: MessageAudioPlayerProps): JSX.Element {
```

Ao final do JSX, logo antes do `</div>` de fechamento (após o `<span>` da duração), acrescentar:

```tsx
      {occurredAt && <MessageMeta occurredAt={occurredAt} status={status} />}
```

Remover a classe `max-w-[66%]` do `cn(...)` do contêiner raiz (a largura passa a vir do `BUBBLE_MAX_WIDTH` que `MessageBubble` injeta via `className`); a linha vira:

```tsx
        'flex items-center gap-[11px] rounded-xl px-[13px] py-[9px] pl-2.5',
```

Nota: `outbound` ainda não é usado neste passo (a trilha ganha cor na Task 5) — para o lint não reclamar de variável não usada, o passo da Task 5 a consome. Se `npm run lint` reclamar aqui, prefixar temporariamente não é aceitável (a prop precisa manter o nome público): siga direto para a Task 5 antes do commit desta.

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `npx jest --selectProjects dashboard-jsdom MessageBubble MessageTimeline`
Expected: PASS — todos os casos antigos de `MessageBubble` + os 10 novos + `MessageTimeline` verde.

- [ ] **Step 7: Verificar typecheck**

Run: `npm run typecheck -w apps/dashboard`
Expected: sem erro.

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/components/MessageBubble.tsx apps/dashboard/components/MessageAudioPlayer.tsx apps/dashboard/tests-jsdom/components/MessageBubble.test.tsx
git commit -m "feat(dashboard): rebuild MessageBubble to match WhatsApp reference

Bolha recebida branca / enviada verde-clara com texto escuro, cauda de 4px,
sombra sutil. Horario volta para DENTRO da bolha (HH:MM + tick), com
espacador inline reservando espaco na ultima linha. Selo Gerada por IA sobe
para fora da bolha. Documento ganha a extensao real do arquivo; midia ganha
chip de horario sobreposto.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `MessageAudioPlayer` — waveform em barras

Troca a linha de progresso fina por barras verticais no padrão da referência, com progresso real e amplitude determinística.

**Files:**
- Modify: `apps/dashboard/components/MessageAudioPlayer.tsx`
- Test: `apps/dashboard/tests-jsdom/components/MessageAudioPlayer.test.tsx` (**criar** — o componente nunca teve teste próprio)

**Interfaces:**
- Consumes: `MessageMeta` (Task 2); props `outbound`/`occurredAt`/`status` declaradas na Task 4.
- Produces: nenhuma interface nova — o componente continua sendo consumido apenas por `MessageBubble`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/dashboard/tests-jsdom/components/MessageAudioPlayer.test.tsx`:

```tsx
/**
 * Reskin 2026-08-27 — primeiro teste dedicado do player de áudio (gap
 * pré-existente: só havia cobertura indireta via `MessageBubble.test.tsx`).
 * Cobre a waveform em barras da referência, os estados de reprodução e o
 * fato de o horário viver dentro da própria moldura.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageAudioPlayer from '../../components/MessageAudioPlayer';

describe('MessageAudioPlayer', () => {
  beforeAll(() => {
    // jsdom não implementa reprodução de mídia.
    window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = jest.fn();
  });

  it('renderiza a waveform como um conjunto de barras, não uma linha só', () => {
    const { container } = render(<MessageAudioPlayer src="/media/a.ogg" />);
    const bars = container.querySelectorAll('[data-waveform-bar]');
    expect(bars.length).toBeGreaterThan(10);
  });

  it('a waveform é estável para o mesmo src (não muda a cada render)', () => {
    const first = render(<MessageAudioPlayer src="/media/a.ogg" />);
    const firstHeights = Array.from(
      first.container.querySelectorAll('[data-waveform-bar]'),
    ).map((bar) => (bar as HTMLElement).style.height);
    first.unmount();

    const second = render(<MessageAudioPlayer src="/media/a.ogg" />);
    const secondHeights = Array.from(
      second.container.querySelectorAll('[data-waveform-bar]'),
    ).map((bar) => (bar as HTMLElement).style.height);

    expect(secondHeights).toEqual(firstHeights);
  });

  it('começa parado, mostrando o botão "Reproduzir áudio"', () => {
    render(<MessageAudioPlayer src="/media/a.ogg" />);
    expect(screen.getByRole('button', { name: 'Reproduzir áudio' })).toBeInTheDocument();
  });

  it('clicar em reproduzir troca o botão para "Pausar áudio"', () => {
    render(<MessageAudioPlayer src="/media/a.ogg" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
    expect(screen.getByRole('button', { name: 'Pausar áudio' })).toBeInTheDocument();
  });

  it('clicar em pausar volta ao estado parado', () => {
    render(<MessageAudioPlayer src="/media/a.ogg" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pausar áudio' }));
    expect(screen.getByRole('button', { name: 'Reproduzir áudio' })).toBeInTheDocument();
  });

  it('com occurredAt: mostra o horário dentro da própria moldura do áudio', () => {
    render(<MessageAudioPlayer src="/media/a.ogg" occurredAt="2026-07-24T12:31:00.000Z" />);
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('com status: mostra o indicador de entrega', () => {
    render(
      <MessageAudioPlayer
        src="/media/a.ogg"
        occurredAt="2026-07-24T12:31:00.000Z"
        status="sent"
      />,
    );
    expect(screen.getByLabelText('Enviado')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest --selectProjects dashboard-jsdom MessageAudioPlayer`
Expected: FAIL — não existem elementos `[data-waveform-bar]` (o componente ainda desenha uma única barra de progresso).

- [ ] **Step 3: Implementar a waveform**

Em `apps/dashboard/components/MessageAudioPlayer.tsx`, acrescentar acima do componente (após a função `formatDuration`):

```tsx
/** Número de barras da waveform — mesma densidade visual da referência. */
const WAVEFORM_BAR_COUNT = 32;

/**
 * Alturas das barras da waveform, em porcentagem (30%–100%).
 *
 * DECORATIVO quanto à AMPLITUDE, por limitação real: a API entrega o
 * binário do áudio, não os samples decodificados — desenhar a forma de onda
 * verdadeira exigiria decodificar o arquivo inteiro no cliente (Web Audio
 * API) só para pintar 32 barrinhas. O PROGRESSO, esse sim, é real (vem do
 * `currentTime` do `<audio>`).
 *
 * Derivadas do `src` por um PRNG determinístico (LCG clássico) para que a
 * mesma mensagem tenha sempre o mesmo desenho — uma waveform que muda a cada
 * render pareceria defeito.
 */
function waveformHeights(seed: string, bars: number): number[] {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state = (state * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const heights: number[] = [];
  for (let index = 0; index < bars; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    heights.push(30 + ((state >>> 8) % 71));
  }
  return heights;
}
```

Dentro do componente, logo após a linha `const progressPct = ...`, acrescentar:

```tsx
  // `useMemo` não é necessário: `waveformHeights` é O(32) e o componente só
  // re-renderiza a cada `timeupdate` — o custo é irrelevante e a alternativa
  // acrescentaria um hook para nada.
  const heights = waveformHeights(src, WAVEFORM_BAR_COUNT);
  const playedBars = Math.round((progressPct / 100) * WAVEFORM_BAR_COUNT);
```

Substituir o `<span>` da trilha de progresso (o bloco `<span className="relative h-[3px] w-[132px] ...">...</span>`) por:

```tsx
      <span className="flex h-[26px] shrink-0 items-center gap-[2px]" aria-hidden="true">
        {heights.map((height, index) => (
          <span
            key={index}
            data-waveform-bar
            style={{ height: `${height}%` }}
            className={cn(
              'w-[2px] shrink-0 rounded-full',
              index < playedBars
                ? outbound
                  ? 'bg-chat-bubble-out-foreground/70'
                  : 'bg-primary'
                : 'bg-chat-meta/40',
            )}
          />
        ))}
      </span>
```

Atualizar também a docstring do componente, trocando o parágrafo final por:

```
 * Reskin 2026-08-27 — a linha de progresso fina virou a waveform em barras
 * da referência. Amplitude decorativa e determinística (ver
 * `waveformHeights`); progresso real. Sem busca por clique na trilha —
 * fora de escopo, e a referência também não interage com ela.
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest --selectProjects dashboard-jsdom MessageAudioPlayer`
Expected: PASS — 8 testes verdes.

- [ ] **Step 5: Rodar toda a suíte jsdom para garantir que nada regrediu**

Run: `npx jest --selectProjects dashboard-jsdom`
Expected: PASS — todas as suítes verdes.

- [ ] **Step 6: Verificar typecheck e lint**

Run: `npm run typecheck -w apps/dashboard && npm run lint -w apps/dashboard`
Expected: ambos sem erro (a prop `outbound` agora é consumida, resolvendo a pendência anotada na Task 4).

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/components/MessageAudioPlayer.tsx apps/dashboard/tests-jsdom/components/MessageAudioPlayer.test.tsx
git commit -m "feat(dashboard): render audio waveform as bars

Trilha fina vira 32 barras verticais no padrao da referencia. Amplitude
deterministica derivada do src (a API nao entrega samples, documentado no
componente); progresso e reproducao continuam reais. Primeiro teste
dedicado do player.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `MessageComposer` — casca em pill com Enviar fixo

Reconstrói só a casca visual. Toda a lógica de envio (texto 202 / mídia 200), toasts, anexo e respostas rápidas permanece byte a byte a mesma.

**Files:**
- Modify: `apps/dashboard/components/MessageComposer.tsx`
- Test: `apps/dashboard/tests-jsdom/components/MessageComposer.test.tsx` (existente — acrescentar casos)

**Interfaces:**
- Consumes: nada novo.
- Produces: nenhuma mudança na assinatura pública (`conversationId`, `sessionName`, `onSent`).

**Contratos que NÃO podem mudar** (os testes existentes dependem deles):
- placeholder `Escreva sua resposta…` (vazio) / `Legenda (opcional)…` (com anexo);
- `aria-label` do botão de envio: `'Enviar'` (ou `'Enviando…'` durante o envio);
- `aria-label` `'Anexar arquivo'` no `<input type="file">` e no botão;
- `aria-label` `'Respostas rápidas'`, `'Remover anexo'`, `'Voltar para a lista de respostas rápidas'`;
- Enter envia / Shift+Enter quebra linha.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/dashboard/tests-jsdom/components/MessageComposer.test.tsx`, acrescentar antes do fechamento do `describe` externo:

```tsx
  describe('Reskin 2026-08-27 — casca em pill', () => {
    it('o botão Enviar é FIXO: existe mesmo com o campo vazio (sem toggle de microfone)', () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /microfone|gravar/i })).not.toBeInTheDocument();
    });

    it('não existe botão de emoji (o app não tem seletor de emoji)', () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      expect(screen.queryByRole('button', { name: /emoji/i })).not.toBeInTheDocument();
    });

    it('Enviar fica desabilitado sem texto e sem anexo, e habilita ao digitar', () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      const send = screen.getByRole('button', { name: 'Enviar' });
      expect(send).toBeDisabled();
      fireEvent.change(screen.getByPlaceholderText(/Escreva sua resposta/), {
        target: { value: 'oi' },
      });
      expect(send).toBeEnabled();
    });

    it('a casca é uma cápsula (raio alto), não um retângulo', () => {
      const { container } = render(
        <MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />,
      );
      expect(container.querySelector('.rounded-\\[22px\\]')).toBeInTheDocument();
    });

    it('a textarea começa com uma linha e cresce até o teto (sem virar caixa quadrada)', () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      const textarea = screen.getByPlaceholderText(/Escreva sua resposta/) as HTMLTextAreaElement;
      expect(textarea).toHaveAttribute('rows', '1');
      expect(textarea.className).toContain('max-h-[132px]');
    });

    it('a dica "Enter envia" sai da UI e vira title da textarea', () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      expect(screen.queryByText(/Enter envia/)).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Escreva sua resposta/)).toHaveAttribute(
        'title',
        'Enter envia · Shift+Enter quebra linha',
      );
    });
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest --selectProjects dashboard-jsdom MessageComposer`
Expected: FAIL — não há `rounded-[22px]`, `rows` é `2`, a dica "Enter envia" ainda está visível na tela.

- [ ] **Step 3: Adicionar o autosize da textarea**

Em `apps/dashboard/components/MessageComposer.tsx`, logo após a linha `const fileInputRef = useRef<HTMLInputElement>(null);`, acrescentar:

```tsx
  /**
   * Reskin 2026-08-27 — a casca virou uma cápsula, então a textarea não pode
   * mais ter altura fixa de 2 linhas: começa com 1 e cresce com o conteúdo
   * até o teto, quando passa a rolar internamente. Sem biblioteca — é só
   * medir `scrollHeight` a cada mudança de texto.
   */
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX_TEXTAREA_HEIGHT_PX = 132; // ~6 linhas a 22px

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }, [content]);
```

- [ ] **Step 4: Substituir a casca visual pela pill**

No mesmo arquivo, substituir o bloco que começa em `{/* Reskin 2026-08-06 — um único card ...` (o `<div className="rounded-xl border border-input bg-card px-3 pb-2 pt-2.5 ...">`) e vai até o `</div>` que o fecha, por:

```tsx
      {/*
        Reskin 2026-08-27 — casca em CÁPSULA, fiel à referência: raio alto,
        fundo claro, borda/sombra quase imperceptíveis, altura compacta e
        controles pequenos que parecem parte da própria caixa. Os botões usam
        `self-end` para continuarem ancorados embaixo enquanto a textarea
        cresce.
      */}
      <div className="flex items-end gap-1 rounded-[22px] border border-input bg-card px-2 py-1.5 shadow-sm focus-within:border-primary/40 focus-within:ring-[3px] focus-within:ring-primary/10">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Anexar arquivo"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 self-end rounded-full text-muted-foreground"
          disabled={sending}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Anexar arquivo"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </Button>
        <div ref={quickRepliesRef} className="relative shrink-0 self-end">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-muted-foreground"
            disabled={sending}
            onClick={() =>
              setShowQuickReplies((current) => {
                if (current) setManagingQuickReplies(false);
                return !current;
              })
            }
            aria-label="Respostas rápidas"
          >
            <MessageSquareText className="h-[17px] w-[17px]" aria-hidden="true" />
          </Button>
          {showQuickReplies &&
            (managingQuickReplies ? (
              <div className="fx-scroll absolute bottom-full left-0 mb-2 max-h-[420px] w-[460px] overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-menu">
                <div className="mb-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      // Reflete criações/edições/remoções feitas dentro do
                      // `QuickRepliesPanel` (que gerencia seu PRÓPRIO
                      // `useQuickReplies`, independente deste) na lista de
                      // inserção — sem isso, uma resposta recém-cadastrada
                      // só apareceria depois de reabrir o dropdown do zero.
                      setManagingQuickReplies(false);
                      refreshQuickReplies();
                    }}
                    aria-label="Voltar para a lista de respostas rápidas"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="text-[13px] font-medium text-foreground">
                    Gerenciar respostas rápidas
                  </span>
                </div>
                <QuickRepliesPanel sessionName={sessionName} />
              </div>
            ) : (
              <div className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-menu">
                <div className="fx-scroll max-h-56 overflow-y-auto p-1.5">
                  {quickReplies.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">
                      Nenhuma resposta rápida cadastrada.
                    </p>
                  ) : (
                    quickReplies.map((quickReply) => (
                      <button
                        key={quickReply.id}
                        type="button"
                        onClick={() => insertQuickReply(quickReply.content)}
                        className="block w-full truncate rounded-lg p-2 text-left text-[13px] text-foreground hover:bg-muted"
                        title={quickReply.content}
                      >
                        {quickReply.content}
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setManagingQuickReplies(true)}
                  className="flex w-full items-center gap-1.5 border-t border-border/70 p-2 text-left text-[12.5px] font-medium text-primary hover:bg-muted"
                >
                  <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Cadastrar / gerenciar respostas rápidas
                </button>
              </div>
            ))}
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedFile ? 'Legenda (opcional)…' : 'Escreva sua resposta…'}
          title="Enter envia · Shift+Enter quebra linha"
          rows={1}
          maxLength={MAX_LENGTH}
          className="fx-scroll max-h-[132px] min-h-[36px] flex-1 resize-none self-center border-0 bg-transparent px-1 py-2 text-[14.2px] leading-[1.45] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          size="icon"
          className="h-9 w-9 shrink-0 self-end rounded-full shadow-cta"
          disabled={!canSubmit}
          aria-label={sending ? 'Enviando…' : 'Enviar'}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
```

- [ ] **Step 5: Ajustar imports**

No topo do arquivo, no import de `lucide-react`, trocar `Paperclip` por `Plus` (o `Paperclip` deixa de ser usado — o botão de anexo vira o `+` da referência):

```tsx
import {
  Plus,
  X,
  FileText,
  MessageSquareText,
  Send,
  Settings2,
  ChevronLeft,
} from 'lucide-react';
```

E confirmar que `useEffect` já está no import de `react` (está — linha 3).

- [ ] **Step 6: Reestilizar o chip de anexo selecionado**

No mesmo arquivo, trocar a classe do `<div>` do preview de anexo por uma cápsula, mantendo todo o conteúdo e os handlers:

```tsx
        <div className="flex items-center gap-2 self-start rounded-full border border-input bg-muted/50 px-3 py-1.5 text-sm">
```

- [ ] **Step 7: Atualizar a docstring do componente**

Acrescentar ao final da docstring do componente (antes do `*/`):

```
 * Reskin 2026-08-27: a casca virou uma CÁPSULA fiel à referência (WhatsApp
 * Web) — `+` para anexo, ícone discreto de respostas rápidas, textarea que
 * cresce sozinha e botão de envio circular. Decisão explícita do fundador:
 * o botão Enviar é FIXO (a referência troca por microfone quando o campo
 * está vazio; aqui não há gravação de áudio, então o toggle prometeria uma
 * função inexistente). Sem botão de emoji pelo mesmo motivo — o app não tem
 * seletor. Nenhuma linha da lógica de envio/toast/anexo/respostas rápidas
 * foi tocada neste reskin.
```

- [ ] **Step 8: Rodar os testes e confirmar que passam**

Run: `npx jest --selectProjects dashboard-jsdom MessageComposer`
Expected: PASS — os ~20 casos existentes + 6 novos.

- [ ] **Step 9: Verificar typecheck e lint**

Run: `npm run typecheck -w apps/dashboard && npm run lint -w apps/dashboard`
Expected: ambos sem erro.

- [ ] **Step 10: Commit**

```bash
git add apps/dashboard/components/MessageComposer.tsx apps/dashboard/tests-jsdom/components/MessageComposer.test.tsx
git commit -m "feat(dashboard): rebuild composer as a rounded pill

Capsula com + (anexo), respostas rapidas, textarea autosize e Enviar fixo
circular. Sem emoji e sem toggle de microfone (decisao do fundador: o app
nao grava audio). Toda a logica de envio, toasts e respostas rapidas
permanece intacta.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Densidade do painel, suíte completa e validação visual

Ajuste final de espaçamento da área de mensagens e a verificação de que nada quebrou em lugar nenhum.

**Files:**
- Modify: `apps/dashboard/components/ConversationDetailPanel.tsx`
- Test: `apps/dashboard/tests-jsdom/components/ConversationDetailPanel.test.tsx` (existente — só rodar; nenhum caso novo)

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: nada.

- [ ] **Step 1: Ajustar o padding da área rolável**

Em `apps/dashboard/components/ConversationDetailPanel.tsx`, trocar a linha 257:

```tsx
        <div ref={scrollContainerRef} className="fx-scroll h-full overflow-y-auto p-4">
```

por:

```tsx
        {/*
          Reskin 2026-08-27 — margem lateral generosa no desktop (as bolhas
          não devem colar nas bordas, como na referência) e enxuta no mobile,
          onde cada pixel de largura conta. O papel de parede fica no
          contêiner PAI, que não rola: só esta lista rola, por cima dele.
        */}
        <div
          ref={scrollContainerRef}
          className="fx-scroll h-full overflow-y-auto px-3 py-2 sm:px-6 lg:px-[7%]"
        >
```

- [ ] **Step 2: Rodar o teste de `ConversationDetailPanel`**

Run: `npx jest --selectProjects dashboard-jsdom ConversationDetailPanel`
Expected: PASS — nenhum comportamento de scroll/leitura foi alterado.

- [ ] **Step 3: Rodar a suíte inteira do monorepo**

Run: `npx jest`
Expected: PASS — todas as suítes (`api`, `dashboard`, `dashboard-jsdom`) verdes.

> Se houver falhas em suítes `*.integration.test.ts` do projeto `api`, verifique se Postgres/Redis estão de pé (`docker compose up -d postgres redis`) — é a causa conhecida e já registrada. Nunca declarar verde um teste de integração que na verdade PULOU: confira a ausência de avisos de "banco indisponível" na saída (não rode com `--silent`).

- [ ] **Step 4: Rodar typecheck, lint e build**

Run: `npm run typecheck -w apps/dashboard && npm run lint -w apps/dashboard && npm run build -w apps/dashboard`
Expected: os três sem erro; o build compila todas as rotas.

- [ ] **Step 5: Validação visual contra a referência**

Subir o ambiente e comparar a tela real com as imagens de referência usando o MCP `chrome-devtools` (o fundador faz o login — ferramentas de IA nunca digitam senha):

```bash
docker compose up -d postgres redis
```

Depois `npm run dev` na raiz, abrir `/sessions/<sessao>/conversations/<id>` e conferir item a item:

- [ ] Fundo com o papel de parede, sutil, sem competir com as mensagens
- [ ] Recebidas à esquerda (bolha clara), enviadas à direita (bolha verde-clara)
- [ ] Bolha curta é pequena; bolha longa cresce até o `max-width`, sem tomar a tela
- [ ] Horário `HH:MM` DENTRO da bolha, canto inferior direito, sem colidir com o texto
- [ ] Check único cinza só nas enviadas
- [ ] Pill de data centralizada, formato de cápsula
- [ ] Mensagens seguidas do mesmo lado coladas; troca de lado com respiro
- [ ] Áudio com play circular + barras de waveform + duração + horário na moldura
- [ ] Documento com ícone, nome, extensão, botão de baixar e horário
- [ ] Composer em cápsula, preso embaixo, com `+`, respostas rápidas e Enviar fixo
- [ ] Textarea cresce ao digitar várias linhas e passa a rolar internamente
- [ ] Só a lista de mensagens rola; composer e cabeçalho ficam fixos
- [ ] Responsivo: repetir a conferência em ~1440px, ~1024px e ~390px de largura
- [ ] Tema escuro legível (tokens `--chat-*` da variante `.dark`)

Corrigir qualquer divergência encontrada antes de seguir.

- [ ] **Step 6: Commit final**

```bash
git add apps/dashboard/components/ConversationDetailPanel.tsx
git commit -m "style(dashboard): tune conversation panel density

Margem lateral generosa no desktop e enxuta no mobile, com o papel de
parede fixo no container que nao rola. Fecha o reskin de fidelidade da tela
de conversa.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Registrar a decisão na memória do projeto**

Acrescentar uma entrada em `CLAUDE.md` §18 (Memória do Projeto), no final da seção, seguindo o padrão das entradas existentes (Data / Contexto / Decisão / Impacto), resumindo: tokens `--chat-*` isolados do Design System e por quê; horário de volta para dentro da bolha (revertendo a decisão de 2026-08-06); `MessageStatus` com 3 estados prontos mas só `sent` alimentado; waveform decorativa quanto à amplitude e real quanto ao progresso; composer sem mic/emoji por decisão do fundador. Commitar junto:

```bash
git add CLAUDE.md
git commit -m "docs: record conversation screen fidelity reskin in project memory

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Autorrevisão do plano

**Cobertura da spec:** §1 estrutura (Task 7) · §2 fundo (já existia, preservado na Task 7) · §3/§4 bolhas (Tasks 1 e 4) · §5 texto (Task 4) · §6 horário integrado (Tasks 2 e 4) · §7 indicadores (Task 2) · §8 separador de data (Task 3) · §9 áudio (Task 5) · §10 documento (Task 4) · §11/§12/§13/§14 composer (Task 6 — §12 sobrescrito pela decisão do fundador: Enviar fixo) · §15 espaçamentos (Tasks 3, 4 e 7) · §16 responsividade (Tasks 4 e 7) · §17 scroll (Task 7) · §18 componentização (Tasks 2, 3) · §19 tipos (Task 2) · §20 acessibilidade (Tasks 2 e 6) · §23 checklist de validação (Task 7, Step 5).

**Sem placeholders:** todos os passos de código trazem o conteúdo real. Nenhum "similar à Task N", nenhum "adicionar tratamento de erro apropriado".

**Consistência de tipos:** `MessageDeliveryStatus` é definido na Task 2 e usado com o mesmo nome nas Tasks 4 e 5. `MessageMeta` recebe `occurredAt`/`status`/`overlay`/`className` em todos os pontos de uso. `spacedFromPrevious` é declarado na Task 3 e consumido na mesma task, com o default `true` preservado na reescrita da Task 4. `BUBBLE_MAX_WIDTH` é local à Task 4 e usado só ali. `formatMessageTime` (Task 1) é consumido apenas por `MessageMeta` (Task 2).

**Risco de estado intermediário que não compila:** identificado entre as Tasks 4 e 5 (a prop `outbound` de `MessageAudioPlayer` só passa a ser usada na Task 5) — anotado explicitamente no Step 5 da Task 4, com instrução de seguir para a Task 5 antes de considerar o lint fechado.
