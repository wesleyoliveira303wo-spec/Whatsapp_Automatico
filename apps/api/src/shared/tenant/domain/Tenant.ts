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
import { TenantPlan } from './TenantPlan';
import { TenantStatus } from './TenantStatus';

export interface Tenant {
  id: string;
  name: string;
  /** Hash da API key emitida para este tenant. `null` até uma chave ser
   * emitida — provisionamento de tenant e emissão de chave continuam
   * manuais nesta milestone (sem endpoint HTTP, ver Production Hardening). */
  apiKeyHash: string | null;
  /**
   * Trava de plano (Lançamento suave, 2026-08-31, ver `planPermiteUso` e
   * `CONTEXT.md`). Sempre presente — a coluna do banco é `NOT NULL DEFAULT
   * 'FREE'`. Um tenant novo (via `/register`) nasce `'free'`.
   */
  plan: TenantPlan;
  /**
   * Trava de acesso (Painel /admin, Fase 4, ver `TenantStatus` e §8 do plano
   * mestre). Sempre presente — a coluna do banco é `NOT NULL DEFAULT
   * 'ACTIVE'`. `'suspended'` bloqueia o login do tenant inteiro.
   */
  status: TenantStatus;
}
