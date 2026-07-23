import type { PrismaClient, WhatsAppConversationStatus as PrismaConversationStatus } from '@prisma/client';

import { Conversation } from '../../domain/entities/Conversation';
import {
  ConversationRepository,
  FindAllByTenantOptions,
  ConversationPage,
  UpdateConversationStatusOptions,
} from '../../domain/repositories/ConversationRepository';

const STATUS_TO_PRISMA: Record<Conversation['status'], PrismaConversationStatus> = {
  bot: 'BOT' as PrismaConversationStatus,
  human: 'HUMAN' as PrismaConversationStatus,
};

const STATUS_TO_DOMAIN: Record<PrismaConversationStatus, Conversation['status']> = {
  BOT: 'bot',
  HUMAN: 'human',
} as Record<PrismaConversationStatus, Conversation['status']>;

/**
 * Shape mínimo lido do banco — mesmo racional já documentado em
 * `PrismaWhatsAppSessionRepository.ts` (`WhatsAppSessionRow`): só os campos
 * que este repositório de fato usa, não o tipo completo gerado pelo Prisma.
 */
interface WhatsAppConversationRow {
  id: string;
  tenantId: string;
  sessionName: string;
  contactJid: string;
  status: PrismaConversationStatus;
  assignedToUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: WhatsAppConversationRow): Conversation {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    contactJid: row.contactJid,
    status: STATUS_TO_DOMAIN[row.status],
    assignedToUserId: row.assignedToUserId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Implementação concreta de `ConversationRepository` sobre o model
 * `WhatsAppConversation` (`prisma/schema.prisma`, Milestone 3, Bloco 2).
 *
 * Nome do model deliberadamente `WhatsAppConversation`, não `Conversation`:
 * o schema já tem um model `Conversation` no domínio legado "Milestone 003"
 * (congelado, ADR #11) — o Prisma Client é um namespace ÚNICO por schema, e
 * dois models com o mesmo nome não compilam. Mesmo prefixo `WhatsApp` já
 * usado por `WhatsAppSession`/`WhatsAppSessionEvent` para a seção "WhatsApp
 * Connectivity" — risco já previsto e mitigado exatamente assim em
 * `MILESTONE_003_AI_AUTORESPONDER.md` §5 ("mapear com `@@map` explícito").
 *
 * NOTA DE VERIFICAÇÃO (mesma limitação já registrada para os demais
 * arquivos Prisma deste projeto): depende de `npx prisma generate` (Client)
 * e `npx prisma migrate deploy`/`migrate dev` (tabela) terem rodado.
 */
export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Usa o `upsert` real do Prisma (`INSERT ... ON CONFLICT (tenant_id,
   * session_name, contact_jid) DO UPDATE`) — mesmo racional atômico já usado
   * em `PrismaWhatsAppSessionRepository.upsertByTenantAndSessionName` (ADR
   * #25/P6). `update: {}` é intencional: nenhum campo de negócio muda quando
   * a conversa já existe, mas o Prisma ainda assim atualiza `updatedAt`
   * (`@updatedAt`) — suficiente para "última atividade" sem precisar de um
   * campo dedicado (YAGNI).
   */
  async upsertByTenantSessionAndContact(
    tenantId: string,
    sessionName: string,
    contactJid: string,
    create: Conversation,
  ): Promise<Conversation> {
    const row = await this.prisma.whatsAppConversation.upsert({
      where: { tenantId_sessionName_contactJid: { tenantId, sessionName, contactJid } },
      create: {
        id: create.id,
        tenantId,
        sessionName,
        contactJid,
        status: STATUS_TO_PRISMA[create.status],
        createdAt: create.createdAt,
        updatedAt: create.updatedAt,
      },
      update: {},
    });

    return toDomain(row);
  }

  /**
   * Milestone 3, Bloco 4 (aditivo — ver docstring de `ConversationRepository.
   * findById`). `findUnique` por chave primária; `null` do Prisma mapeado
   * para `undefined` no Domain (contrato do port).
   */
  async findById(id: string): Promise<Conversation | undefined> {
    const row = await this.prisma.whatsAppConversation.findUnique({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  /**
   * Milestone 3, Bloco 5 (D10 — aditivo). `updateMany` (não `update`) porque
   * o `where` precisa combinar `id` E `tenantId` (defesa em profundidade,
   * mesmo racional documentado no port) — a chave primária do Prisma
   * (`update()`) só aceita `id` sozinho. `count === 0` cobre tanto "não
   * existe" quanto "existe, mas de outro tenant" — as duas situações
   * recebem o mesmo `undefined` do port, sem distinção (mesmo racional de
   * segurança de `ConversationNotFoundError`: nunca revelar a um chamador
   * não autorizado que um recurso de outro tenant existe).
   */
  async updateStatus(
    tenantId: string,
    conversationId: string,
    status: Conversation['status'],
    options?: UpdateConversationStatusOptions,
  ): Promise<Conversation | undefined> {
    // Ownership (M5D/D57): `assignedToUserId` só entra no `data` quando o
    // chamador o informa (`string` define / `null` limpa). Ausente = não
    // mexe no dono (retrocompatível).
    const data: { status: PrismaConversationStatus; assignedToUserId?: string | null } = {
      status: STATUS_TO_PRISMA[status],
    };
    if (options && 'assignedToUserId' in options) {
      data.assignedToUserId = options.assignedToUserId ?? null;
    }

    const result = await this.prisma.whatsAppConversation.updateMany({
      where: { id: conversationId, tenantId },
      data,
    });

    if (result.count === 0) {
      return undefined;
    }

    return this.findById(conversationId);
  }

  /**
   * Milestone 3, Bloco 5 (D11 — aditivo). Paginação por CURSOR (não
   * offset) — decisão do levantamento arquitetural: `Conversation` não tem
   * teto natural de volume, diferente de `WhatsAppSession`. Usa o padrão
   * oficial de paginação por cursor do Prisma (`cursor` + `skip: 1` sobre um
   * campo único, aqui `id`), com `orderBy` composto (`createdAt` DESC, `id`
   * DESC como desempate) para garantir ordem determinística mesmo quando
   * duas conversas têm o mesmo `createdAt` — sem o desempate, o cursor
   * poderia pular ou repetir uma linha na fronteira entre duas páginas.
   *
   * Busca `limit + 1` linhas para descobrir se existe próxima página sem uma
   * segunda consulta `count()` — `hasMore` é verdadeiro se a linha extra
   * veio; nesse caso ela é descartada do resultado e seu antecessor (o
   * último item da página) vira `nextCursor`.
   */
  async findAllByTenant(tenantId: string, options: FindAllByTenantOptions): Promise<ConversationPage> {
    const { status, limit, cursor } = options;

    const rows = await this.prisma.whatsAppConversation.findMany({
      where: {
        tenantId,
        ...(status ? { status: STATUS_TO_PRISMA[status] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      conversations: page.map(toDomain),
      nextCursor: hasMore ? page[page.length - 1].id : undefined,
    };
  }
}
