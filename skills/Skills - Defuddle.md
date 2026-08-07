---
tags: [skill, obsidian, defuddle, web, claude]
source: https://github.com/kepano/obsidian-skills
---

# Skill: Defuddle

Extrator de conteudo web que remove "clutter" (navegacao, anuncios, etc.) e converte para Markdown limpo. Reduz uso de tokens ao extrair conteudo web.

## Uso

```bash
defuddle parse <url> --md
```

## Flags

- `--md` -- retorna Markdown limpo
- `--json` -- retorna HTML + Markdown
- `-p <propriedade>` -- extrai metadados especificos (title, description, domain)

## Quando Usar

- **Preferir Defuddle** para paginas web padrao (artigos, blogs, docs)
- **Nao usar** para URLs terminando em `.md` (use Read direto)
- **Vantagem:** remove navegacao, anuncios, cookie banners -- reduz tokens em ate 80%

## Exemplo

```bash
# Extrai artigo como Markdown limpo
defuddle parse https://example.com/artigo --md

# Extrai com metadados
defuddle parse https://example.com/artigo --md -p title,description

# JSON para processamento programatico
defuddle parse https://example.com/artigo --json
```

## Fluxo de Trabalho Tipico

1. Usuário fornece URL
2. Defuddle extrai conteudo limpo
3. Claude processa conteudo (mais barato/menos tokens)
4. Resultado salvo em Obsidian (se necessario)
