---
tags: [skill, obsidian, bases, database, claude]
source: https://github.com/kepano/obsidian-skills
---

# Skill: Obsidian Bases

Criar e editar bases de dados no Obsidian com views, filtros, formulas e summaries.

## Estrutura

Arquivos `.base` usam YAML para configurar visualizacoes database-like.

## Filtros

Operadores: `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `!`

Pode aninhar com: `and`, `or`, `not`

## Tipos de Propriedades

| Tipo               | Fonte                 | Exemplo                      |
| ------------------ | --------------------- | ---------------------------- |
| Note properties    | Frontmatter das notas | `title`, `tags`, `status`    |
| File properties    | Metadados do arquivo  | `file.name`, `file.mtime`    |
| Formula properties | Calculos              | `formula.dias_desde_criacao` |

## Formulas

Funcoes disponiveis:

- `date()`, `now()`, `today()` -- manipulacao de datas
- `if()` -- condicionais
- Aritmetica e operacoes de string

> **IMPORTANTE:** Subtrair datas retorna um Duration. Acesse campos como `.days` antes de operacoes numericas. Duration NAO suporta `.round()`, `.floor()`, `.ceil()` diretamente.

Exemplo correto:

```
(now() - file.ctime).days
```

Exemplo INCORRETO:

```
(now() - file.ctime).round(0)  -- NAO FUNCIONA
```

## Tipos de View

| View    | Uso                     |
| ------- | ----------------------- |
| `table` | Dados em colunas        |
| `cards` | Layout de galeria/grid  |
| `list`  | Itens enumerados        |
| `map`   | Visualizacao geografica |

## Regras de Quoting YAML

- Use **single quotes** para formulas contendo double quotes
- Use **double quotes** para strings simples
- Caracteres especiais (`:`, `{`, `[`, etc.) precisam de quotes

## Armadilhas Comuns

- Caracteres especiais sem quotes
- Matematica de Duration sem acessar campo (ex: `.days`)
- `if()` faltando para propriedades potencialmente vazias
- Referenciar `formula.X` sem definir `X` na secao `formulas`
