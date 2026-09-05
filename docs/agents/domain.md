# Documentos de domínio

Como as skills de engenharia devem consumir a documentação de domínio deste
repositório ao explorar o código.

## Antes de explorar, leia

- **`CONTEXT.md`** na raiz do repositório (glossário de termos do domínio),
  quando existir.
- **`docs/adr/`**: leia os ADRs que tocam a área em que você vai trabalhar.
- **Neste projeto especificamente**: enquanto `CONTEXT.md` / `docs/adr/` ainda
  não existem, o papel deles é cumprido por:
  - **`CLAUDE.md` §18 ("Memória do Projeto")** — decisões arquiteturais,
    padrões adotados/descartados, lições aprendidas.
  - **`DECISIONS.md`** — o registro numerado de ADRs (ADR #1, #2, …).
  - **`PROJECT_STATUS.md`, `ROADMAP.md`, `ARCHITECTURE.md`** — estado atual,
    roadmap e visão de arquitetura.

Se algum desses arquivos não existir, **siga em silêncio**. Não sinalize a
ausência; não sugira criar de forma proativa. A skill `/domain-modeling` cria
esses arquivos de forma preguiçosa, quando um termo ou decisão é de fato
resolvido durante o trabalho.

## Layout: single-context

Um `CONTEXT.md` + `docs/adr/` na raiz. É um monorepo (`apps/api`,
`apps/dashboard`, `packages/*`), mas o conhecimento é centralizado (não há um
`CONTEXT.md` por serviço). Os bounded contexts do backend vivem em
`apps/api/src/services/*` (auth, ai, conversations, campaigns, contacts, tags,
quickReplies, analytics, whatsapp).

## Use o vocabulário do glossário

Quando sua saída nomear um conceito de domínio (título de issue, proposta de
refatoração, hipótese, nome de teste), use o termo como definido em
`CONTEXT.md` / `CLAUDE.md`. Não migre para sinônimos que o glossário
explicitamente evita.

Se o conceito que você precisa ainda não está no glossário, isso é um sinal:
ou você está inventando uma linguagem que o projeto não usa (reconsidere), ou
há uma lacuna real (anote para `/domain-modeling`).

## Sinalize conflitos com ADR

Se sua saída contradiz um ADR existente (em `DECISIONS.md`), traga isso à tona
explicitamente em vez de sobrescrever em silêncio:

> _Contradiz o ADR #7 (…), mas vale reabrir porque…_
