import { TenantOverview } from '../entities/TenantOverview';
import { TenantDetail } from '../entities/TenantDetail';
import { PlatformTotals } from '../entities/PlatformTotals';

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

  /**
   * Totais da PLATAFORMA INTEIRA (Fase 3, §5.2) — não por tenant. Um punhado
   * de agregações que somam todas as linhas: mensagens/IA da janela,
   * usuários, sessões, campanhas. Os recortes derivados dos sinais
   * (tenants ativos/em atenção) NÃO vêm daqui — saem de `listTenantOverviews`
   * + a função pura de Domain.
   */
  platformTotals(range: ObservabilityRange): Promise<PlatformTotals>;

  /**
   * Todas as sessões de WhatsApp de todos os tenants — só o mínimo para
   * reconciliar o status com o registry ao vivo (Fase 3, ADR #80). Consultada
   * SÓ quando há um `PlatformLiveSessionStatusResolver` injetado; sem ele,
   * ninguém chama.
   */
  listAllSessions(): Promise<Array<{ tenantId: string; sessionName: string; status: string }>>;
}
