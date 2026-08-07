---
tags:
  - ruflo
  - federation
  - security
created: 2026-06-26
---

# Federação e Segurança no Ruflo

## Federação de Agentes

Permite que duas ou mais instalações do Ruflo (Mac, servidor, laptop) se descubram mutuamente, troquem manifestos assinados e enviem mensagens entre si.

### Mecanismo

| Componente          | Detalhe                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| **Identidade**      | Ed25519 — cada nó tem chave privada; peers trocam manifestos assinados. Sem diretório central. |
| **Transporte**      | WSS com compressão permessage-deflate, multiplexação de stream, TLS cert pinning opcional      |
| **WireGuard Mesh**  | ADR-111: Camada L3 opcional                                                                    |
| **Circuit Breaker** | Budget por peer, falhas sustentadas levam a SUSPENDED → EVICTED                                |

### Escada de Confiança (5 níveis)

| Nível        | Capacidades                         |
| ------------ | ----------------------------------- |
| `UNTRUSTED`  | discovery apenas                    |
| `VERIFIED`   | + status, ping                      |
| `ATTESTED`   | + send, receive, query-redacted     |
| `TRUSTED`    | + share-context, collaborative-task |
| `PRIVILEGED` | + full-memory, remote-spawn         |

### 17 Ferramentas MCP de Federação

`federation_init`, `federation_join`, `federation_peers`, `federation_send`, `federation_query`, `federation_status`, `federation_trust`, `federation_audit`, `federation_breaker_status`, `federation_evict`, `federation_reactivate`, `federation_report_spend`, `federation_consensus`, `federation_wg_status`, `federation_wg_attest`, `federation_wg_keyrotate`

## Segurança

### Reporte de Vulnerabilidades

Email: **security@cognitum.one** (não abrir GitHub Issues públicas)

### Práticas de Segurança

- **Validação de entrada** via schemas Zod para todas as APIs públicas
- **Queries SQL parametrizadas** para prevenir injection
- **Prevenção de path traversal** via módulo `PathValidator`
- **Proteção de command injection** via módulo `SafeExecutor`
- **Proteção TOCTOU** via Promise-based caching no singleton bridge
- **Arquivos de sessão/terminal/memória** em modo 0600
- **MCP stdin DoS cap** de 10MB
- **Fetch timeouts** no verify + IPFS HEAD probe
- **Encryption at rest** AES-256-GCM (opcional via `CLAUDE_FLOW_ENCRYPT_AT_REST=1`)
- **Zero-trust federação** com envelopes assinados Ed25519
- **Supply chain**: `npm audit --audit-level=high` em todo PR

### Plugins de Segurança

| Plugin                   | Função                                                   |
| ------------------------ | -------------------------------------------------------- |
| **ruflo-security-audit** | Scan de vulnerabilidades e CVEs                          |
| **ruflo-aidefence**      | Bloquear prompt injection, detectar PII, safety scanning |
| **ruflo-metaharness**    | Auditar setup de agente, escanear configs de segurança   |
