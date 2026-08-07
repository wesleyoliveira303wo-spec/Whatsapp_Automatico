---
tags:
  - ruflo
  - agents
  - swarm
  - coordination
created: 2026-06-26
---

# Agentes e Swarms no Ruflo

## Filosofia Central

Ruflo (claude-flow) é um **ORQUESTRADOR** que rastreia estado e coordena. O **código executor (Claude Code / Codex)** é quem executa o trabalho real. Esta distinção é fundamental.

> **Fluxo Correto**: 1. LEARN (memory_search) → 2. COORDINATE (swarm_init) → 3. EXECUTE (você escreve o código) → 4. REMEMBER (memory_store)

## Tipos de Agente

### Core (8 tipos nativos)

| Tipo                   | Propósito                |
| ---------------------- | ------------------------ |
| `coordinator`          | Orquestra outros agentes |
| `coder`                | Escreve código           |
| `tester`               | Escreve testes           |
| `reviewer`             | Revisa código            |
| `architect`            | Projeta sistemas         |
| `researcher`           | Analisa requisitos       |
| `security-architect`   | Projeta segurança        |
| `performance-engineer` | Otimiza desempenho       |

### V3 Especializados

`security-auditor`, `memory-specialist`, `perf-analyzer`, `performance-benchmarker`, `task-orchestrator`, `memory-coordinator`, `smart-agent`

### Consenso e Distribuído

`byzantine-coordinator`, `raft-manager`, `gossip-coordinator`, `consensus-builder`, `crdt-synchronizer`, `quorum-manager`, `security-manager`

### GitHub e Repositório

`github-modes`, `pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`, `workflow-automation`, `project-board-sync`, `repo-architect`, `multi-repo-swarm`

### SPARC Methodology

`sparc-coord`, `sparc-coder`, `specification`, `pseudocode`, `architecture`, `refinement`

## Topologias de Swarm

| Topologia           | Caso de Uso                                 |
| ------------------- | ------------------------------------------- |
| `hierarchical`      | Equipes coordenadas, anti-drift (preferida) |
| `mesh`              | Peer-to-peer, agentes iguais                |
| `hierarchical-mesh` | Híbrida (recomendada para V3)               |
| `ring`              | Processamento sequencial                    |
| `star`              | Coordenador central                         |
| `adaptive`          | Switching dinâmico                          |

## Protocolo de Roteamento (Anti-Drift)

| Código | Tarefa      | Agentes                                         |
| ------ | ----------- | ----------------------------------------------- |
| 1      | Bug Fix     | coordinator, researcher, coder, tester          |
| 3      | Feature     | coordinator, architect, coder, tester, reviewer |
| 5      | Refactor    | coordinator, architect, coder, reviewer         |
| 7      | Performance | coordinator, perf-engineer, coder               |
| 9      | Security    | coordinator, security-architect, auditor        |
| 11     | Memory      | coordinator, memory-specialist, perf-engineer   |
| 13     | Docs        | researcher, api-docs                            |

## Pipeline de Comunicação entre Agentes

```
researcher ──SendMessage──→ architect ──SendMessage──→ coder ──SendMessage──→ tester ──SendMessage──→ reviewer
```

Cada agente nomeado sabe para quem enviar mensagem via `SendMessage`.

## Sistema de Hooks (17 Hooks + 12 Workers)

### Categorias

- **Core**: pre-edit, post-edit, pre-command, post-command, pre-task, post-task
- **Session**: session-start, session-end, session-restore, notify
- **Intelligence**: route, explain, pretrain, build-agents, transfer
- **Learning**: trajectory-start, trajectory-step, trajectory-end, pattern-store, pattern-search, stats, attention
- **Agent Teams**: teammate-idle, task-completed

### 12 Workers de Background

ultralearn, optimize, consolidate, predict, audit, map, preload, deepdive, document, refactor, benchmark, testgaps

## Model Routing (3 Tiers)

| Tier | Handler                | Latência | Custo        | Uso                                 |
| ---- | ---------------------- | -------- | ------------ | ----------------------------------- |
| 1    | Codemod determinístico | ~1ms     | $0           | Transformações estruturais sem LLM  |
| 2    | Haiku                  | ~500ms   | $0.0002      | Tarefas simples (<30% complexidade) |
| 3    | Sonnet/Opus            | 2-5s     | $0.003-0.015 | Raciocínio complexo (>30%)          |
