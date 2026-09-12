import {
  GroupMessageSender,
  GroupMessageSendResult,
  GroupSendMedia,
} from '../../groupBroadcasts/domain/providers/GroupMessageSender';
import { WhatsAppConnectionRegistry } from '../application/WhatsAppConnectionRegistry';
import { WhatsAppNotConnectedError } from '../domain/errors/WhatsAppNotConnectedError';
import { Logger } from '../../../shared/domain/Logger';

/** Mesmos valores de `WhatsAppCampaignMessageSender` — a instabilidade observada é uma reconexão de segundos. */
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 5000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GroupSendRetryOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Implementação real do port `GroupMessageSender` — Disparos em grupos
 * (2026-09-11). Vive em `services/whatsapp/infrastructure` porque precisa do
 * `WhatsAppConnectionRegistry` (único dono dos sockets, ADR #54).
 *
 * `sendMessage`/`sendMediaMessage` do `SessionManager` já mandam direto para
 * `socket.sendMessage(jid, ...)`, então um JID `@g.us` funciona como destino
 * sem nenhum caminho novo no provider. O eco da nossa própria mensagem nunca
 * vira conversa: o provider descarta todo `@g.us` na entrada
 * (`isIgnoredChatJid`).
 *
 * Diferente de `WhatsAppCampaignMessageSender`, NÃO cria `WhatsAppConversation`
 * nem `WhatsAppMessage` — grupo é destino de publicação, não conversa do CRM.
 *
 * Retentativa curta só em `WhatsAppNotConnectedError` (mesmo motivo de
 * `WhatsAppCampaignMessageSender.sendWithRetry`: o processor marca `failed`
 * na primeira tentativa, então um retry do BullMQ nunca reenviaria). Qualquer
 * outro erro falha na hora e conta para o disjuntor.
 */
export class WhatsAppGroupMessageSender implements GroupMessageSender {
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(
    private readonly registry: WhatsAppConnectionRegistry,
    private readonly logger: Logger,
    retryOptions: GroupSendRetryOptions = {},
  ) {
    this.maxRetries = retryOptions.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = retryOptions.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.sleepFn = retryOptions.sleepFn ?? defaultSleep;
  }

  async send(
    tenantId: string,
    sessionName: string,
    groupJid: string,
    content: string,
    media?: GroupSendMedia,
  ): Promise<GroupMessageSendResult> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const sessionManager = this.registry.getOrCreate(tenantId, sessionName);
        if (media) {
          // `content` vira a LEGENDA — uma mensagem só, nunca duas.
          await sessionManager.sendMediaMessage(groupJid, { ...media, caption: content });
        } else {
          await sessionManager.sendMessage(groupJid, content);
        }
        return { ok: true };
      } catch (error) {
        const retryable = error instanceof WhatsAppNotConnectedError;
        if (!retryable || attempt === this.maxRetries) {
          this.logger.warn('Falha ao publicar mensagem em grupo do WhatsApp', {
            tenantId,
            sessionName,
            groupJid,
            attempts: attempt + 1,
            error,
          });
          return {
            ok: false,
            failureReason: error instanceof Error ? error.message : 'erro_ao_enviar',
          };
        }
        this.logger.warn('Publicação em grupo encontrou sessão desconectada — retentando', {
          tenantId,
          sessionName,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
        });
        // eslint-disable-next-line no-await-in-loop
        await this.sleepFn(this.retryDelayMs);
      }
    }
    return { ok: false, failureReason: 'erro_ao_enviar' };
  }
}
