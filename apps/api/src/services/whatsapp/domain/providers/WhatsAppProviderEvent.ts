import { WhatsAppSession } from '../entities/WhatsAppSession';
import { WhatsAppDisconnectReason } from '../entities/WhatsAppDisconnectReason';

/**
 * Evento assíncrono emitido por um `WhatsAppProvider`. União discriminada
 * por `type` — pensada para crescer (ex.: `qr_updated`, `message_received`,
 * `presence_updated`) sem exigir um novo método de assinatura no port
 * `WhatsAppProvider` a cada nova capacidade (substitui o antigo
 * `WhatsAppProviderStatusUpdate` + `onStatusChange`, que só suportava um
 * tipo de evento — ver ADR sobre o Architecture Gate Review, achado F2).
 *
 * Hoje só existe `'status_changed'`, porque é o único evento com um
 * consumidor real (`SessionManager`). Deliberadamente não antecipamos a
 * forma de `qr_updated`/`message_received`/`presence_updated` agora — o
 * formato real desses eventos só fica claro quando o Item 3 (BaileysProvider)
 * for implementado contra a biblioteca de verdade. Adicionar um novo membro
 * a esta união no futuro é aditivo: não quebra nenhum consumidor existente,
 * que pode continuar ignorando tipos que não reconhece (ver o padrão de
 * early-return em `SessionManager.subscribeToProviderEvents`).
 *
 * `disconnectReason` (Production Hardening, Bloco 8a): presente (com um
 * `WhatsAppDisconnectReason`) quando `status === 'disconnected'`; ausente
 * (`undefined`) em qualquer outra transição — é assim que
 * `BaileysProvider` comunica tanto o motivo de uma queda quanto a limpeza
 * desse motivo ao reconectar, para o mesmo consumidor (`SessionManager`)
 * que já reage a este evento.
 *
 * `'message_received'` (Milestone 3, Bloco 1): segundo membro real desta
 * união — mensagem inbound 1:1 já filtrada pelo provider (nunca `fromMe`,
 * nunca de grupo — ver `BaileysProvider`/§0 do
 * `MILESTONE_003_AI_AUTORESPONDER.md`). Carrega `from`/`content`/
 * `receivedAt` — o suficiente para o consumidor (`MessageReceivedHandler`,
 * Bloco 2) persistir a mensagem; não inclui `tenantId`/`sessionName` (o
 * consumidor já os recebe separadamente de quem repassa o evento — ver
 * `SessionManager`). Desde a Fase 1/Bloco F1.1 (ADR #90), também carrega
 * `contentType`/`media` para mensagens de imagem/áudio/vídeo/documento/
 * figurinha — antes desta extensão, o `BaileysProvider` descartava essas
 * mensagens em silêncio antes mesmo de emitir o evento.
 */
export type WhatsAppMessageContentTypeEvent =
  'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker';

/**
 * Referência a um arquivo de mídia do WhatsApp — nunca o conteúdo binário
 * (ADR #90: mídia é servida sob demanda via proxy, nunca persistida em
 * disco/storage de objetos nesta rodada). Mesmo shape de
 * `MessageMediaReference`/`InboundWhatsAppMediaReference`, duplicado aqui
 * pela mesma razão de fronteira entre bounded contexts (`services/whatsapp`
 * não deve depender de `services/conversations`, e este arquivo é
 * consumido antes mesmo de `InboundWhatsAppMessage` existir).
 */
export interface WhatsAppMediaReferenceEvent {
  mimeType: string;
  url: string;
  mediaKeyEncrypted: string;
  fileName?: string;
}

export type WhatsAppProviderEvent =
  | {
      type: 'status_changed';
      status: WhatsAppSession['status'];
      phoneNumber?: string;
      disconnectReason?: WhatsAppDisconnectReason;
    }
  | {
      type: 'message_received';
      from: string;
      content: string;
      receivedAt: Date;
      /**
       * Direção da mensagem em relação à conta conectada (ADR #97):
       * - `'inbound'`  — mensagem recebida de um contato (padrão histórico).
       * - `'outbound'` — mensagem enviada pelo operador de OUTRO dispositivo
       *   (WhatsApp mobile/web) — não é um eco do nosso próprio stack, que já
       *   persiste via `OutboundCommandConsumer`/`sendAgentMediaMessage`.
       * `undefined` ≡ `'inbound'` (compatibilidade total com todo emissor
       * anterior a esta extensão).
       */
      direction?: 'inbound' | 'outbound';
      /**
       * Nome de exibição do WhatsApp do remetente (`pushName`, Milestone 6,
       * Bloco M6H-2b) — `undefined` quando o Baileys não o incluiu no evento.
       * Para mensagens `direction='outbound'`, este campo é sempre `undefined`
       * (o `pushName` de um `fromMe` seria o nome do próprio operador, não do
       * contato).
       */
      contactName?: string;
      /**
       * Fase 1, Bloco F1.1 (ADR #90). `undefined` = `'text'` (compatibilidade
       * total com todo consumidor existente antes deste bloco).
       */
      contentType?: WhatsAppMessageContentTypeEvent;
      /** Presente só quando `contentType` não é `'text'`/ausente. */
      media?: WhatsAppMediaReferenceEvent;
    };
