# Reskin de fidelidade — Dashboard de Conversa (referência WhatsApp Web)

**Data:** 2026-08-27
**Escopo:** `apps/dashboard` — tela de conversa aberta. Sem mudança de API/BFF, sem
mudança de contrato de dados, sem mudança em outras telas.

## Contexto

A tela já passou por um reskin em direção ao WhatsApp (Reskin 2026-08-06). Os
componentes existem e serão **refatorados, não recriados**:

- `ConversationDetailPanel.tsx` — cabeçalho + contêiner com wallpaper + timeline + composer
- `MessageTimeline.tsx` — divisores de data + lista de bolhas
- `MessageBubble.tsx` + `MessageMediaContent` (interno) — texto/imagem/vídeo/áudio/documento
- `MessageAudioPlayer.tsx` — player custom (play/pause reais)
- `MessageComposer.tsx` — caixa de resposta do operador

Wallpaper (`chat-wallpaper-light.png` / `-dark.png`) e a classe `.chat-wallpaper`
já estão no repositório (não commitados) e permanecem como estão.

## Decisões aprovadas (via perguntas ao fundador)

1. **Bolhas fiéis ao WhatsApp**, aceitando divergência visual do resto do app.
2. **Composer:** anexo · respostas rápidas (ícone discreto) · campo autosize ·
   **botão Enviar fixo**. Sem botão de emoji. **Sem toggle mic↔enviar**
   (override explícito do fundador sobre a spec §12).
3. **`MessageStatus`** com 3 estados visuais (`sent`/`delivered`/`read`),
   alimentado sempre com `sent` hoje (backend só conhece "enviado").

## Regras visuais a implementar

### Tokens novos (`globals.css`, `tailwind.config.js`)

| Token | Claro | Escuro (extrapolado) | Papel |
|---|---|---|---|
| `--chat-bubble-in` | `#FFFFFF` | superfície elevada sobre `--panel` | bolha recebida |
| `--chat-bubble-in-foreground` | `--foreground` | `--foreground` | texto recebido |
| `--chat-bubble-out` | `#D9FDD3` | verde dessaturado escuro legível | bolha enviada |
| `--chat-bubble-out-foreground` | `--foreground` | `--foreground` claro | texto enviado |
| `--chat-meta` | `#667781`-ish (cinza WhatsApp) | cinza claro | horário/ticks dentro da bolha |
| `--chat-divider` | branco translúcido | escuro translúcido | pill "domingo" |

Mapear em `tailwind.config.js` como `chat.bubbleIn`, `chat.bubbleOut`,
`chat.meta`, etc., seguindo o padrão dos tokens existentes.

### Bolha (`MessageBubble.tsx`)

- Recebida à esquerda, enviada à direita — **direção determinada por
  `message.direction`**, nada de duplicar lógica.
- `max-width` responsivo: `min(75%, 30rem)` em desktop, `85%` em telas `< sm`.
  Largura pelo conteúdo (bolha curta = bolha pequena).
- `border-radius: 12px`, com o canto "cauda" (`rounded-br`/`rounded-bl` conforme
  direção) em `4px`.
- Sombra **muito** sutil, fiel ao WhatsApp: `0 1px 0.5px rgba(0,0,0,.13)`
  (uma utility `.chat-bubble-shadow`, não `shadow-*` do Tailwind). Sem gradiente,
  sem glow.
- Padding interno: `6px 9px 8px 12px` (padrão WhatsApp: mais folga à esquerda).
- Tipografia: `14.2px` / `line-height 19px`, peso normal, `white-space: pre-wrap`,
  `word-break: break-word`.

### Horário + ticks DENTRO da bolha (reverte a decisão de 06/08)

- Nova função `formatMessageTime(iso)` em `lib/formatters.ts` → **`HH:MM`** apenas
  (a atual `formatDateTime` devolve `DD/MM/AAAA HH:MM:SS`, errado para bolha).
- Grupo `[hora] [MessageStatus?]` renderizado no canto inferior direito da bolha,
  `11px`, cor `--chat-meta`.
- Técnica clássica WhatsApp para o horário coexistir com o texto:
  - o grupo de meta é `float: right` com um espaçador inline de largura reservada
    (`≈ 4.5em` texto, `≈ 5.5em` com tick) **dentro** do parágrafo, para a última
    linha nunca colidir com a hora;
  - mensagens curtas resultam em `[ texto        10:31 ]`;
  - mensagens longas: a hora fica no canto inferior direito, na mesma "caixa".
- **Mídia:** a hora/ticks vão sobre a própria mídia (imagem/vídeo) num chip
  `bg-black/45 text-white` no canto inferior direito, ou dentro da moldura para
  áudio/documento (esses já têm moldura colorida).
- O selo "Gerada por IA · modelo" **sai da bolha** e vira uma linha discreta
  ACIMA da bolha enviada (não compete com a estética WhatsApp; continua sendo
  informação só nossa). Alternativa considerada: manter dentro — rejeitada por
  poluir a bolha e brigar com o horário.

### `MessageStatus.tsx` (novo)

```ts
type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read';
```

- `sending` → relógio fino; `sent` → 1 check; `delivered` → 2 checks cinza;
  `read` → 2 checks azul (`#53bdeb`).
- `14px`, `aria-label` em pt-BR ("Enviado" / "Entregue" / "Lido").
- Prop obrigatória `status`. `MessageBubble` passa `'sent'` para toda outbound
  (constante local documentada; ponto único de troca quando o backend evoluir).
- Não renderiza nada para inbound.

### Divisor de data (`DateSeparator.tsx`, extração de `MessageTimeline`)

- Pill centrada, `bg-[--chat-divider]`, `border-radius 8px`, `12.5px`,
  `text-[--chat-meta]`, sombra sutil igual à da bolha.
- Espaço vertical `12px` antes/depois.
- Usa `formatDayDivider` existente ("Hoje"/"Ontem"/data). Sem mudança de lógica.

### Áudio (`MessageAudioPlayer.tsx`)

- Mantém o `<audio>` real por baixo (reprodução/tempo reais) e os estados
  `playing`/`paused`.
- Botão circular de play/pause `32px`, distinto da trilha.
- **Waveform**: ~32 barras verticais geradas de forma determinística a partir do
  `src` (hash simples → alturas pseudo-aleatórias estáveis), `2px` de largura,
  `gap 2px`, cantos arredondados. Barras "já tocadas" na cor de progresso
  (`--primary`), restantes em `--chat-meta/40`. **Decorativo quanto à amplitude**
  (a API não entrega samples) — documentado no componente; a posição de
  progresso é real.
- Duração restante `11.5px` à direita.
- `ContactAvatar` pequeno (`28px`) à esquerda quando a mensagem é inbound
  (espelha a referência); omitido em outbound.
- Sem busca por clique (fora de escopo, como já estava).

### Documento (`MessageMediaContent`)

- Mantém: ícone de tipo (`FileText`), nome do arquivo com destaque moderado,
  botão de download.
- Adiciona a linha de metadados **só com o que existe**: `PDF` / extensão
  derivada de `media.mimeType` ou do nome. **Não inventa** contagem de páginas
  nem tamanho (a API não tem — regra já registrada no projeto).
- Mantém a bolha (é uma mensagem, não um card solto).

### Composer (`MessageComposer.tsx`)

- Um único contêiner **pill** (`rounded-[22px]`, `bg-card`, borda `--input`,
  sombra sutil), largura total menos margem pequena, altura compacta.
- Da esquerda para a direita: botão `+` (anexo) · botão respostas rápidas
  (`MessageSquareText`, discreto) · `textarea` autosize · botão **Enviar** fixo
  (círculo `--primary`, ícone `Send`).
- `textarea`: `rows=1` inicial, cresce até `~6` linhas, depois `overflow-y:auto`
  interno (`.fx-scroll`); `outline:none`; sem caixa interna quadrada.
- `Enter` envia, `Shift+Enter` quebra linha (comportamento atual mantido).
  A dica textual sai da UI e vira `title` no textarea.
- Chip de anexo selecionado: acima da pill, como hoje, só reestilizado.
- Botão Enviar `disabled` quando não há texto nem anexo (inalterado).
- **Toda a lógica de envio (texto 202, mídia 200, toasts, quick replies,
  gerenciar quick replies) permanece intacta** — só muda a casca visual.

### `ConversationDetailPanel.tsx`

- Sem mudança de comportamento (scroll, "ir para recentes", marcar como lida,
  polling). Apenas: garantir que o contêiner `.chat-wallpaper` continue sendo o
  que NÃO rola e que a lista role por cima; ajustar paddings da lista para a
  densidade da referência (`px-[7%] py-3` em desktop, menor no mobile).
- Composer sempre visualmente preso embaixo (`shrink-0`, já é).

## Componentização final

| Arquivo | Ação |
|---|---|
| `lib/formatters.ts` | + `formatMessageTime` |
| `styles/globals.css` | + tokens `--chat-*`, utilities `.chat-bubble-shadow` |
| `tailwind.config.js` | + mapeamento `chat.*` |
| `components/MessageStatus.tsx` | **novo** |
| `components/DateSeparator.tsx` | **novo** (extraído de `MessageTimeline`) |
| `components/MessageBubble.tsx` | refatorado (cores, hora dentro, status, selo IA acima) |
| `components/MessageAudioPlayer.tsx` | refatorado (waveform em barras, avatar) |
| `components/MessageComposer.tsx` | refatorado (pill, enviar fixo, sem emoji) |
| `components/MessageTimeline.tsx` | usa `DateSeparator` |
| `components/ConversationDetailPanel.tsx` | ajuste de padding/densidade |

Tipos: reusar `ConversationMessage.contentType` / `.direction` já existentes.
`MessageDeliveryStatus` é novo e local a `MessageStatus`.

## Testes

- `tests-jsdom/components/MessageBubble.test.tsx` — atualizar asserts de markup
  (hora agora dentro; selo IA acima). Novos casos: `HH:MM` renderizado; 1 check
  para outbound; nada de check para inbound.
- `MessageComposer.test.tsx` — atualizar seletores da nova casca; garantir que
  envio de texto/mídia e quick replies seguem funcionando; **novo**: não existe
  botão de emoji; botão Enviar sempre presente (sem mic).
- `MessageTimeline.test.tsx` — divisor agora via `DateSeparator`; texto do
  divisor inalterado.
- `ConversationDetailPanel.test.tsx` — sem mudança de comportamento; rodar para
  garantir que nada quebrou.
- **novos**: `MessageStatus.test.tsx` (4 estados, aria-label, nada em inbound),
  `DateSeparator.test.tsx` (texto + centralização), `formatMessageTime` em
  `formatters.test.ts` (`HH:MM`, entrada inválida → `'—'`).

## Validação visual (checklist da spec §23)

Rodar `chrome-devtools` MCP contra a tela real (Docker de pé) e comparar com as
imagens de referência: fundo, alinhamento esquerda/direita, cor das bolhas,
padding, hora dentro da bolha, status, pill "domingo", áudio, documento,
composer pill, Enviar fixo, scroll só na lista, responsividade (`sm`/`lg`).

## Fora de escopo (YAGNI)

- Seletor de emoji (não existe no app).
- Busca por clique na trilha de áudio.
- Duplo-check "lido" com dado real (exige `providerMessageId` + assinar
  `messages.update` no `BaileysProvider`).
- Troca de wallpaper pelo usuário (estrutura já permite; UI não é pedida).
- Qualquer mudança em `apps/api`.
