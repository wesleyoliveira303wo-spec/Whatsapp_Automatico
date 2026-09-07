import { SupportAccessStatus, TenantAccessRequest } from '../entities/TenantAccessRequest';

/**
 * Porta do ciclo de acesso assistido (Fase 5, §9.2). Só o `services/platform`
 * a consome — pelo lado do admin (pedir, listar, mint) e pelo lado do tenant
 * (ver, autorizar, revogar), sempre com o `tenantId` explícito no critério.
 *
 * Append-friendly: `create` + `updateStatus`, nunca `delete` — pedidos são
 * mantidos para sempre.
 */
export interface SupportAccessRepository {
  create(input: {
    tenantId: string;
    platformUserId: string;
    reason: string;
  }): Promise<TenantAccessRequest>;

  findById(id: string): Promise<TenantAccessRequest | null>;

  /**
   * O pedido que "ocupa a vaga" do tenant agora: `pending`, ou `accepted`
   * dentro do prazo. `null` se não houver. Alimenta o banner do cliente e a
   * trava de "um pedido ativo por vez".
   */
  findActiveOrPendingByTenant(tenantId: string): Promise<TenantAccessRequest | null>;

  /** Histórico de um tenant, mais recente primeiro (tela do cliente e detalhe do admin). */
  listByTenant(tenantId: string, limit: number): Promise<TenantAccessRequest[]>;

  /** Todos os pedidos, mais recente primeiro, paginado por cursor — seção Suporte do `/admin` (§9.5). */
  listRecent(limit: number, cursor?: string): Promise<SupportAccessPage>;

  /**
   * Muda o status (e, quando aplicável, `respondedAt`/`respondedByUserId`/
   * `expiresAt`). Devolve o registro atualizado, ou `null` se o id não existe.
   */
  updateStatus(
    id: string,
    status: SupportAccessStatus,
    fields?: {
      respondedAt?: Date;
      respondedByUserId?: string;
      expiresAt?: Date;
    },
  ): Promise<TenantAccessRequest | null>;

  /**
   * Varre os `accepted` cujo `expiresAt` já passou e os marca `expired`.
   * Chamado de forma preguiçosa nas leituras — não há cron para isto, e o
   * porteiro já trata "vencido" como negado independentemente do status
   * gravado (Regra 3).
   */
  markExpiredStale(now: Date): Promise<number>;
}

export interface SupportAccessPage {
  requests: TenantAccessRequest[];
  /** Ausente indica fim — mesmo contrato das demais páginas por cursor. */
  nextCursor?: string;
}
