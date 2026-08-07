---
tags:
  - ruflo
  - web-ui
  - goal-planner
  - frontend
created: 2026-06-26
---

# Web UI e Goal Planner do Ruflo

## Web UI (Beta) — flo.ruv.io

Chat multi-modelo com suporte nativo a MCP (Model Context Protocol).

### Características

| Recurso                 | Descrição                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Modelos**             | 6 modelos curated: Qwen 3.6 Max, Claude Sonnet 4.6, Claude Haiku 4.5, Gemini 2.5 Pro, Gemini 2.5 Flash, OpenAI |
| **Modelos locais**      | Suporta ruvLLM (self-learning), Ollama, LM Studio, vLLM, Together, Groq                                        |
| **Ferramentas**         | ~210 MCP tools prontas + galeria WASM de 18 ferramentas (funciona offline)                                     |
| **MCP customizado**     | Adicione qualquer servidor MCP (HTTP, SSE, stdio)                                                              |
| **Execução paralela**   | Tools rodam em paralelo — badge "Step 1 — 2 tools completed"                                                   |
| **Memória persistente** | AgentDB + HNSW — "lembre que minha cor favorita é índigo" funciona entre sessões                               |
| **Self-hosted**         | Docker em `ruflo/src/ruvocal/Dockerfile` com MongoDB embutido                                                  |
| **Deploy**              | GCP Cloud Run, Fly, Kubernetes, docker-compose                                                                 |

### Como Usar

1. Abra https://flo.ruv.io/
2. Escolha um modelo
3. Comece a conversar — sem cadastro, sem API key

## Goal Planner UI — goal.ruv.io

Transforma metas em planos executáveis de agentes usando GOAP (Goal-Oriented Action Planning).

### Características

| Recurso                          | Descrição                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| **Metas em português**           | Diga "ship the auth refactor with tests and a PR" e o planner extrai critérios de sucesso    |
| **GOAP A\* Planner**             | Planejador clássico de game-AI: busca no espaço de estados com pré-condições/efeitos         |
| **Dashboard de agentes**         | goal.ruv.io/agents mostra cada agente — papel, passo atual, orçamento, status                |
| **Árvore visual**                | Metas como árvores colapsáveis com progresso, branches bloqueados, rollbacks                 |
| **Replanejamento adaptativo**    | Quando uma ação falha, re-roda A\* a partir do estado atual                                  |
| **Memória compartilhada + SONA** | Planos e trajetórias vão para o AgentDB para aprendizado futuro                              |
| **Integração MCP**               | Cada nó de ação mapeia para uma tool call (~210 MCP tools nativas + servidores customizados) |

### Como Usar

- **goal.ruv.io** — para criar e visualizar metas
- **goal.ruv.io/agents** — para ver agentes ativos

### Código-fonte

- Web UI: `ruflo/src/ruvocal/` (Docker + multi-stage)
- Goal UI: `v3/goal_ui/` (Vite + Supabase, self-hostable)
