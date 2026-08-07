---
tags: [skill, obsidian, canvas, visual, claude]
source: https://github.com/kepano/obsidian-skills
---

# Skill: JSON Canvas

Criar e editar arquivos JSON Canvas com nodes, edges, groups e connections.

## Estrutura Base

Segue a **JSON Canvas Spec 1.0**. Os arrays principais sao `nodes` e `edges`.

## Tipos de Nos

| Tipo  | Atributo Obrigatorio | Exemplo            |
| ----- | -------------------- | ------------------ |
| text  | `text`               | Notas com Markdown |
| file  | `file`               | Arquivos locais    |
| link  | `url`                | URLs externas      |
| group | --                   | Container visual   |

## Conexoes (Edges)

Atributos essenciais: `fromNode`, `toNode`, `id`
Opcionais: `fromSide`, `toSide`, `label`

Exemplo de edge:

```json
{
  "id": "edge-1",
  "fromNode": "node-a",
  "toNode": "node-b",
  "fromSide": "right",
  "toSide": "left",
  "label": "relacao"
}
```

## Validacao

- IDs unicos de 16 caracteres hex
- Referencias de edges devem existir
- JSON valido obrigatorio

## Exemplo Estrutura

```json
{
  "nodes": [
    {
      "id": "node-1",
      "type": "text",
      "text": "## Ideia Principal",
      "x": -150,
      "y": -150,
      "width": 400,
      "height": 200
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "fromNode": "node-1",
      "toNode": "node-2"
    }
  ]
}
```
