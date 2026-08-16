import type { PrismaClient } from '@prisma/client';

import { ConsentEvent, ConsentEventType } from '../../domain/entities/Contact';
import {
  ConsentEventRepository,
  RecordConsentEventData,
} from '../../domain/repositories/ConsentEventRepository';

interface ConsentEventRow {
  id: string;
  tenantId: string;
  contactId: string;
  type: string;
  reason: string | null;
  actorUserId: string | null;
  occurredAt: Date;
}

const TYPE_TO_PRISMA: Record<ConsentEventType, 'OPT_IN' | 'OPT_OUT'> = {
  opt_in: 'OPT_IN',
  opt_out: 'OPT_OUT',
};

const TYPE_FROM_PRISMA: Record<string, ConsentEventType> = {
  OPT_IN: 'opt_in',
  OPT_OUT: 'opt_out',
};

function toDomain(row: ConsentEventRow): ConsentEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    contactId: row.contactId,
    type: TYPE_FROM_PRISMA[row.type] ?? 'opt_out',
    reason: row.reason ?? undefined,
    actorUserId: row.actorUserId ?? undefined,
    occurredAt: row.occurredAt,
  };
}

/**
 * Implementação concreta de `ConsentEventRepository` sobre o model
 * `ContactConsentEvent` (`prisma/schema.prisma`, Fase L — Bloco L2).
 * Append-only: só `create`, nunca update/delete — mesmo padrão de
 * `PrismaAuditLogRepository`/`PrismaWhatsAppSessionEventRepository`.
 */
export class PrismaConsentEventRepository implements ConsentEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(data: RecordConsentEventData): Promise<ConsentEvent> {
    const row = await this.prisma.contactConsentEvent.create({
      data: {
        tenantId: data.tenantId,
        contactId: data.contactId,
        type: TYPE_TO_PRISMA[data.type],
        reason: data.reason ?? null,
        actorUserId: data.actorUserId ?? null,
      },
    });
    return toDomain(row);
  }
}
