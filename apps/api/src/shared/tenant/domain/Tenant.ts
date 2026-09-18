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
import { PlanSource } from './PlanSource';
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
   * Plano do tenant (ver `planCapabilities.ts` e `CONTEXT.md`). Sempre
   * presente — a coluna do banco é `NOT NULL DEFAULT 'FREE'`. Um tenant novo
   * (via `/register`) nasce `'free'`.
   */
  plan: TenantPlan;
  /**
   * De onde veio o plano (B5, 2026-09-18, ver `PlanSource`). Sempre presente
   * — a coluna do banco é `NOT NULL DEFAULT 'SELF_SERVICE'`.
   */
  planSource: PlanSource;
  /**
   * Quando o tenant usou o teste grátis de 1 dia (B5, etapa 2). Ausente =
   * ainda pode testar. Um teste por conta, para sempre.
   */
  trialUsedAt?: Date;
  /**
   * Trava de acesso (Painel /admin, Fase 4, ver `TenantStatus` e §8 do plano
   * mestre). Sempre presente — a coluna do banco é `NOT NULL DEFAULT
   * 'ACTIVE'`. `'suspended'` bloqueia o login do tenant inteiro.
   */
  status: TenantStatus;
}
