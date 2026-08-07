---
tags:
  - ruflo
  - cli
  - commands
created: 2026-06-26
---

# CLI e Comandos do Ruflo

## Instalação

```bash
# CLI install (produção)
npx ruflo@latest init
npm install -g ruflo@latest

# Claude Code plugin (lite, só slash commands)
/plugin marketplace add ruvnet/ruflo
/plugin install ruflo-core@ruflo
```

## Comandos Core (26 comandos, 140+ subcomandos)

| Comando     | Subcomandos | Descrição                                                                        |
| ----------- | ----------- | -------------------------------------------------------------------------------- |
| `init`      | 4           | Inicialização com wizard, presets, skills, hooks                                 |
| `agent`     | 8           | Ciclo de vida do agente (spawn, list, status, stop, metrics, pool, health, logs) |
| `swarm`     | 6           | Coordenação multi-agente                                                         |
| `memory`    | 11          | AgentDB com busca HNSW                                                           |
| `mcp`       | 9           | Gerenciamento de servidor MCP                                                    |
| `task`      | 6           | Criação e ciclo de vida de tarefas                                               |
| `session`   | 7           | Gerenciamento de estado de sessão                                                |
| `config`    | 7           | Gerenciamento de configuração                                                    |
| `status`    | 3           | Monitoramento de status                                                          |
| `start`     | 3           | Inicialização de serviços                                                        |
| `workflow`  | 6           | Execução e templates de workflow                                                 |
| `hooks`     | 17          | Hooks auto-aprendizáveis + 12 workers                                            |
| `hive-mind` | 6           | Consenso Byzantine fault-tolerant                                                |

## Comandos Avançados

| Comando       | Subcomandos | Descrição                      |
| ------------- | ----------- | ------------------------------ |
| `daemon`      | 5           | Worker daemon em background    |
| `neural`      | 5           | Treinamento de padrões neurais |
| `security`    | 6           | Scan de segurança              |
| `performance` | 5           | Profiling de performance       |
| `providers`   | 5           | Provedores de IA               |
| `plugins`     | 5           | Gerenciamento de plugins       |
| `deployment`  | 5           | Gerenciamento de deploy        |
| `embeddings`  | 4           | Embeddings vetoriais           |
| `claims`      | 4           | Autorização baseada em claims  |
| `migrate`     | 5           | Migração V2 para V3            |
| `doctor`      | 1           | Diagnóstico do sistema         |
| `completions` | 4           | Completions de shell           |

## MCP Server

```bash
claude mcp add ruflo -- npx ruflo@latest mcp start
```

## Environment Variables

```bash
CLAUDE_FLOW_CONFIG=./claude-flow.config.json
CLAUDE_FLOW_LOG_LEVEL=info
CLAUDE_FLOW_MEMORY_BACKEND=hybrid
CLAUDE_FLOW_MEMORY_PATH=./data/memory
CLAUDE_FLOW_MCP_PORT=3000
CLAUDE_FLOW_MCP_HOST=localhost
CLAUDE_FLOW_MCP_TRANSPORT=stdio
CLAUDE_FLOW_ENCRYPT_AT_REST=1  # AES-256-GCM opcional
```

## Publicação npm

```bash
# Publicar os 3 pacotes na ordem
cd v3/@claude-flow/cli
npm version 3.7.1 --no-git-tag-version
npm run build && npm publish

cd /repo-root
npm version 3.7.1 --no-git-tag-version
npm publish

cd ruflo
npm version 3.7.1 --no-git-tag-version
npm publish
```
