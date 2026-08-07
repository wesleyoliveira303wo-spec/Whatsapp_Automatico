---
tags: [skill, obsidian, cli, terminal, claude]
source: https://github.com/kepano/obsidian-skills
---

# Skill: Obsidian CLI

Interagir com vaults via Obsidian CLI, incluindo desenvolvimento de plugins e themes.

## Sintaxe Basica

```bash
obsidian <comando> [parametros]
```

Parametros aceitam `=`. Para multilinha, use `\n` e `\t`.

## Alvos

- `file=` -- resolve como wikilink
- `path=` -- caminho exato do cofre
- Sem `file=` ou `path=`, usa o arquivo ativo
- `vault=` como primeiro parametro especifica o cofre

## Comandos Comuns

### Operacoes de Arquivo

- `obsidian help` -- lista todos os comandos
- `obsidian read` -- le arquivo
- `obsidian create` -- cria nota (com `template` e `silent`)
- `obsidian append` -- adiciona conteudo ao final
- `obsidian property:set` -- define propriedade

### Busca e Referencias

- `obsidian search` -- busca no vault
- `obsidian tags` -- lista tags
- `obsidian backlinks` -- mostra backlinks

### Daily Notes

- `obsidian daily:read` -- le daily note
- `obsidian daily:append` -- adiciona ao daily note

### Tarefas

- `obsidian tasks` -- gerencia tarefas

## Desenvolvimento de Plugins

### Reload

```bash
obsidian plugin:reload id=meu-plugin
```

### Debug

- `obsidian dev:errors` -- verifica erros
- `obsidian dev:screenshot` -- captura tela
- `obsidian dev:dom` -- inspecao visual do DOM
- `obsidian dev:console` -- saida do console

### Outros

- `obsidian dev:css` -- verifica CSS
- `obsidian dev:mobile` -- emulacao mobile
- `obsidian eval` -- executa JavaScript

## Exemplos

```bash
# Criar nota com template
obsidian create file="Nova Nota" template="Templates/Padrão.md"

# Definir propriedade
obsidian property:set file="Nota" key="status" value="ativo"

# Recarregar plugin
obsidian plugin:reload id=dataview

# Ver erros de desenvolvimento
obsidian dev:errors
```
