/**
 * Porta (port) de download de mídia — Fase 1, Bloco F1.1 (ADR #90). Mesmo
 * papel estrutural de `OutboundMessageDispatcher` (`services/whatsapp/domain
 * /dispatchers/OutboundMessageDispatcher.ts`): é o canal pelo qual
 * `services/conversations` (a rota REST de mídia) chega até um
 * `WhatsAppProvider` sem NUNCA importar `WhatsAppConnectionRegistry`/
 * `SessionManager`/`WhatsAppProvider` diretamente — preserva a mesma direção
 * de dependência entre bounded contexts já estabelecida no projeto
 * (`services/conversations` conhece só ports pequenos de `services/whatsapp
 * /domain`, nunca a Application/Infrastructure daquele contexto).
 *
 * Implementação real (`WhatsAppMediaDownloader`, Infrastructure de
 * `services/whatsapp`) resolve a sessão viva via
 * `WhatsAppConnectionRegistry.getOrCreate(tenantId, sessionName)` e delega a
 * `SessionManager`/`WhatsAppProvider.downloadMedia`. Injetada OPCIONALMENTE
 * em `ConversationsService` (mesmo padrão de `outboundMessageDispatcher`) —
 * sem ela configurada, a rota de mídia responde com "indisponível" em vez de
 * quebrar.
 */
export interface MediaDownloader {
  download(
    tenantId: string,
    sessionName: string,
    media: {
      contentType: 'image' | 'audio' | 'video' | 'document' | 'sticker';
      mimeType: string;
      url: string;
      mediaKeyEncrypted: string;
    },
  ): Promise<Buffer | undefined>;
}
