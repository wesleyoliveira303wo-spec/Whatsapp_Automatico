---
tags:
  - ruflo
  - metaharness
  - benchmarks
  - testing
created: 2026-06-26
---

# MetaHarness e Benchmarks do Ruflo

## MetaHarness

Sistema irmão de análise de harnesses de agentes. Permite auditar, pontuar e detectar regressões no setup de agentes.

### Comandos CLI

```bash
npx ruflo metaharness score           # Scorecard de prontidão (5 dimensões)
npx ruflo metaharness genome          # Relatório categórico (7 seções)
npx ruflo metaharness mcp-scan        # Scan estático de segurança
npx ruflo metaharness threat-model    # Relatório de ameaças enterprise
npx ruflo metaharness oia-audit       # Auditoria composta semanal
npx ruflo metaharness audit-list      # Listar registros de auditoria
npx ruflo metaharness audit-trend     # Comparar duas auditorias (drift)
npx ruflo metaharness drift-from-history  # Detecção de drift 1-comando
npx ruflo metaharness similarity      # Similaridade entre genomas
npx ruflo eject --name my-harness     # Lift de projeto ruflo → harness standalone
```

### Ferramentas MCP

`metaharness_score`, `metaharness_genome`, `metaharness_mcp_scan`, `metaharness_threat_model`, `metaharness_oia_audit`, `metaharness_audit_list`, `metaharness_audit_trend`, `metaharness_similarity`, `metaharness_drift_from_history`, `metaharness_bench`, `metaharness_evolve`, `metaharness_security_bench`

## Benchmarks vs Concorrentes (SOTA)

Ruflo v3.8.0 vs LangGraph / AutoGen / CrewAI em darwin-arm64 + linux-x64:

- Ruflo vence em **cold start**, **single turn**, **RSS** por **1.3×–1953×**

## Baseline de Testes

- **1.999 testes passando** | 46 intencionalmente ignorados
- **366 testes** no plugin de federação
- **45 vulnerabilidades** npm audit no CLI (1 critical protobufjs, 25 high)
- **0 vulnerabilidades** em caminhos de produção
- **117 entradas** no manifesto de testemunha (witness), 0 drifted

## Verificação Criptográfica

```bash
ruflo verify  # Comprova que os bytes instalados batem com a testemunha assinada
```

Sistema de verificação em 3 camadas com assinatura criptográfica Ed25519.

## Otimização de Tokens (Agent Booster)

| Feature                 | Economia de Tokens |
| ----------------------- | ------------------ |
| ReasoningBank retrieval | -32%               |
| Agent Booster edits     | -15%               |
| Cache (95% hit rate)    | -10%               |
| Optimal batch size      | -20%               |
