---
tags:
  - ruflo
  - architecture
  - agentic-ai
created: 2026-06-26
---

# Arquitetura do Ruflo

## Diagrama de Alto Nível

```
User --> Ruflo (CLI/MCP) --> Router --> Swarm --> Agents --> Memory --> LLM Providers
                          ^                           |
                          +---- Learning Loop <-------+
```

## Stack Tecnológica

- **Runtime**: Node.js (v20+), TypeScript
- **CLI**: 26 comandos, 140+ subcomandos via `npx ruflo`
- **MCP Server**: Implementação própria como servidor MCP (Model Context Protocol)
- **Banco de Dados**: SQLite (sql.js WASM) + AgentDB (vetorial HNSW)
- **Embeddings**: ONNX (all-MiniLM-L6-v2, 384 dimensões)
- **Provedores de IA**: Claude, GPT, Gemini, Cohere, Ollama (smart routing)
- **Publicação**: IPFS via Pinata (registry de plugins descentralizado)
- **Frontend Web**: Docker (ruvocal) com MongoDB embutido

## Camadas

```
User --> Claude Code / CLI
          |
          v
    Orchestration Layer
    (MCP Server, Router, 27 Hooks)
          |
          v
    Swarm Coordination
    (Queen, Topology, Consensus)
          |
          v
    100+ Specialized Agents
    (coder, tester, reviewer, architect, security...)
          |
          v
    Memory & Learning
    (AgentDB, HNSW, SONA, ReasoningBank)
          |
          v
    LLM Providers
    (Claude, GPT, Gemini, Cohere, Ollama)
```

## Pacotes Principais (v3)

| Pacote                  | Caminho                     | Propósito                            |
| ----------------------- | --------------------------- | ------------------------------------ |
| `@claude-flow/cli`      | `v3/@claude-flow/cli/`      | Entry point CLI (26 comandos)        |
| `@claude-flow/codex`    | `v3/@claude-flow/codex/`    | Colaboração dual-mode Claude + Codex |
| `@claude-flow/guidance` | `v3/@claude-flow/guidance/` | Plano de controle de governança      |
| `@claude-flow/hooks`    | `v3/@claude-flow/hooks/`    | 17 hooks + 12 workers                |
| `@claude-flow/memory`   | `v3/@claude-flow/memory/`   | AgentDB + busca HNSW                 |
| `@claude-flow/security` | `v3/@claude-flow/security/` | Validação de input, remediação CVE   |

## Estrutura de Diretórios

```
ruflo/
├── .claude/          # Config Claude Code (agentes, hooks, comandos, skills)
├── .agents/          # Definições de agentes e skills
├── bin/              # Scripts de entrada
├── data/             # Dados (memória, registries)
├── docs/             # Documentação detalhada
├── plugin/           # Plugin raiz para Claude Code
├── plugins/          # 35 plugins nativos (ruflo-core, ruflo-swarm, etc.)
├── ruflo/            # Wrapper npm ruflo (depende de @claude-flow/cli)
├── scripts/          # Scripts utilitários e benchmarks
├── tests/            # Testes
├── v3/               # Código-fonte v3 (CLI, MCP, agents, goal_ui, crates)
└── verification/     # Verificação criptográfica de integridade
```
