import { Prisma } from '@prisma/client';
import type { PrismaClient, WhatsAppSessionStatus as PrismaSessionStatus, WhatsAppDisconnectReason as PrismaDisconnectReason } from '@prisma/client';

import { WhatsAppSession } from '../../domain/entities/WhatsAppSession';
import { WhatsAppDisconnectReason } from '../../domain/entities/WhatsAppDisconnectReason';
import { WhatsAppSessionRepository } from '../../domain/repositories/WhatsAppSessionRepository';

const STATUS_TO_PRISMA: Record<WhatsAppSession['status'], PrismaSessionStatus> = {
  connecting: 'CONNECTING' as PrismaSessionStatus,
  connected: 'CONNECTED' as PrismaSessionStatus,
  disconnected: 'DISCONNECTED' as PrismaSessionStatus,
};

const STATUS_TO_DOMAIN: Record<PrismaSessionStatus, WhatsAppSession['status']> = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
} as Record<PrismaSessionStatus, WhatsAppSession['status']>;

/** Production Hardening, Bloco 8a — espelha `WhatsAppDisconnectReason`. */
const DISCONNECT_REASON_TO_PRISMA: Record<WhatsAppDisconnectReason, PrismaDisconnectReason> = {
  logged_out: 'LOGGED_OUT' as PrismaDisconnectReason,
  restart_required: 'RESTART_REQUIRED' as PrismaDisconnectReason,
  connection_lost: 'CONNECTION_LOST' as PrismaDisconnectReason,
  timed_out: 'TIMED_OUT' as PrismaDisconnectReason,
  unknown: 'UNKNOWN' as PrismaDisconnectReason,
};

const DISCONNECT_REASON_TO_DOMAIN: Record<PrismaDisconnectReason, WhatsAppDisconnectReason> = {
  LOGGED_OUT: 'logged_out',
  RESTART_REQUIRED: 'restart_required',
  CONNECTION_LOST: 'connection_lost',
  TIMED_OUT: 'timed_out',
  UNKNOWN: 'unknown',
} as Record<PrismaDisconnectReason, WhatsAppDisconnectReason>;

/**
 * Shape mínimo lido do banco — deliberadamente não depende do tipo completo
 * gerado pelo Prisma (`Prisma.WhatsAppSessionGetPayload<...>`), só dos campos
 * que este repositório de fato usa. Evita acoplar esta classe a detalhes do
 * client gerado além do necessário, e mantém `toDomain` type-checável mesmo
 * que o schema ganhe campos novos no futuro sem relação com este mapeamento.
 */
interface WhatsAppSessionRow {
  id: string;
  tenantId: string;
  sessionName: string;
  status: PrismaSessionStatus;
  disconnectReason: PrismaDisconnectReason | null;
  phoneNumber: string | null;
  connectedAt: Date | null;
  lastSeen: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: WhatsAppSessionRow): WhatsAppSession {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    // Único valor possível hoje (enum `WhatsAppProviderType` só tem
    // `BAILEYS` — achado F6, ver DECISIONS.md ADR #15). Quando um segundo
    // provider existir de verdade, este mapeamento precisa ler
    // `row.provider` em vez de fixar o literal.
    provider: 'baileys',
    status: STATUS_TO_DOMAIN[row.status],
    disconnectReason: row.disconnectReason ? DISCONNECT_REASON_TO_DOMAIN[row.disconnectReason] : undefined,
    phoneNumber: row.phoneNumber ?? undefined,
    connectedAt: row.connectedAt ?? undefined,
    lastSeen: row.lastSeen ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Implementação concreta de `WhatsAppSessionRepository` sobre o model
 * `WhatsAppSession` (`prisma/schema.prisma`), Milestone 1, Item 4.
 *
 * Decisões de desenho:
 *
 * - `update()` trata "registro não encontrado" (Prisma `P2025`) como no-op,
 *   não como erro — replica deliberadamente o comportamento do
 *   `FakeWhatsAppSessionRepository` usado nos testes de `SessionManager`
 *   (`if (!existing) return;`). Sem isso, este repositório real se
 *   comportaria de forma DIFERENTE do Fake que toda a suíte de testes do
 *   `SessionManager` valida contra — um Fake que mente sobre esse
 *   comportamento é exatamente o tipo de lacuna que a auditoria de
 *   2026-07-06 encontrou no BUG-02 (ver DECISIONS.md ADR #23).
 *
 * - `create()`/`findAll()` (globais, sem escopo de tenant) foram REMOVIDOS
 *   nesta Milestone (M2, Fase 1) — auditoria confirmou zero chamadores em
 *   produção para ambos. `create()` reabria a race condition do P6 se algum
 *   consumidor futuro o chamasse diretamente em vez do `upsertByTenantAndSessionName`
 *   atômico; `findAll()` sem escopo de tenant era um vazamento cross-tenant
 *   latente. Substituídos por `findAllByTenant()` (escopado) e
 *   `deleteByTenantAndSessionName()` (nova operação, suporte à remoção real
 *   de sessão do Dashboard).
 *
 * NOTA DE VERIFICAÇÃO (mesma limitação já registrada para os demais
 * arquivos Prisma desta Milestone): depende de `npx prisma generate` ter
 * rodado. Precisa ser conferido com `tsc`/`prisma generate`/`npm test` no
 * ambiente real antes do primeiro uso.
 */
export class PrismaWhatsAppSessionRepository implements WhatsAppSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async update(id: string, data: Partial<WhatsAppSession>): Promise<void> {
    const prismaData: Record<string, unknown> = {};

    if (data.status !== undefined) {
      prismaData.status = STATUS_TO_PRISMA[data.status];
    }
    // `disconnectReason` é diferente dos demais campos deste método: é um
    // valor OPCIONAL de Domain onde `undefined` é um estado válido e
    // INTENCIONAL ("nenhum motivo" / "limpo ao reconectar" — Production
    // Hardening, Bloco 8a), não apenas "o chamador não tinha essa
    // informação". Por isso o guard aqui é por PRESENÇA DA CHAVE (`in`), não
    // por valor `!== undefined` como os campos abaixo:
    // `SessionManager.subscribeToProviderEvents` sempre inclui esta chave em
    // `changes` (mesmo com valor `undefined`, para limpar de verdade ao
    // reconectar) — se este método usasse `!== undefined` aqui, a limpeza
    // nunca chegaria ao banco (o motivo antigo ficaria preso para sempre).
    // Chamadores que nunca tocam este campo (ex.: `doInit()`) simplesmente
    // não incluem a chave, e o `in` corretamente não o altera.
    if ('disconnectReason' in data) {
      prismaData.disconnectReason = data.disconnectReason ? DISCONNECT_REASON_TO_PRISMA[data.disconnectReason] : null;
    }
    if (data.phoneNumber !== undefined) {
      prismaData.phoneNumber = data.phoneNumber;
    }
    if (data.connectedAt !== undefined) {
      prismaData.connectedAt = data.connectedAt;
    }
    if (data.lastSeen !== undefined) {
      prismaData.lastSeen = data.lastSeen;
    }
    if (data.updatedAt !== undefined) {
      prismaData.updatedAt = data.updatedAt;
    }

    try {
      await this.prisma.whatsAppSession.update({ where: { id }, data: prismaData });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return;
      }
      throw error;
    }
  }

  async findById(id: string): Promise<WhatsAppSession | null> {
    const row = await this.prisma.whatsAppSession.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByTenantAndSessionName(tenantId: string, sessionName: string): Promise<WhatsAppSession | null> {
    const row = await this.prisma.whatsAppSession.findUnique({
      where: { tenantId_sessionName: { tenantId, sessionName } },
    });
    return row ? toDomain(row) : null;
  }

  /**
   * M2, Fase 1 — lista as sessões de um tenant para a tela de lista do
   * Dashboard. Ordenada por `sessionName` (ordem estável e previsível para
   * uma lista de gerenciamento; não é um requisito de negócio forte o
   * bastante para justificar uma coluna de ordenação dedicada agora — trocar
   * o critério depois é uma mudança de uma linha, sem migration).
   */
  async findAllByTenant(tenantId: string): Promise<WhatsAppSession[]> {
    const rows = await this.prisma.whatsAppSession.findMany({
      where: { tenantId },
      orderBy: { sessionName: 'asc' },
    });
    return rows.map(toDomain);
  }

  /**
   * M2, Fase 1 — remove definitivamente o registro de uma sessão (ação
   * "remover", distinta de "desconectar"). `deleteMany` (não `delete`)
   * deliberadamente, mesmo padrão já usado em `PrismaCredentialsStore.remove()`:
   * a interface exige idempotência, e `delete()` do Prisma lançaria P2025
   * para uma sessão já removida.
   */
  async deleteByTenantAndSessionName(tenantId: string, sessionName: string): Promise<void> {
    await this.prisma.whatsAppSession.deleteMany({ where: { tenantId, sessionName } });
  }

  /**
   * Corrige o P6 (race condition de `init()` concorrente — ver ADR #25):
   * usa o `upsert` real do Prisma, que compila para `INSERT ... ON CONFLICT
   * (tenant_id, session_name) DO UPDATE` no Postgres — atômico no nível do
   * banco, sem a janela de corrida que existia entre `findByTenantAndSessionName`
   * e `create()`/`update()` separados na Application.
   */
  async upsertByTenantAndSessionName(
    tenantId: string,
    sessionName: string,
    create: WhatsAppSession,
    update: Partial<WhatsAppSession>,
  ): Promise<WhatsAppSession> {
    const updateData: Record<string, unknown> = {};
    if (update.status !== undefined) {
      updateData.status = STATUS_TO_PRISMA[update.status];
    }
    // Mesmo guard por presença de chave usado em `update()` — ver docstring
    // lá (Production Hardening, Bloco 8a).
    if ('disconnectReason' in update) {
      updateData.disconnectReason = update.disconnectReason ? DISCONNECT_REASON_TO_PRISMA[update.disconnectReason] : null;
    }
    if (update.phoneNumber !== undefined) {
      updateData.phoneNumber = update.phoneNumber;
    }
    if (update.connectedAt !== undefined) {
      updateData.connectedAt = update.connectedAt;
    }
    if (update.lastSeen !== undefined) {
      updateData.lastSeen = update.lastSeen;
    }
    if (update.updatedAt !== undefined) {
      updateData.updatedAt = update.updatedAt;
    }

    const row = await this.prisma.whatsAppSession.upsert({
      where: { tenantId_sessionName: { tenantId, sessionName } },
      create: {
        id: create.id,
        tenantId,
        sessionName,
        provider: 'BAILEYS',
        status: STATUS_TO_PRISMA[create.status],
        disconnectReason: create.disconnectReason ? DISCONNECT_REASON_TO_PRISMA[create.disconnectReason] : null,
        phoneNumber: create.phoneNumber ?? null,
        connectedAt: create.connectedAt ?? null,
        lastSeen: create.lastSeen ?? null,
        createdAt: create.createdAt,
        updatedAt: create.updatedAt,
      },
      update: updateData,
    });

    return toDomain(row);
  }
}
