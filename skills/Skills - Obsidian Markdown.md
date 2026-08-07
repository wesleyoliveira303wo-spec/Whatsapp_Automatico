---
tags: [skill, obsidian, markdown, claude]
source: https://github.com/kepano/obsidian-skills
---

# Skill: Obsidian Markdown

Como criar e editar Obsidian Flavored Markdown com wikilinks, embeds, callouts e properties.

## Wikilinks

- `[[Nota]]` -- link para outra nota
- `[[Nota|Texto]]` -- link com texto personalizado
- `[[Nota#Cabeçalho]]` -- link para secao
- `[[Nota#^bloco]]` -- link para bloco especifico

## Embeds

- `![[Nota]]` -- embed de outra nota
- `![[imagem.png|300]]` -- embed de imagem com largura
- `![[doc.pdf#page=3]]` -- embed de PDF pagina 3

## Callouts

```markdown
> [!note] Titulo opcional
> Conteudo do callout

> [!warning]- Titulo
> Callout dobravel
```

Tipos: `note`, `warning`, `tip`, `info`, `danger`, `success`, `question`, `quote`, `example`

## Propriedades (Frontmatter)

```yaml
---
title: Titulo da Nota
tags: [tag1, tag2]
aliases: ['Outro nome']
cssclasses: [classe-customizada]
---
```

## Outros elementos

- **Tags inline:** `#tag`, `#aninhada/tag`
- **Comentarios:** `%%texto oculto%%`
- **Destaque:** `==texto destacado==`
- **Matematica:** `$...$` (inline), `$$...$$` (bloco)
- **Diagramas:** blocos `mermaid`

## Workflow de criacao

1. Adicionar frontmatter com metadados
2. Escrever conteudo em Markdown
3. Vincular notas com `[[wikilinks]]` (notas internas) ou `[texto](url)` (externas)
4. Incorporar conteudo com `![[]]`
5. Adicionar callouts para destacar informacoes

> **Dica:** Use `[[wikilinks]]` para notas dentro do vault e `[texto](url)` para URLs externas.
