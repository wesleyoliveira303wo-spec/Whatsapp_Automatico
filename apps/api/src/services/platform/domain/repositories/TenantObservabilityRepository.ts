import { TenantOverview } from '../entities/TenantOverview';
import { TenantDetail } from '../entities/TenantDetail';

/** Janela de tempo dos agregados. Fixada em 30 dias pelo Application Service (§6). */
export interface ObservabilityRange {
  from: Date;
  to: Date;
}

/**
 * Porta de LEITURA cross-tenant do Centro de Tenants — Fase 2.
 *
 * Vive em `services/platform` de propósito (§3.3): é o único bounded context
 * autorizado a consultar sem `tenantId` no `where`. A implementação Prisma é a
 * ÚNICA camada que vê SQL aqui, mesmo padrão de `AnalyticsRepository`.
 *
 * REGRA DE PERFORMANCE (§ Fase 2, testes): a lista é montada com UMA consulta
 * agregada POR INDICADOR (agrupada por `tenant_id`), nunca N consultas — uma
 * por tenant. `getTenantDetail` pode fazer mais consultas: é uma tela só, um
 * tenant só.
 */
export interface TenantObservabilityRepository {
  /**
   * Um `TenantOverview` por tenant existente, SEM sinais (o Application os
   * anexa via a função pura de Domain). Ordem: indiferente aqui — a camada de
   * cima ordena por urgência.
   */
  listTenantOverviews(range: ObservabilityRange): Promise<TenantOverview[]>;

  /**
   * O detalhe de um tenant, ou `null` se o id não existe. Inclui as sessões
   * uma a uma, campanhas, contatos e o histórico recente de eventos de sessão.
   */
  getTenantDetail(tenantId: string, range: ObservabilityRange): Promise<TenantDetail | null>;
}
