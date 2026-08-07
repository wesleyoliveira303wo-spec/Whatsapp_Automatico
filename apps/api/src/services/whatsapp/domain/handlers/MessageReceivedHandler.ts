/**
 * Tipo de conteúdo de uma mensagem inbound — Fase 1, Bloco F1.1 (ADR #90).
 * Mesmo vocabulário de `services/conversations/domain/entities/Message.ts`
 * (`MessageContentType`) — deliberadamente NÃO importado dali: esta interface
 * vive em `services/whatsapp/domain`, que não deve depender de
 * `services/conversations` (direção de dependência entre bounded contexts já
 * estabelecida — `WhatsAppProviderEvent`/`InboundWhatsAppMessage` não conhecem
 * nenhum tipo de `services/conversations`). União literal duplicada de
 * propósito, não uma importação cruzada.
 */
export type InboundWhatsAppMessageContentType =
  'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker';

/**
 * Referência a um arquivo de mídia do WhatsApp (Fase 1, Bloco F1.1, ADR
 * #90) — mesmo shape de `MessageMediaReference` (Domain de
 * `services/conversations`), duplicado aqui pelo mesmo motivo de fronteira
 * entre bounded contexts explicado acima.
 */
export interface InboundWhatsAppMediaReference {
  mimeType: string;
  url: string;
  mediaKeyEncrypted: string;
  fileName?: string;
}

/**
 * Mensagem de WhatsApp repassada por `SessionManager` a quem tiver interesse
 * em processá-la (Milestone 3, Bloco 2: `MessageIngestionService`, em
 * `services/conversations/`). Desde ADR #97, inclui também mensagens enviadas
 * pelo operador de OUTRO dispositivo (`direction='outbound'`). `tenantId`/
 * `sessionName` vêm de `SessionManager` (que já os conhece via
 * `WhatsAppSessionKey`) — o próprio evento do provider
 * (`WhatsAppProviderEvent`) não os carrega, porque uma instância de
 * `WhatsAppProvider` já corresponde a exatamente uma sessão.
 */
export interface InboundWhatsAppMessage {
  tenantId: string;
  sessionName: string;
  from: string;
  content: string;
  receivedAt: Date;
  /**
   * Nome de exibição do WhatsApp do remetente (`pushName`, Milestone 6,
   * Bloco M6H-2b) — `undefined` quando o evento não carregou um (nem todo
   * evento do Baileys traz; ver `BaileysProvider.handleMessagesUpsert`).
   */
  contactName?: string;
  /**
   * Fase 1, Bloco F1.1 (ADR #90). `undefined` = `'text'` (compatibilidade
   * total com todo emissor existente antes deste bloco — `BaileysProvider`
   * só ganha reconhecimento de mídia no bloco seguinte, F1.1-3).
   */
  /**
   * Direção da mensagem (ADR #97): `'inbound'` (padrão histórico) ou
   * `'outbound'` (enviada pelo operador de outro dispositivo). `undefined` ≡
   * `'inbound'` — nenhum emissor existente antes desta extensão precisa mudar.
   */
  direction?: 'inbound' | 'outbound';
  contentType?: InboundWhatsAppMessageContentType;
  /** Presente só quando `contentType !== 'text'` (ou ausente). */
  media?: InboundWhatsAppMediaReference;
}

/**
 * Porta (port) do Domain de `services/whatsapp`, implementada por um
 * bounded context externo (Milestone 3, Bloco 2: `MessageIngestionService`
 * de `services/conversations/`). Mesmo padrão de dispatch-via-porta-injetada
 * já usado para `WhatsAppSessionEventRepository` (ADR #49) — `SessionManager`
 * conhece só este contrato pequeno, nunca `services/conversations/`
 * diretamente, preservando a direção de dependência da Clean Architecture
 * (nenhum bounded context de mais alto nível é importado por
 * `services/whatsapp`).
 *
 * Dependência OPCIONAL em `SessionManager` (Bloco 1) — ainda não existe
 * nenhuma implementação real (`services/conversations/` só chega no Bloco
 * 2); sem um handler configurado, mensagens recebidas são apenas ignoradas,
 * nunca perdidas de forma que quebre algo (ver `SessionManager`).
 */
export interface MessageReceivedHandler {
  handle(message: InboundWhatsAppMessage): Promise<void>;
}
