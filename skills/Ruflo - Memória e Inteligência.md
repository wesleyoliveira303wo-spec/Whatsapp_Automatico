---
tags:
  - ruflo
  - memory
  - intelligence
  - learning
created: 2026-06-26
---

# Memória e Inteligência no Ruflo

## Pipeline de Inteligência (4 Etapas)

```
1. RETRIEVE  ──→ 2. JUDGE  ──→ 3. DISTILL  ──→ 4. CONSOLIDATE
   (HNSW)        (Verdicts)     (LoRA)          (EWC++)
```

## Componentes de Memória

| Componente          | Descrição                                                        |
| ------------------- | ---------------------------------------------------------------- |
| **AgentDB**         | Banco vetorial proprietário com índices HNSW                     |
| **SQLite (sql.js)** | Cache persistente cross-platform (WASM, sem compilação nativa)   |
| **ONNX Embeddings** | all-MiniLM-L6-v2, 384 dimensões                                  |
| **SONA**            | Self-Optimizing Neural Architecture — 0.0043ms/adaptação         |
| **MoE**             | Mixture of Experts — 8 experts, gate converge 0.13→0.88          |
| **RVF**             | Formato portátil de memória RuVector                             |
| **HNSW**            | Busca ~1.9x em N=20k, ~3.2x-4.7x em N=5k vs brute force          |
| **ReasoningBank**   | Armazenamento de padrões com persistência em arquivo             |
| **Flash Attention** | 2.49x-7.47x (NÃO VERIFICADO — sem benchmark)                     |
| **EWC++**           | Elastic Weight Consolidation — previne esquecimento catastrófico |

## Benchmarks do Sistema de Inteligência

| Métrica             | Medido                                            | Status     |
| ------------------- | ------------------------------------------------- | ---------- |
| HNSW Search         | ~1.9x (N=20k), ~3.2x-4.7x (N=5k), recall@10 ~0.99 | **Medido** |
| Int8 Quantization   | 3.84x compressão, cosine reconstrução 0.99999     | **Medido** |
| RaBitQ Quantization | 32x compressão, 0.60ms/query (14.760 vetores)     | **Medido** |
| SONA Adaptation     | 0.0043ms/adapt (target <0.05ms)                   | **Medido** |
| MoE Gate            | confidence 0.13→0.88, Q 0→99.8 após rewards       | **Medido** |
| MCP Response        | <100ms                                            | target     |
| CLI Startup         | <500ms                                            | target     |

## BEIR Retrieval Benchmarks

| Dataset              | Melhor ruflo (nDCG@10) | Rank     | vs SOTA         |
| -------------------- | ---------------------- | -------- | --------------- |
| NFCorpus             | 0.358                  | 2/11     | BGE-large 0.380 |
| SciFact              | 0.683                  | 3/11     | BGE-large 0.722 |
| ArguAna              | 0.432                  | 5/11     | BGE-large 0.636 |
| SciDocs              | 0.211                  | 2/11     | BGE-large 0.225 |
| **Média 4 datasets** | **0.421**              | **3/11** | BGE-large 0.491 |

**Destaque**: Modelo base 110M vs BGE-large 335M e GTR-XL 1.2B. Rank 3 de 11 na média.

## Bridge de Memória (Claude Code ↔ AgentDB)

Claude Code usa `memory_search` (busca semântica), `memory_store` (armazenamento), `memory_retrieve` (chave exata) e `neural_train` (treinamento). A Ponte de Memória importa automaticamente as memórias do Claude Code para o AgentDB com embeddings ONNX a cada início de sessão.

### Ferramentas MCP de Memória

| Tool                    | Descrição                                    |
| ----------------------- | -------------------------------------------- |
| `memory_import_claude`  | Importa memórias do Claude Code para AgentDB |
| `memory_bridge_status`  | Mostra saúde da bridge                       |
| `memory_search_unified` | Busca semântica em todos os namespaces       |
