/**
 * Porta (port) de ENVIO de mídia — Fase 1, Bloco F1.3. Contrapartida exata de
 * `MediaDownloader` (Fase 1, Bloco F1.1): mesmo papel estrutural de
 * `OutboundMessageDispatcher`, é o canal pelo qual `services/conversations`
 * chega até um `WhatsAppProvider` sem NUNCA importar
 * `WhatsAppConnectionRegistry`/`SessionManager`/`WhatsAppProvider`
 * diretamente — preserva a mesma direção de dependência entre bounded
 * contexts já estabelecida no projeto.
 *
 * Deliberadamente um port SEPARADO de `MediaDownloader`, não um método a mais
 * na mesma interface — leitura e escrita de mídia têm parâmetros e contratos
 * de erro diferentes (download nunca lança, envio PRECISA propagar
 * `WhatsAppNotConnectedError` para o operador saber que falhou), e mantê-los
 * juntos obrigaria toda implementação futura a sempre suportar os dois
 * sentidos (Interface Segregation Principle).
 *
 * Implementação real (`WhatsAppMediaSender`, Infrastructure de
 * `services/whatsapp`) resolve a sessão viva via
 * `WhatsAppConnectionRegistry.getOrCreate(tenantId, sessionName)` e delega a
 * `SessionManager`/`WhatsAppProvider.sendMediaMessage`. Injetada
 * OPCIONALMENTE em `ConversationsService` (mesmo padrão de
 * `mediaDownloader`/`outboundMessageDispatcher`, via setter tardio por causa
 * da mesma ordem de composição circular já documentada no construtor de
 * `ConversationsService`) — sem ela configurada, `sendAgentMediaMessage`
 * recusa com erro claro em vez de quebrar.
 */
export interface MediaSender {
  send(
    tenantId: string,
    sessionName: string,
    to: string,
    media: {
      contentType: 'image' | 'audio' | 'video' | 'document';
      buffer: Buffer;
      mimeType: string;
      caption?: string;
      fileName?: string;
    },
  ): Promise<void>;
}
