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
 * união — mensagem de texto inbound 1:1 já filtrada pelo provider (nunca
 * `fromMe`, nunca de grupo — ver `BaileysProvider`/§0 do
 * `MILESTONE_003_AI_AUTORESPONDER.md`, fora de escopo mídia/grupo/broadcast
 * nesta milestone). Carrega `from`/`content`/`receivedAt` — o suficiente
 * para o consumidor (futuro `MessageReceivedHandler`, Bloco 2) persistir a
 * mensagem; não inclui `tenantId`/`sessionName` (o consumidor já os recebe
 * separadamente de quem repassa o evento — ver `SessionManager`).
 */
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
    };
