import type { PrismaClient, WhatsAppSessionStatus as PrismaSessionStatus, WhatsAppDisconnectReason as PrismaDisconnectReason } from '@prisma/client';

import { WhatsAppSessionEvent } from '../../domain/entities/WhatsAppSessionEvent';
import { WhatsAppSessionEventRepository } from '../../domain/repositories/WhatsAppSessionEventRepository';

/**
 * Mesmos mapas de enum já usados em `PrismaWhatsAppSessionRepository.ts` —
 * duplicados aqui deliberadamente (não extraídos para um módulo
 * compartilhado): são 6 linhas totais, e a extração criaria um acoplamento
 * entre dois repositórios com razões de mudar diferentes (estado atual vs.
 * histórico) só para evitar uma duplicação mínima — não vale a troca (YAGNI,
 * mesmo racional já aplicado noutros pontos do projeto).
 */
const STATUS_TO_PRISMA: Record<WhatsAppSessionEvent['status'], PrismaSessionStatus> = {
  connecting: 'CONNECTING' as PrismaSessionStatus,
  connected: 'CONNECTED' as PrismaSessionStatus,
  disconnected: 'DISCONNECTED' as PrismaSessionStatus,
};

const STATUS_TO_DOMAIN: Record<PrismaSessionStatus, WhatsAppSessionEvent['status']> = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
} as Record<PrismaSessionStatus, WhatsAppSessionEvent['status']>;

const DISCONNECT_REASON_TO_PRISMA: Record<NonNullable<WhatsAppSessionEvent['disconnectReason']>, PrismaDisconnectReason> = {
  logged_out: 'LOGGED_OUT' as PrismaDisconnectReason,
  restart_required: 'RESTART_REQUIRED' as PrismaDisconnectReason,
  connection_lost: 'CONNECTION_LOST' as PrismaDisconnectReason,
  timed_out: 'TIMED_OUT' as PrismaDisconnectReason,
  unknown: 'UNKNOWN' as PrismaDisconnectReason,
};

const DISCONNECT_REASON_TO_DOMAIN: Record<PrismaDisconnectReason, NonNullable<WhatsAppSessionEvent['disconnectReason']>> = {
  LOGGED_OUT: 'logged_out',
  RESTART_REQUIRED: 'restart_required',
  CONNECTION_LOST: 'connection_lost',
  TIMED_OUT: 'timed_out',
  UNKNOWN: 'unknown',
} as Record<PrismaDisconnectReason, NonNullable<WhatsAppSessionEvent['disconnectReason']>>;

interface WhatsAppSessionEventRow {
  id: string;
  tenantId: string;
  sessionName: string;
  status: PrismaSessionStatus;
  disconnectReason: PrismaDisconnectReason | null;
  occurredAt: Date;
}

function toDomain(row: WhatsAppSessionEventRow): WhatsAppSessionEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    status: STATUS_TO_DOMAIN[row.status],
    disconnectReason: row.disconnectReason ? DISCONNECT_REASON_TO_DOMAIN[row.disconnectReason] : undefined,
    occurredAt: row.occurredAt,
  };
}

/**
 * Implementação concreta de `WhatsAppSessionEventRepository` sobre o model
 * `WhatsAppSessionEvent` (M2, Fase 2 — ver `prisma/schema.prisma`).
 *
 * NOTA DE VERIFICAÇÃO (mesma limitação já registrada para os demais
 * arquivos Prisma deste projeto): depende de `npx prisma migrate dev` (para
 * criar a tabela) e `npx prisma generate` (para o Client reconhecer
 * `prisma.whatsAppSessionEvent`) terem rodado. Precisa ser conferido com
 * `tsc`/`npm test` no ambiente real antes do primeiro uso.
 */
export class PrismaWhatsAppSessionEventRepository implements WhatsAppSessionEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(event: Omit<WhatsAppSessionEvent, 'id'>): Promise<void> {
    await this.prisma.whatsAppSessionEvent.create({
      data: {
        tenantId: event.tenantId,
        sessionName: event.sessionName,
        status: STATUS_TO_PRISMA[event.status],
        disconnectReason: event.disconnectReason ? DISCONNECT_REASON_TO_PRISMA[event.disconnectReason] : null,
        occurredAt: event.occurredAt,
      },
    });
  }

  async listRecentByTenantAndSessionName(tenantId: string, sessionName: string, limit: number): Promise<WhatsAppSessionEvent[]> {
    const rows = await this.prisma.whatsAppSessionEvent.findMany({
      where: { tenantId, sessionName },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
    return rows.map(toDomain);
  }
}
