---
tags:
  - ruflo
  - plugins
  - ecosystem
created: 2026-06-26
---

# Plugins do Ruflo

O Ruflo possui **35 plugins nativos** e **20+ plugins npm opcionais**. São distribuídos via IPFS/Pinata (registry descentralizado).

## Instalação

```bash
# Via Claude Code plugin
/plugin marketplace add ruvnet/ruflo
/plugin install ruflo-core@ruflo

# Via CLI
npx ruflo@latest plugins install @claude-flow/plugin-name
```

## Lista Completa de Plugins Nativos

### Core & Orquestração

| Plugin                 | Descrição                                                 |
| ---------------------- | --------------------------------------------------------- |
| **ruflo-core**         | Fundação — servidor, health checks, descoberta de plugins |
| **ruflo-swarm**        | Coordenação de múltiplos agentes como equipe              |
| **ruflo-autopilot**    | Agentes autônomos em loop                                 |
| **ruflo-loop-workers** | Tarefas agendadas em background                           |
| **ruflo-workflows**    | Templates de tarefas multi-passo reutilizáveis            |
| **ruflo-federation**   | Colaboração entre agentes em máquinas diferentes          |

### Memória & Conhecimento

| Plugin                    | Descrição                                                  |
| ------------------------- | ---------------------------------------------------------- |
| **ruflo-agentdb**         | Banco vetorial rápido para memória de agente               |
| **ruflo-rag-memory**      | Retrieval inteligente — busca híbrida, graph hops, ranking |
| **ruflo-rvf**             | Salvar e restaurar memória entre sessões                   |
| **ruflo-ruvector**        | GPU-accelerated search, Graph RAG, 103 ferramentas         |
| **ruflo-knowledge-graph** | Mapas de relacionamento entre entidades                    |

### Inteligência & Aprendizado

| Plugin                       | Descrição                                                |
| ---------------------------- | -------------------------------------------------------- |
| **ruflo-intelligence**       | Agentes aprendem com sucessos passados                   |
| **ruflo-graph-intelligence** | Raciocínio em grafos sublinear (PageRank, delta updates) |
| **ruflo-daa**                | Comportamento dinâmico de agentes e padrões cognitivos   |
| **ruflo-ruvllm**             | LLMs locais (Ollama, etc.) com roteamento inteligente    |
| **ruflo-goals**              | Decompor metas em planos e acompanhar progresso          |

### Qualidade & Testes

| Plugin            | Descrição                                                    |
| ----------------- | ------------------------------------------------------------ |
| **ruflo-testgen** | Encontrar testes faltantes e gerar automaticamente           |
| **ruflo-browser** | Automação de testes com Playwright                           |
| **ruflo-jujutsu** | Análise de git diff, scoring de risco, sugestão de revisores |
| **ruflo-docs**    | Gerar e manter documentação automaticamente                  |

### Segurança & Compliance

| Plugin                   | Descrição                                                |
| ------------------------ | -------------------------------------------------------- |
| **ruflo-security-audit** | Scan de vulnerabilidades e CVEs                          |
| **ruflo-aidefence**      | Bloquear prompt injection, detectar PII, safety scanning |

### Arquitetura & Metodologia

| Plugin                | Descrição                                              |
| --------------------- | ------------------------------------------------------ |
| **ruflo-adr**         | Rastrear decisões de arquitetura                       |
| **ruflo-ddd**         | Scaffold domain-driven design                          |
| **ruflo-sparc**       | Metodologia de desenvolvimento guiada em 5 fases       |
| **ruflo-metaharness** | Auditar setup de agente, escanear configs de segurança |
| **ruflo-arena**       | Competição de estratégias de agente em torneios        |

### DevOps & Observabilidade

| Plugin                  | Descrição                                  |
| ----------------------- | ------------------------------------------ |
| **ruflo-migrations**    | Gerenciar mudanças de schema de banco      |
| **ruflo-observability** | Logs, traces e métricas estruturados       |
| **ruflo-cost-tracker**  | Rastrear uso de tokens, definir orçamentos |

### Extensibilidade

| Plugin                   | Descrição                                                            |
| ------------------------ | -------------------------------------------------------------------- |
| **ruflo-agent**          | Rodar agentes — sandbox WASM local (rvagent) + Claude Managed Agents |
| **ruflo-plugin-creator** | Scaffold, validar e publicar seus próprios plugins                   |

### Domínio Específico

| Plugin                  | Descrição                                           |
| ----------------------- | --------------------------------------------------- |
| **ruflo-iot-cognitum**  | Gerenciamento de dispositivos IoT                   |
| **ruflo-neural-trader** | Trading com IA (4 agentes, backtesting, 112+ tools) |
| **ruflo-market-data**   | Ingestão de dados de mercado, vetorização OHLCV     |
