# BRAND.md — Identidade da marca (v1)

> **Idioma:** Português (Brasil), conforme política oficial do projeto (`CLAUDE.md`).
> **Status:** Marca **v1 — iterável**. Deliberadamente NÃO definitiva: marca é decisão de negócio ainda em validação, separada do Design System técnico (ADR #63). Este documento descreve a identidade verbal e visual atual; espera-se que evolua.
> **Fonte de verdade em código:** `apps/dashboard/lib/brand.ts`. Nenhum componente contém strings de marca hardcoded — mudou aqui, muda em `lib/brand.ts`, e a UI inteira acompanha.

---

## 1. Nome

**Francis.**

Referência ao nome do fundador (Wesley **Francis**). Escolhido após checagem informal de disponibilidade: nenhum concorrente direto de CRM/automação de WhatsApp no Brasil usa o nome (o campo é dominado por nomes descritivos — HelenaCRM é a exceção que usa a mesma lógica de nome-personagem). Fora do nicho existem outros "Francis" (fintech, câmara de comércio nos EUA) — sem conflito de mercado, mas o domínio `.com` puro provavelmente está ocupado; mirar `francis.app`/`usefrancis.com`/`franciscrm.com.br`. Checagem informal, não parecer jurídico — validar no INPI antes de registrar.

Product-name (`BRAND.name`) e assistant-name (`BRAND.assistantName`) são hoje iguais ("Francis"), mas ficam separados em código de propósito: o Francis funciona como **personagem** — o cliente final "fala com o Francis", o operador "supervisiona o Francis" pela Dashboard.

## 2. Tagline

**"Seu melhor atendente, no automático."**

Posiciona o produto como um atendente (pessoa), não como um software frio. Reforça o enquadramento de personagem.

## 3. Personalidade

**Prestativo, direto e transparente.**

O Francis resolve rápido, fala como gente (não como robô nem como manual), nunca inventa resposta e, quando não sabe, admite e passa para um humano sem enrolar — o "bom atendente": eficiente sem ser frio, simpático sem ser bajulador. Isso conversa com o comportamento real já implementado (anti-alucinação, aviso educado antes de escalar, escalonamento para humano) e serve de base para o tom do system prompt da IA.

## 4. Símbolo

Balão de conversa com um check dentro (`components/brand/FrancisLogo.tsx`). Comunica os dois lados do produto num traço só: **conversa** (o balão) que **dá certo** (o check = atendimento resolvido). Evita o balãozinho genérico puro, comum no nicho.

- **Logo (símbolo):** `FrancisLogo` — quadrado arredondado na cor de marca, glifo balão+check.
- **Wordmark (símbolo + nome):** `FrancisWordmark` — usado em cabeçalhos (Sidebar, login); opção `showTagline` para a tela de login.

## 5. Cor

Primária **verde-teal escuro** (HSL `163 94% 24%`, ≈ `#047857`) — trocada do azul original (`#0A74DA`, HSL `209 91% 45%`, em uso desde a Milestone 3) no Redesign de 2026-08-05, aproximando a identidade da linguagem visual de apps de mensageria (WhatsApp/Telegram). Consumida via token `primary` do Design System (ver `DESIGN_SYSTEM.md` §2). A marca NÃO introduz cor nova além do token — trocar de novo no futuro é mudar o token, não os componentes. Distinta em matiz de `--success` (142°) de propósito: mesmo os dois sendo "verdes", nunca são a mesma cor lado a lado, e o contrato de cor por status (`PRODUCT_PRINCIPLES.md` §2.3) segue exigindo ícone/rótulo, nunca só a cor.

## 6. Aplicação atual (M6B)

| Onde             | O quê                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Sidebar          | Wordmark no topo, com link para `/`                                    |
| Tela de login    | Wordmark grande + tagline, acima do formulário                         |
| Aba do navegador | `<title>` por página no padrão "Página · Francis" (helper `pageTitle`) |
| Idioma do HTML   | `lang="pt-BR"` em `_document.tsx`                                      |

## 7. O que ainda NÃO existe (adiado de propósito)

| Item                                                           | Motivo / quando                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Favicon, apple-touch-icon, PNGs de ícone                       | Adiado (decisão do usuário): marca v1 iterável, começar só com SVG. Entra num bloco futuro do M6. |
| Identidade v2 (marca definitiva)                               | Depende de validação de negócio; fora do escopo técnico do Design System (ADR #63).               |
| Manual de marca extenso (usos, margens, versões mono/negativa) | Quando a marca estabilizar.                                                                       |

---

## 8. Referências

- `apps/dashboard/lib/brand.ts` — fonte de verdade em código.
- `DESIGN_SYSTEM.md` — tokens/cor/tipografia (o "como" técnico).
- `PRODUCT_PRINCIPLES.md` — regras de experiência (o "porquê").
- `DECISIONS.md` — ADR de marca v1 (M6B) e ADR #63 (marca ≠ Design System).

---

_Marca v1. Este documento evolui junto com a marca — atualizar a cada mudança de nome, tagline, símbolo ou cor._
