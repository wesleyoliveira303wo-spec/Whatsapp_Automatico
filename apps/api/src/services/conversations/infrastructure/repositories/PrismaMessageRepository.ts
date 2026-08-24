import type {
  PrismaClient,
  WhatsAppMessageDirection as PrismaMessageDirection,
  WhatsAppMessageContentType as PrismaMessageContentType,
} from '@prisma/client';

import { Message, MessageContentType } from '../../domain/entities/Message';
import { MessageRepository } from '../../domain/repositories/MessageRepository';
import { buildMessagePreview } from '../../domain/policies/buildMessagePreview';

const DIRECTION_TO_PRISMA: Record<Message['direction'], PrismaMessageDirection> = {
  inbound: 'INBOUND' as PrismaMessageDirection,
  outbound: 'OUTBOUND' as PrismaMessageDirection,
};

const DIRECTION_TO_DOMAIN: Record<PrismaMessageDirection, Message['direction']> = {
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
} as Record<PrismaMessageDirection, Message['direction']>;

/**
 * Fase 1, Bloco F1.1 (ADR #90). Mesmo padrão de `Record` bidirecional já
 * usado para `direction`/`provider`/etc. neste projeto (ex.: `DIRECTION_TO_PRISMA`
 * acima, `PROVIDER_TO_PRISMA` em outros repositórios).
 */
const CONTENT_TYPE_TO_PRISMA: Record<MessageContentType, PrismaMessageContentType> = {
  text: 'TEXT' as PrismaMessageContentType,
  image: 'IMAGE' as PrismaMessageContentType,
  audio: 'AUDIO' as PrismaMessageContentType,
  video: 'VIDEO' as PrismaMessageContentType,
  document: 'DOCUMENT' as PrismaMessageContentType,
  sticker: 'STICKER' as PrismaMessageContentType,
};

const CONTENT_TYPE_TO_DOMAIN: Record<PrismaMessageContentType, MessageContentType> = {
  TEXT: 'text',
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video',
  DOCUMENT: 'document',
  STICKER: 'sticker',
} as Record<PrismaMessageContentType, MessageContentType>;

interface WhatsAppMessageRow {
  id: string;
  tenantId: string;
  conversationId: string;
  direction: PrismaMessageDirection;
  content: string;
  contentType: PrismaMessageContentType;
  mediaMimeType: string | null;
  mediaUrl: string | null;
  mediaKeyEncrypted: string | null;
  mediaFileName: string | null;
  audioTranscript: string | null;
  occurredAt: Date;
}

function toDomain(row: WhatsAppMessageRow): Message {
  const contentType = CONTENT_TYPE_TO_DOMAIN[row.contentType];
  return {
    id: row.id,
    tenantId: row.tenantId,
    conversationId: row.conversationId,
    direction: DIRECTION_TO_DOMAIN[row.direction],
    content: row.content,
    contentType,
    // `media` só é reconstruído quando o tipo não é texto E `mediaMimeType`
    // veio preenchido (defesa contra uma linha inconsistente — nunca
    // deveria acontecer, já que `create()` sempre grava os campos juntos,
    // mas um `Partial` incompleto não deveria virar uma referência de mídia
    // quebrada silenciosamente).
    //
    // BUGFIX (2026-07-31, Fase 1 F1.3): a checagem original também exigia
    // `row.mediaUrl && row.mediaKeyEncrypted` (truthy). Mídia enviada PELO
    // OPERADOR (`ConversationsService.sendAgentMediaMessage`) grava esses
    // dois campos como STRING VAZIA de propósito — nunca há URL/chave real
    // do CDN do WhatsApp para uma mídia que nasceu na Dashboard, não
    // recebida do WhatsApp. Como `''` é falsy em JS, `media` virava
    // `undefined` mesmo com `contentType`/`mediaMimeType` corretos,
    // fazendo a bolha aparecer vazia na Dashboard mesmo a mensagem tendo
    // sido entregue com sucesso no WhatsApp real. `mediaUrl`/
    // `mediaKeyEncrypted` agora usam `!= null` (aceita string vazia,
    // rejeita só null/undefined) — `mediaMimeType` continua exigido via
    // truthy porque nunca é gravado como `''` (sempre vem de um MIME type
    // real, tanto para mídia recebida quanto enviada pelo operador).
    media:
      contentType !== 'text' &&
      row.mediaMimeType &&
      row.mediaUrl != null &&
      row.mediaKeyEncrypted != null
        ? {
            mimeType: row.mediaMimeType,
            url: row.mediaUrl,
            mediaKeyEncrypted: row.mediaKeyEncrypted,
            fileName: row.mediaFileName ?? undefined,
          }
        : undefined,
    audioTranscript: row.audioTranscript ?? undefined,
    occurredAt: row.occurredAt,
  };
}

/**
 * Implementação concreta de `MessageRepository` sobre o model
 * `WhatsAppMessage` (`prisma/schema.prisma`, Milestone 3, Bloco 2) — mesmo
 * racional de nomenclatura de `PrismaConversationRepository` (evita colisão
 * com o model `Message` do domínio legado, ADR #11).
 *
 * NOTA DE VERIFICAÇÃO (mesma limitação já registrada para os demais
 * arquivos Prisma deste projeto): depende de `npx prisma generate` (Client)
 * e `npx prisma migrate deploy`/`migrate dev` (tabela) terem rodado.
 */
export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Fase 1, Bloco F1.7 (2026-08-01) — além de inserir a `WhatsAppMessage`,
   * atualiza `lastMessagePreview`/`lastMessageAt` na `WhatsAppConversation`
   * pai, dentro da MESMA transação (`$transaction`, atomicidade: nunca fica
   * uma mensagem persistida sem a prévia refletir, mesmo sob concorrência).
   * Único ponto de escrita da prévia — TODA mensagem (inbound, outbound de
   * IA/operador, mídia) passa por este método, então não há necessidade de
   * duplicar essa escrita nos chamadores (`MessageIngestionService`,
   * `ConversationsService`, `OutboundCommandConsumer`). Uma falha na
   * atualização da conversa (ex.: linha removida entre as duas operações)
   * reverte a transação inteira — mesma garantia que qualquer
   * `updateMany`/`update` deste projeto já dá para escritas denormalizadas
   * (`incrementUnreadCount`), só que aqui via transação explícita por
   * envolver duas tabelas.
   */
  async create(message: Omit<Message, 'id'>): Promise<Message> {
    const preview = buildMessagePreview({
      content: message.content,
      contentType: message.contentType,
    });

    const [row] = await this.prisma.$transaction([
      this.prisma.whatsAppMessage.create({
        data: {
          tenantId: message.tenantId,
          conversationId: message.conversationId,
          direction: DIRECTION_TO_PRISMA[message.direction],
          content: message.content,
          contentType: CONTENT_TYPE_TO_PRISMA[message.contentType],
          mediaMimeType: message.media?.mimeType,
          mediaUrl: message.media?.url,
          mediaKeyEncrypted: message.media?.mediaKeyEncrypted,
          mediaFileName: message.media?.fileName,
          occurredAt: message.occurredAt,
        },
      }),
      this.prisma.whatsAppConversation.updateMany({
        where: { id: message.conversationId, tenantId: message.tenantId },
        data: { lastMessagePreview: preview, lastMessageAt: message.occurredAt },
      }),
    ]);

    return toDomain(row);
  }

  /**
   * Fase 1, Bloco F1.1 (ADR #90, aditivo). Filtra por `tenantId` E `id` —
   * mesma defesa em profundidade de `listRecentByConversation`: uma
   * mensagem de outro tenant simplesmente não é encontrada (`undefined`),
   * nunca um erro de autorização específico.
   */
  async findById(tenantId: string, messageId: string): Promise<Message | undefined> {
    const row = await this.prisma.whatsAppMessage.findFirst({ where: { tenantId, id: messageId } });
    return row ? toDomain(row) : undefined;
  }

  /**
   * Milestone 3, Bloco 4 (aditivo — ver docstring de `MessageRepository.
   * listRecentByConversation`). Filtra por `tenantId` E `conversationId`
   * (defesa em profundidade, mesmo racional de
   * `PrismaWhatsAppSessionEventRepository.listRecentByTenantAndSessionName`),
   * ordena do mais novo para o mais antigo e limita a `limit` linhas —
   * espelha `orderBy`/`take` já usados em outros repositórios deste projeto.
   */
  async listRecentByConversation(
    tenantId: string,
    conversationId: string,
    limit: number,
  ): Promise<Message[]> {
    const rows = await this.prisma.whatsAppMessage.findMany({
      where: { tenantId, conversationId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  /**
   * Feature de transcrição de áudio (2026-08-24) — ver docstring do port.
   * `updateMany` (não `update`) escopado por `tenantId` E `id`, mesmo
   * racional de `incrementUnreadCount`/`flagNeedsHumanAttention`: zero linhas
   * afetadas (mensagem inexistente ou de outro tenant) não é erro, é
   * silenciosamente ignorado — quem chama trata como enriquecimento
   * auxiliar, nunca crítico.
   */
  async setAudioTranscript(tenantId: string, messageId: string, transcript: string): Promise<void> {
    await this.prisma.whatsAppMessage.updateMany({
      where: { tenantId, id: messageId },
      data: { audioTranscript: transcript },
    });
  }
}
