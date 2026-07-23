/**
 * Entidade reduzida de `Tenant` (Production Hardening, Bloco 1) — expõe
 * apenas os campos com consumidor real nesta milestone (checagem de
 * existência e autenticação por API key). Deliberadamente NÃO espelha o
 * model Prisma inteiro: `createdAt`/`updatedAt`/relações (`whatsAppSessions`,
 * `tenantCredentials`) não têm nenhum consumidor no Domain/Application ainda
 * — adicioná-los agora seria antecipar forma sem necessidade (mesmo
 * princípio já aplicado em `WhatsAppSession`, que também não carrega objetos
 * de relação do Prisma).
 */
export interface Tenant {
  id: string;
  name: string;
  /** Hash da API key emitida para este tenant. `null` até uma chave ser
   * emitida — provisionamento de tenant e emissão de chave continuam
   * manuais nesta milestone (sem endpoint HTTP, ver Production Hardening). */
  apiKeyHash: string | null;
}
