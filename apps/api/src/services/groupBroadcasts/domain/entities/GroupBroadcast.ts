/**
 * Espelha `CampaignStatus` do Prisma (o model reaproveita o mesmo enum). Literal
 * duplicado de propósito — mesmo racional de `CampaignLinkedConversationStage`:
 * não importar um tipo de outro bounded context só por uma união de valores.
 * `scheduled` não é produzido nesta entrega (recorrência ficou para depois).
 */
export type GroupBroadcastStatus =
  'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

/**
 * Mídia aceita num disparo em grupos: o pedido do fundador foi literalmente
 * "mensagem, imagem, vídeo". Áudio/documento ficaram de fora nesta entrega
 * (registrado em `PRODUCT_BACKLOG.md` §3).
 */
export type GroupBroadcastMediaContentType = 'image' | 'video';

/**
 * Um disparo ÚNICO de mensagem em grupos de WhatsApp — ver docstring do model
 * `GroupBroadcast` no `schema.prisma` para o porquê de ser uma entidade própria
 * e não uma `Campaign`.
 *
 * Mesmo estilo de `Campaign`: interface de dados, sem métodos. `media` carrega
 * só METADADOS — o binário nunca viaja nesta entidade (é o que toda resposta
 * JSON de lista/detalhe serializa); só `GroupBroadcastRepository.getMediaContent`
 * o lê.
 */
export interface GroupBroadcast {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  /** Texto publicado; com mídia, vira a LEGENDA (uma mensagem só, nunca duas). */
  messageTemplate: string;
  status: GroupBroadcastStatus;
  intervalSeconds: number;
  pausedReason?: string;
  createdByUserId?: string;
  media?: {
    contentType: GroupBroadcastMediaContentType;
    mimeType: string;
    fileName?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type GroupBroadcastTargetStatus = 'pending' | 'sent' | 'failed' | 'skipped';

/**
 * Motivos de um grupo nascer suprimido (`skipped`) — decididos na criação por
 * `determineGroupTargetSkipReason`, a partir da listagem AO VIVO dos grupos (o
 * servidor nunca confia no que o cliente diz sobre o grupo).
 */
export type GroupBroadcastSkipReason = 'admin_only_group' | 'group_not_found';

export interface GroupBroadcastTarget {
  id: string;
  tenantId: string;
  broadcastId: string;
  groupJid: string;
  /** Retrato do nome no momento da criação. */
  groupName: string;
  status: GroupBroadcastTargetStatus;
  skipReason?: string;
  errorMessage?: string;
  sentAt?: Date;
  attemptedAt?: Date;
  createdAt: Date;
}

/** Contagem por status dos grupos de um disparo — sempre as quatro chaves. */
export interface GroupBroadcastSummary {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
}
