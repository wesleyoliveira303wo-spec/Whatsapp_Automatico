---
tags:
  - ruflo
  - adr
  - architecture
created: 2026-06-26
---

# ADRs e Decisões Técnicas do Ruflo

O Ruflo usa Architecture Decision Records (ADRs) para documentar decisões arquiteturais. Abaixo os principais ADRs identificados:

| ADR         | Título                              | Descrição                                   |
| ----------- | ----------------------------------- | ------------------------------------------- |
| ADR-004     | Microkernel Plugin Architecture     | Sistema de plugins com extension points     |
| ADR-005     | MCP-first API Design                | Todas as APIs expostas via MCP              |
| ADR-026     | 3-Tier Model Routing                | Codemod ($0) → Haiku → Sonnet/Opus          |
| ADR-033     | RuVocal WASM MCP Integration        | Web UI com WASM tool gallery                |
| ADR-097     | Federation Budget + Circuit Breaker | Budget por peer, falhas → SUSPENDED/EVICTED |
| ADR-104     | WSS Transport + Multiplexing        | WebSocket Secure com compressão e multiplex |
| ADR-105     | Federation State Snapshot           | Snapshot de estado da federação             |
| ADR-106     | Peer Discovery                      | Descoberta entre peers                      |
| ADR-107     | TLS + Cert Pinning                  | Segurança de transporte                     |
| ADR-109     | Inbound Dispatcher                  | Dispatcher de mensagens inbound             |
| ADR-110     | MemorySpendReporter                 | Reporte de gasto de memória                 |
| ADR-111     | WireGuard Mesh                      | Camada L3 opcional para federação           |
| ADR-123     | Graph Intelligence                  | Raciocínio em grafos sublinear              |
| ADR-143     | Agent Booster                       | Motor de merge rápido para snippets LLM     |
| ADR-147/148 | Arena / Roteamento                  | Torneios de estratégias, MAP-Elites         |
| ADR-150     | MetaHarness Integration             | Integração com MetaHarness                  |
| ADR-152     | Structural Distance                 | Similaridade entre genomas                  |
| ADR-153     | Bench Suites                        | Suites de benchmark para evolve             |

Os ADRs estão documentados em `v3/docs/adr/` e `plugins/ruflo-adr/`.
