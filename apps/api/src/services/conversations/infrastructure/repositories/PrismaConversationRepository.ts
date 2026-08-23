import type {
  PrismaClient,
  WhatsAppConversationStatus as PrismaConversationStatus,
  ConversationStage as PrismaConversationStage,
  ConversationStageSetBy as PrismaConversationStageSetBy,
} from '@prisma/client';

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

/** Pipeline de CRM (Milestone 6, Bloco M6H-5) — mesmo padrão de `STATUS_TO_PRISMA`/`STATUS_TO_DOMAIN`. */
const STAGE_TO_PRISMA: Record<Conversation['stage'], PrismaConversationStage> = {
  new: 'NEW' as PrismaConversationStage,
  contacted: 'CONTACTED' as PrismaConversationStage,
  negotiating: 'NEGOTIATING' as PrismaConversationStage,
  closed_won: 'CLOSED_WON' as PrismaConversationStage,
  closed_lost: 'CLOSED_LOST' as PrismaConversationStage,
};

const STAGE_TO_DOMAIN: Record<PrismaConversationStage, Conversation['stage']> = {
  NEW: 'new',
  CONTACTED: 'contacted',
  NEGOTIATING: 'negotiating',
  CLOSED_WON: 'closed_won',
  CLOSED_LOST: 'closed_lost',
} as Record<PrismaConversationStage, Conversation['stage']>;

const STAGE_SET_BY_TO_PRISMA: Record<Conversation['stageSetBy'], PrismaConversationStageSetBy> = {
  ai: 'AI' as PrismaConversationStageSetBy,
  human: 'HUMAN' as PrismaConversationStageSetBy,
};

const STAGE_SET_BY_TO_DOMAIN: Record<PrismaConversationStageSetBy, Conversation['stageSetBy']> = {
  AI: 'ai',
  HUMAN: 'human',
} as Record<PrismaConversationStageSetBy, Conversation['stageSetBy']>;

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
  contactName: string | null;
  /** Fase L, Bloco L1 — identidade durável da pessoa; `null` para `@lid` e afins. */
  contactId: string | null;
  status: PrismaConversationStatus;
  assignedToUserId: string | null;
  escalatedAt: Date | null;
  unreadCount: number;
  stage: PrismaConversationStage;
  stageSetBy: PrismaConversationStageSetBy;
  stageUpdatedAt: Date;
  excludedFromPipeline: boolean;
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  aiSummary: string | null;
  aiSummaryUpdatedAt: Date | null;
  aiSummaryMessageCount: number;
  createdAt: Date;
  updatedAt: Date;
  /** Redesign 2026-08-05 (R4) — presente só quando a query usa `CONVERSATION_INCLUDE` (ver abaixo). */
  conversationTags: Array<{ tag: { id: string; name: string; color: string } }>;
  /**
   * Padronização de exibição de contato (2026-08-20) — presente só quando a
   * query usa `CONVERSATION_INCLUDE`. `null` tanto para `contactId` ausente
   * quanto para um `WhatsAppContact` ainda sem nome salvo — os dois casos
   * mapeiam para `savedContactName: undefined` (ver `toDomain`).
   */
  contact: { name: string | null } | null;
}

/**
 * Redesign 2026-08-05 (R4), estendido em 2026-08-20 — `include` compartilhado
 * pelas 3 queries que devolvem uma `Conversation` completa diretamente
 * (`upsert`/`findUnique`/`findMany`); os demais métodos de escrita
 * (`updateStatus`, `flagNeedsHumanAttention`, `markAsRead`, `updateStage`,
 * `setExcludedFromPipeline`) fazem `updateMany` + `this.findById(...)`, e
 * herdam o `include` de `findById` sem precisar declarar de novo.
 * `color` chega em MAIÚSCULO (enum Prisma `TagColor`) — `toDomain` faz
 * `.toLowerCase()` para casar com a união literal do Domain
 * (`services/tags/domain/entities/Tag.ts`), sem `services/conversations`
 * precisar importar nada de `services/tags`.
 *
 * `contact: { select: { name: true } }` (2026-08-20) resolve
 * `savedContactName` pelo relacionamento já existente (`WhatsAppConversation.
 * contact`, Fase L Bloco L1) — sem consulta extra, o Prisma resolve como join
 * lateral igual já faz para `conversationTags`. Só `name` é selecionado: o
 * binário/demais colunas do contato nunca precisam sair daqui.
 */
const CONVERSATION_INCLUDE = {
  include: {
    conversationTags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    contact: { select: { name: true } },
  },
} as const;

function toDomain(row: WhatsAppConversationRow): Conversation {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    contactJid: row.contactJid,
    contactName: row.contactName ?? undefined,
    contactId: row.contactId ?? undefined,
    savedContactName: row.contact?.name ?? undefined,
    status: STATUS_TO_DOMAIN[row.status],
    assignedToUserId: row.assignedToUserId ?? undefined,
    escalatedAt: row.escalatedAt ?? undefined,
    unreadCount: row.unreadCount,
    stage: STAGE_TO_DOMAIN[row.stage],
    stageSetBy: STAGE_SET_BY_TO_DOMAIN[row.stageSetBy],
    stageUpdatedAt: row.stageUpdatedAt,
    excludedFromPipeline: row.excludedFromPipeline,
    lastMessagePreview: row.lastMessagePreview ?? undefined,
    lastMessageAt: row.lastMessageAt ?? undefined,
    aiSummary: row.aiSummary ?? undefined,
    aiSummaryUpdatedAt: row.aiSummaryUpdatedAt ?? undefined,
    aiSummaryMessageCount: row.aiSummaryMessageCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: (row.conversationTags ?? []).map((ct) => ({
      id: ct.tag.id,
      name: ct.tag.name,
      color: ct.tag.color.toLowerCase(),
    })),
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
   * #25/P6). Nenhum campo de STATUS muda quando a conversa já existe (por
   * isso `update` nunca inclui `status`), mas o Prisma ainda assim atualiza
   * `updatedAt` (`@updatedAt`) — suficiente para "última atividade" sem
   * precisar de um campo dedicado (YAGNI).
   *
   * `contactName` (Milestone 6, Bloco M6H-2b) é a ÚNICA exceção a "nenhum
   * campo muda no update": quando `create.contactName` vem definido (a
   * mensagem trouxe um `pushName`), ele entra também no `update` — o
   * contato pode mudar o nome de exibição do WhatsApp a qualquer momento, e
   * a conversa deve refletir o mais recente. Quando `create.contactName` é
   * `undefined` (mensagem sem nome), o `update` NÃO toca a coluna — nunca
   * apaga um nome já salvo por falta de nome numa mensagem posterior.
   *
   * `contactId`/`stage`/`stageSetBy` (Fase L, Bloco L5) só têm efeito na
   * CRIAÇÃO — `undefined` (o único chamador de sempre, `MessageIngestionService`,
   * nunca os define) faz o Prisma usar os defaults de coluna (`null`/`NEW`/
   * `AI`), idêntico ao comportamento anterior a este bloco. É
   * `WhatsAppCampaignMessageSender` (primeiro contato de campanha) quem passa
   * `contactId`/`stage: 'contacted'` explicitamente.
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
        contactName: create.contactName,
        contactId: create.contactId,
        status: STATUS_TO_PRISMA[create.status],
        stage: create.stage ? STAGE_TO_PRISMA[create.stage] : undefined,
        stageSetBy: create.stageSetBy ? STAGE_SET_BY_TO_PRISMA[create.stageSetBy] : undefined,
        createdAt: create.createdAt,
        updatedAt: create.updatedAt,
      },
      update: create.contactName ? { contactName: create.contactName } : {},
      ...CONVERSATION_INCLUDE,
    });

    return toDomain(row);
  }

  /**
   * Milestone 3, Bloco 4 (aditivo — ver docstring de `ConversationRepository.
   * findById`). `findUnique` por chave primária; `null` do Prisma mapeado
   * para `undefined` no Domain (contrato do port).
   */
  async findById(id: string): Promise<Conversation | undefined> {
    const row = await this.prisma.whatsAppConversation.findUnique({
      where: { id },
      ...CONVERSATION_INCLUDE,
    });
    return row ? toDomain(row) : undefined;
  }

  /**
   * Fase L, Bloco L4 (aditivo — ver docstring do port). `findFirst` (não a
   * chave única `tenantId_sessionName_contactJid`, que exige o JID, não o
   * `contactId`) — o índice `@@index([contactId])` já existente (Bloco L1)
   * mantém a busca barata.
   */
  async findByContactAndSession(
    tenantId: string,
    sessionName: string,
    contactId: string,
  ): Promise<Conversation | undefined> {
    const row = await this.prisma.whatsAppConversation.findFirst({
      where: { tenantId, sessionName, contactId },
      ...CONVERSATION_INCLUDE,
    });
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
    const data: {
      status: PrismaConversationStatus;
      assignedToUserId?: string | null;
      escalatedAt?: null;
    } = {
      status: STATUS_TO_PRISMA[status],
    };
    if (options && 'assignedToUserId' in options) {
      data.assignedToUserId = options.assignedToUserId ?? null;
    }
    // Reforma do escalonamento (2026-07-25): mesma convenção de
    // `assignedToUserId` — só `null` é aceito (ver docstring do port), então
    // basta checar presença da chave para limpar.
    if (options && 'escalatedAt' in options) {
      data.escalatedAt = null;
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
  async findAllByTenant(
    tenantId: string,
    options: FindAllByTenantOptions,
  ): Promise<ConversationPage> {
    const { status, limit, cursor, sessionName, needsHumanAttention, excludedFromPipeline } =
      options;

    const rows = await this.prisma.whatsAppConversation.findMany({
      where: {
        tenantId,
        ...(status ? { status: STATUS_TO_PRISMA[status] } : {}),
        ...(sessionName ? { sessionName } : {}),
        // Reforma do escalonamento (2026-07-25): "precisa de atenção humana"
        // agora é `escalatedAt` definido, não mais `status: 'human'` sem
        // dono (ver docstring do port).
        ...(needsHumanAttention ? { escalatedAt: { not: null } } : {}),
        // ADR #94 (2026-08-01): filtro explícito só quando informado — a
        // inbox geral continua mostrando tudo por padrão.
        ...(excludedFromPipeline !== undefined ? { excludedFromPipeline } : {}),
      },
      // Ordenação por `lastMessageAt` (2026-08-01) — representa exclusivamente
      // a última mensagem trocada (qualquer direção/origem). Escrito em UM
      // único ponto: `PrismaMessageRepository.create()`, cobrindo os 4 casos
      // de nova mensagem: cliente enviou, operador enviou pela Dashboard,
      // operador enviou pelo WhatsApp oficial (ADR #97), IA respondeu.
      // Ações administrativas (`updateStatus`, `flagNeedsHumanAttention`,
      // `updateStage`, `setExcludedFromPipeline`) continuam bumpando `updatedAt`
      // livremente — esse timestamp já não afeta a posição na fila.
      // `nulls: 'last'` OBRIGATÓRIO: Postgres default para DESC é NULLS FIRST,
      // o que colocaria conversas legadas (lastMessageAt = null, anteriores ao
      // F1.7) presas no topo da fila indefinidamente.
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      ...CONVERSATION_INCLUDE,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      conversations: page.map(toDomain),
      nextCursor: hasMore ? page[page.length - 1].id : undefined,
    };
  }

  /**
   * Reforma do escalonamento (2026-07-25) — ver docstring do port. `updateMany`
   * pelo mesmo motivo de `updateStatus` (defesa em profundidade, `id` E
   * `tenantId`); SEMPRE grava `at` (nunca condicional), inclusive quando a
   * conversa já tinha `escalatedAt` de uma escalada anterior — é assim que
   * uma segunda escalada da mesma conversa fica detectável pelo dashboard
   * (o timestamp muda, mesmo a flag já "estando ligada").
   */
  async flagNeedsHumanAttention(
    tenantId: string,
    conversationId: string,
    at: Date,
  ): Promise<Conversation | undefined> {
    const result = await this.prisma.whatsAppConversation.updateMany({
      where: { id: conversationId, tenantId },
      data: { escalatedAt: at },
    });

    if (result.count === 0) {
      return undefined;
    }

    return this.findById(conversationId);
  }

  /**
   * Indicador de não lidas (2026-07-25) — ver docstring do port. `updateMany`
   * com `increment: 1` é a operação ATÔMICA do Prisma para este caso (nunca
   * ler o valor atual e escrever `valor + 1` em duas etapas separadas — duas
   * mensagens quase simultâneas do mesmo contato perderiam um incremento
   * nessa corrida). Silenciosamente não-op (`count === 0`) se a conversa não
   * existir/não pertencer ao tenant — mesmo padrão de `updateStatus`, mas sem
   * devolver nada: quem chama (`MessageIngestionService`) já trata isto como
   * auxiliar/resiliente e não precisa da conversa atualizada de volta.
   */
  async incrementUnreadCount(tenantId: string, conversationId: string): Promise<void> {
    await this.prisma.whatsAppConversation.updateMany({
      where: { id: conversationId, tenantId },
      data: { unreadCount: { increment: 1 } },
    });
  }

  /**
   * Vínculo com a identidade do contato (Fase L, Bloco L1) — ver docstring do
   * port.
   *
   * `contactId: null` FAZ PARTE do critério de busca, não é detalhe: é ele que
   * transforma esta operação em "preencher se vazio" em vez de "sobrescrever".
   * Uma conversa já vinculada simplesmente não casa com o `where`
   * (`count === 0`, sem erro), então a chamada pode rodar a cada mensagem sem
   * risco de desfazer uma reconciliação de identidade feita depois.
   *
   * `updateMany` (não `update`) pelo mesmo motivo dos demais métodos deste
   * repositório: escopar por `tenantId` junto com o `id` é defesa em
   * profundidade contra IDOR, e a ausência de linha vira `count === 0` em vez
   * de exceção.
   */
  async linkContact(tenantId: string, conversationId: string, contactId: string): Promise<void> {
    await this.prisma.whatsAppConversation.updateMany({
      where: { id: conversationId, tenantId, contactId: null },
      data: { contactId },
    });
  }

  /**
   * Indicador de não lidas (2026-07-25) — ver docstring do port. Zera
   * incondicionalmente (não um `decrement`) — abrir a conversa marca TUDO
   * como lido de uma vez, mesmo racional de "marcar tudo como lido" do
   * WhatsApp/Telegram reais. `updateMany` pelo mesmo motivo de
   * `updateStatus`/`flagNeedsHumanAttention` (defesa em profundidade).
   *
   * CORREÇÃO (2026-07-26): `updatedAt` é `@updatedAt` no schema — o Prisma
   * bumpa esse timestamp em TODO `update`/`updateMany`, mesmo quando o único
   * campo que muda é `unreadCount`. Como `findAllByTenant` ordena por
   * `updatedAt` (ADR #79, "conversa mais ativa primeiro"), isso fazia uma
   * conversa "subir" na lista só por ter sido ABERTA/lida — sem nenhuma
   * mensagem nova de verdade —, embaralhando a ordem visível a cada clique.
   * Corrigido lendo o `updatedAt` atual ANTES do update e regravando o MESMO
   * valor explicitamente: o Prisma respeita um `updatedAt` informado no
   * `data` (só auto-gerencia quando o campo está AUSENTE do payload) — o
   * timestamp de atividade real da conversa fica intocado, só `unreadCount`
   * muda de fato.
   */
  async markAsRead(tenantId: string, conversationId: string): Promise<Conversation | undefined> {
    const current = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { updatedAt: true },
    });
    if (!current) {
      return undefined;
    }

    const result = await this.prisma.whatsAppConversation.updateMany({
      where: { id: conversationId, tenantId },
      data: { unreadCount: 0, updatedAt: current.updatedAt },
    });

    if (result.count === 0) {
      return undefined;
    }

    return this.findById(conversationId);
  }

  /**
   * Pipeline de CRM (Milestone 6, Bloco M6H-5, 2026-07-30) — ver docstring
   * do port. `updateMany` pelo mesmo motivo dos demais métodos de escrita
   * (defesa em profundidade, `id` E `tenantId`). `stageUpdatedAt` sempre
   * `new Date()` no momento da chamada (hora da aplicação, não do banco —
   * mesmo padrão já usado em `flagNeedsHumanAttention`, que recebe `at` de
   * fora; aqui não há necessidade de controlar o timestamp externamente,
   * então a implementação gera a hora ela mesma).
   */
  async updateStage(
    tenantId: string,
    conversationId: string,
    stage: Conversation['stage'],
    setBy: Conversation['stageSetBy'],
  ): Promise<Conversation | undefined> {
    const result = await this.prisma.whatsAppConversation.updateMany({
      where: { id: conversationId, tenantId },
      data: {
        stage: STAGE_TO_PRISMA[stage],
        stageSetBy: STAGE_SET_BY_TO_PRISMA[setBy],
        stageUpdatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return undefined;
    }

    return this.findById(conversationId);
  }

  /**
   * ADR #94 (2026-08-01) — ver docstring do port. `updateMany` pelo mesmo
   * motivo dos demais métodos de escrita (defesa em profundidade).
   */
  async setExcludedFromPipeline(
    tenantId: string,
    conversationId: string,
    excluded: boolean,
  ): Promise<Conversation | undefined> {
    const result = await this.prisma.whatsAppConversation.updateMany({
      where: { id: conversationId, tenantId },
      data: { excludedFromPipeline: excluded },
    });

    if (result.count === 0) {
      return undefined;
    }

    return this.findById(conversationId);
  }

  async updateAiSummary(
    tenantId: string,
    conversationId: string,
    summary: string,
    messageCount: number,
  ): Promise<Conversation | undefined> {
    const result = await this.prisma.whatsAppConversation.updateMany({
      where: { id: conversationId, tenantId },
      data: {
        aiSummary: summary,
        aiSummaryMessageCount: messageCount,
        aiSummaryUpdatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return undefined;
    }

    return this.findById(conversationId);
  }
}
