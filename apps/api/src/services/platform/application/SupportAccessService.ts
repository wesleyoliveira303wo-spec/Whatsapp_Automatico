import { Logger } from '../../../shared/domain/Logger';
import { AuditLogRepository } from '../../auth/domain/repositories/AuditLogRepository';
import {
  SUPPORT_ACCESS_WINDOW_MS,
  TenantAccessRequest,
  isSupportAccessLive,
} from '../domain/entities/TenantAccessRequest';
import { PlatformAuditLogRepository } from '../domain/repositories/PlatformAuditLogRepository';
import { PlatformUserRepository } from '../domain/repositories/PlatformUserRepository';
import {
  SupportAccessPage,
  SupportAccessRepository,
} from '../domain/repositories/SupportAccessRepository';
import { SupportAccessTokenService } from '../domain/SupportAccessTokenService';
import {
  SupportAccessAlreadyOpenError,
  SupportAccessForbiddenError,
  SupportAccessNotFoundError,
  SupportAccessWrongStateError,
} from '../domain/errors/SupportAccessErrors';

/** Origem da requisição, para as duas trilhas. */
export interface SupportActionMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * Ciclo de acesso assistido ao tenant — Painel `/admin`, Fase 5
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §9).
 *
 * Dono do conceito, chamado dos DOIS lados: o admin (pedir, emitir crachá,
 * encerrar, listar — atrás de `requirePlatformUser`) e o tenant (ver,
 * autorizar/recusar, revogar — atrás de `authenticate` + `support:respond`,
 * sempre passando o próprio `tenantId`).
 *
 * Toda transição de estado é auditada nas DUAS trilhas: `PlatformAuditLog`
 * (o que o dono fez) e `AuditLog` do tenant (o que o cliente vê na Auditoria
 * dele — §9.4 brecha 3). A trilha da PLATAFORMA vem ANTES da escrita de
 * estado — mesmo racional do `TenantControlService` (Fase 4): se o `append`
 * falhar, a transição não acontece (fail-closed), em vez de mudar o estado e
 * só então descobrir que não deu para registrar. `respond`/`end`/`revoke`
 * seguem essa ordem. `request` é a exceção: a trilha referencia o `id` da
 * linha, que só existe depois do `create` — ali o `append` roda depois e é
 * best-effort (uma falha não derruba o pedido nem deixa a linha órfã).
 *
 * A trilha do TENANT (`AuditLog`) é sempre best-effort: o tenant pode ter
 * sido apagado no meio de uma janela ativa (a FK do `audit_logs` para
 * `tenants` é `ON DELETE CASCADE`, mas `TenantAccessRequest` não tem FK), e um
 * `record` que estoure por isso não pode devolver 500 para uma ação que já
 * decidiu acontecer.
 */
export class SupportAccessService {
  constructor(
    private readonly requests: SupportAccessRepository,
    private readonly platformAudit: PlatformAuditLogRepository,
    private readonly tenantAudit: AuditLogRepository,
    private readonly tokenService: SupportAccessTokenService,
    private readonly platformUsers: PlatformUserRepository,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---------------------------------------------------------------- lado ADMIN

  async request(
    input: { tenantId: string; platformUserId: string; reason: string },
    meta: SupportActionMeta = {},
  ): Promise<TenantAccessRequest> {
    const reason = input.reason.trim();
    if (reason.length === 0) {
      throw new SupportAccessWrongStateError('O motivo do pedido não pode ser vazio.');
    }

    const open = await this.requests.findActiveOrPendingByTenant(input.tenantId);
    if (open) {
      // Um PENDING que o cliente não respondeu dentro da janela de 2 h (a
      // mesma que rege o acesso já concedido) está obsoleto: sem isto, um
      // pedido ignorado travava PARA SEMPRE qualquer novo pedido de acesso
      // àquele tenant — `markExpiredStale` só mexe em ACCEPTED e nem `end`
      // nem `revoke` transicionam um PENDING. Um ACCEPTED ainda dentro do
      // prazo continua bloqueando (há acesso de fato ativo).
      const stalePending =
        open.status === 'pending' &&
        this.now().getTime() - open.requestedAt.getTime() >= SUPPORT_ACCESS_WINDOW_MS;
      if (!stalePending) {
        throw new SupportAccessAlreadyOpenError(input.tenantId);
      }
      await this.requireUpdate(open.id, 'expired');
      await this.tryPlatformAudit({
        platformUserId: open.platformUserId,
        action: 'support.access_ended',
        tenantId: open.tenantId,
        metadata: { supportAccessId: open.id, reason: 'pending_expired' },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }

    const created = await this.requests.create({
      tenantId: input.tenantId,
      platformUserId: input.platformUserId,
      reason,
    });

    // best-effort: a linha já existe; uma falha aqui não deve devolver 500
    // nem deixar um PENDING órfão sem que o pedido tenha "acontecido".
    await this.tryPlatformAudit({
      platformUserId: input.platformUserId,
      action: 'support.access_requested',
      tenantId: input.tenantId,
      metadata: { supportAccessId: created.id, reason },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return created;
  }

  /** Emite o crachá de acesso (5b — só depois de `accepted` e dentro do prazo). */
  async mintToken(input: {
    supportAccessId: string;
    platformUserId: string;
  }): Promise<{ token: string; expiresAt: Date; tenantId: string; platformUserId: string }> {
    const request = await this.requireRequest(input.supportAccessId);
    if (request.platformUserId !== input.platformUserId) {
      throw new SupportAccessForbiddenError('Este pedido de acesso é de outro admin.');
    }
    if (!isSupportAccessLive(request, this.now())) {
      throw new SupportAccessWrongStateError('O acesso não está autorizado ou já expirou.');
    }
    const token = this.tokenService.issue({
      supportAccessId: request.id,
      tenantId: request.tenantId,
      platformUserId: request.platformUserId,
    });
    return {
      token,
      // `expiresAt` nunca é null aqui (garantido por `isSupportAccessLive`).
      expiresAt: request.expiresAt as Date,
      tenantId: request.tenantId,
      platformUserId: request.platformUserId,
    };
  }

  /** O admin sai da conta — encerra o acesso. */
  async end(
    input: { supportAccessId: string; platformUserId: string },
    meta: SupportActionMeta = {},
  ): Promise<TenantAccessRequest> {
    const request = await this.requireRequest(input.supportAccessId);
    if (request.platformUserId !== input.platformUserId) {
      throw new SupportAccessForbiddenError('Este pedido de acesso é de outro admin.');
    }
    if (!isSupportAccessLive(request, this.now())) {
      throw new SupportAccessWrongStateError('Não há acesso ativo para encerrar.');
    }
    await this.auditEnded(request, {
      actorUserId: undefined,
      reason: 'ended_by_admin',
      platformUserId: request.platformUserId,
      meta,
    });
    return this.requireUpdate(request.id, 'ended');
  }

  async listForAdmin(limit: number, cursor?: string): Promise<SupportAccessPage> {
    await this.requests.markExpiredStale(this.now());
    return this.requests.listRecent(limit, cursor);
  }

  // --------------------------------------------------------------- lado TENANT

  /**
   * O pedido que "ocupa a vaga" do tenant agora, já com o nome de quem pediu
   * resolvido — alimenta o banner e o prompt de autorização do cliente.
   */
  async getOpenForTenant(
    tenantId: string,
  ): Promise<{ request: TenantAccessRequest; adminName: string; adminEmail: string } | null> {
    await this.requests.markExpiredStale(this.now());
    const request = await this.requests.findActiveOrPendingByTenant(tenantId);
    if (!request) {
      return null;
    }
    const admin = await this.platformUsers.findById(request.platformUserId).catch(() => null);
    return {
      request,
      adminName: admin?.name ?? 'Suporte da plataforma',
      adminEmail: admin?.email ?? '',
    };
  }

  async respond(
    input: {
      tenantId: string;
      supportAccessId: string;
      respondedByUserId: string;
      decision: 'accept' | 'deny';
    },
    meta: SupportActionMeta = {},
  ): Promise<TenantAccessRequest> {
    const request = await this.requireRequest(input.supportAccessId);
    this.assertBelongsToTenant(request, input.tenantId);
    if (request.status !== 'pending') {
      throw new SupportAccessWrongStateError('Este pedido já foi respondido.');
    }

    const now = this.now();
    if (input.decision === 'deny') {
      // Trilha da plataforma ANTES da escrita (fail-closed, como a Fase 4).
      await this.platformAudit.append({
        platformUserId: request.platformUserId,
        action: 'support.access_denied',
        tenantId: request.tenantId,
        metadata: { supportAccessId: request.id, respondedByUserId: input.respondedByUserId },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await this.tryTenantAudit({
        tenantId: request.tenantId,
        actorUserId: input.respondedByUserId,
        action: 'support.access_denied',
        metadata: { supportAccessId: request.id, platformUserId: request.platformUserId },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return this.requireUpdate(request.id, 'denied', {
        respondedAt: now,
        respondedByUserId: input.respondedByUserId,
      });
    }

    const expiresAt = new Date(now.getTime() + SUPPORT_ACCESS_WINDOW_MS);
    await this.platformAudit.append({
      platformUserId: request.platformUserId,
      action: 'support.access_granted',
      tenantId: request.tenantId,
      metadata: {
        supportAccessId: request.id,
        respondedByUserId: input.respondedByUserId,
        expiresAt: expiresAt.toISOString(),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.tryTenantAudit({
      tenantId: request.tenantId,
      actorUserId: input.respondedByUserId,
      action: 'support.access_granted',
      metadata: {
        supportAccessId: request.id,
        platformUserId: request.platformUserId,
        reason: request.reason,
        expiresAt: expiresAt.toISOString(),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.requireUpdate(request.id, 'accepted', {
      respondedAt: now,
      respondedByUserId: input.respondedByUserId,
      expiresAt,
    });
  }

  /** O cliente revoga — a qualquer instante, sem passar pelo fundador (Regra 2). */
  async revoke(
    input: { tenantId: string; supportAccessId: string; revokedByUserId: string },
    meta: SupportActionMeta = {},
  ): Promise<TenantAccessRequest> {
    const request = await this.requireRequest(input.supportAccessId);
    this.assertBelongsToTenant(request, input.tenantId);
    if (!isSupportAccessLive(request, this.now())) {
      throw new SupportAccessWrongStateError('Não há acesso ativo para revogar.');
    }
    await this.auditEnded(request, {
      actorUserId: input.revokedByUserId,
      reason: 'revoked_by_client',
      platformUserId: request.platformUserId,
      meta,
    });
    return this.requireUpdate(request.id, 'revoked');
  }

  // -------------------------------------------------------------------- helpers

  private async requireRequest(id: string): Promise<TenantAccessRequest> {
    const request = await this.requests.findById(id);
    if (!request) {
      throw new SupportAccessNotFoundError(id);
    }
    return request;
  }

  private assertBelongsToTenant(request: TenantAccessRequest, tenantId: string): void {
    if (request.tenantId !== tenantId) {
      // Defesa em profundidade — as rotas do tenant já filtram por `tenantId`,
      // mas um id de pedido de OUTRO tenant nunca deve ser tocado por aqui.
      throw new SupportAccessForbiddenError('Este pedido de acesso é de outro tenant.');
    }
  }

  private async requireUpdate(
    id: string,
    status: Parameters<SupportAccessRepository['updateStatus']>[1],
    fields?: Parameters<SupportAccessRepository['updateStatus']>[2],
  ): Promise<TenantAccessRequest> {
    const updated = await this.requests.updateStatus(id, status, fields);
    if (!updated) {
      this.logger.warn('Pedido de acesso sumiu durante uma transição', { id, status });
      throw new SupportAccessNotFoundError(id);
    }
    return updated;
  }

  private async auditEnded(
    request: TenantAccessRequest,
    ctx: {
      actorUserId?: string;
      reason: 'revoked_by_client' | 'ended_by_admin';
      platformUserId: string;
      meta: SupportActionMeta;
    },
  ): Promise<void> {
    await this.platformAudit.append({
      platformUserId: ctx.platformUserId,
      action: 'support.access_ended',
      tenantId: request.tenantId,
      metadata: { supportAccessId: request.id, reason: ctx.reason },
      ip: ctx.meta.ip,
      userAgent: ctx.meta.userAgent,
    });
    await this.tryTenantAudit({
      tenantId: request.tenantId,
      actorUserId: ctx.actorUserId,
      action: 'support.access_ended',
      metadata: {
        supportAccessId: request.id,
        platformUserId: ctx.platformUserId,
        reason: ctx.reason,
      },
      ip: ctx.meta.ip,
      userAgent: ctx.meta.userAgent,
    });
  }

  /**
   * Trilha do TENANT — best-effort. O tenant pode ter sido apagado no meio de
   * uma janela ativa (FK `audit_logs → tenants` é `ON DELETE CASCADE`, mas
   * `TenantAccessRequest` não tem FK), e um `record` que estoure por isso não
   * pode devolver 500 para uma transição que já foi decidida.
   */
  private async tryTenantAudit(
    entry: Parameters<AuditLogRepository['record']>[0],
  ): Promise<void> {
    try {
      await this.tenantAudit.record(entry);
    } catch (error) {
      this.logger.warn('Falha ao gravar ação de suporte na auditoria do tenant', {
        tenantId: entry.tenantId,
        action: entry.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Trilha da plataforma best-effort — usada só onde a linha já existe (`request`). */
  private async tryPlatformAudit(
    entry: Parameters<PlatformAuditLogRepository['append']>[0],
  ): Promise<void> {
    try {
      await this.platformAudit.append(entry);
    } catch (error) {
      this.logger.warn('Falha ao gravar a trilha da plataforma no acesso de suporte', {
        action: entry.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
