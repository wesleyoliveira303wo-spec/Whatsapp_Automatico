/**
 * Nomes de header nunca registrados em log, em nenhuma circunstância (debug,
 * warn, error) — comparação case-insensitive, porque nomes de header HTTP
 * não diferenciam maiúsculas/minúsculas por especificação (RFC 7230).
 * Decisão fechada na revisão arquitetural de 2026-07-08 (Production
 * Hardening): vazamento de segredo em log é uma classe de risco tão séria
 * quanto vazamento no banco, e ferramentas de observabilidade que já sabem
 * redigir `Authorization` automaticamente NÃO sabem redigir `X-API-Key` por
 * padrão — este utilitário existe para não depender dessa suposição.
 */
const REDACTED_HEADER_NAMES = new Set(['x-api-key', 'authorization', 'cookie', 'set-cookie']);

const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Retorna uma CÓPIA do objeto de headers com os valores sensíveis
 * substituídos por um placeholder — nunca muta o objeto recebido (`req.headers`
 * do Express, por exemplo, não deve ser alterado por um efeito colateral de
 * logging). Headers não sensíveis são preservados inalterados.
 *
 * Escopo deliberadamente pequeno: cobre a lista de headers explicitamente
 * decidida (`X-API-Key`, `Authorization`, `Cookie`, `Set-Cookie`) — não um
 * scrubber recursivo genérico para qualquer objeto (isso resolveria um
 * problema hipotético que ainda não apareceu neste projeto; ver auditoria da
 * Production Hardening, decisão 6).
 */
export function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(headers)) {
    sanitized[name] = REDACTED_HEADER_NAMES.has(name.toLowerCase()) ? REDACTED_PLACEHOLDER : value;
  }
  return sanitized;
}
