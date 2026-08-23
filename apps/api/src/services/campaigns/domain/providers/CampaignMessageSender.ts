/**
 * Resultado de UMA tentativa de envio de mensagem de campanha — nunca lança,
 * sempre devolve um resultado (mesmo espírito de `MediaSender`/
 * `MediaDownloader`: o chamador decide o que fazer com uma falha, sem
 * try/catch espalhado). `ok: false` cobre "sem telefone resolvível para
 * envio" (ver docstring do port) quanto qualquer erro do canal de envio
 * (`WhatsAppNotConnectedError` e afins) — o motivo textual (não um enum) vira
 * `CampaignRecipient.errorMessage`, mesma disciplina de `skipReason`.
 */
export interface CampaignMessageSendResult {
  ok: boolean;
  conversationId?: string;
  failureReason?: string;
}

/**
 * O destinatário de UM envio de campanha — deliberadamente um subconjunto de
 * `CampaignRecipient` (`services/campaigns/domain/entities/Campaign.ts`), não
 * a entidade inteira: este port só precisa do necessário para resolver um
 * `contactJid` de envio, nunca de `status`/`skipReason`/etc.
 */
export interface CampaignSendRecipient {
  /** Identidade durável (Fase L, Bloco L1), quando o destinatário é um Contato salvo. */
  contactId?: string;
  /** Telefone já normalizado — sempre presente quando `contactId` está ausente (destinatário "solto", planilha/manual). */
  phoneE164?: string;
  /** Nome opcional, só existe junto de `phoneE164` (Reorganização Contatos/Campanhas, 2026-08-17). */
  name?: string;
}

/**
 * Anexo opcional de UMA campanha (Fase L, Bloco L8) — o binário JÁ RESOLVIDO
 * (o chamador, `CampaignSendJobProcessor`, busca uma vez por job via
 * `CampaignRepository.getMediaContent`; este port nunca sabe de onde o
 * binário veio). Quando presente, `content` (parâmetro de `send()`) vira a
 * LEGENDA da mídia, não uma mensagem de texto separada — mesmo padrão já
 * usado pelo operador humano (`ConversationsService.sendAgentMediaMessage`,
 * F1.3): uma mensagem só, nunca duas.
 */
export interface CampaignSendMedia {
  contentType: 'image' | 'audio' | 'video' | 'document';
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
}

/**
 * Porta (port) de ENVIO de mensagem de campanha — Fase L, Blocos L4/L5. Mesmo
 * papel estrutural de `OutboundMessageDispatcher`/`MediaSender`: o canal pelo
 * qual `services/campaigns` chega até um `WhatsAppProvider` sem NUNCA
 * importar `WhatsAppConnectionRegistry`/`SessionManager` diretamente.
 *
 * Declarado no lado CONSUMIDOR (`campaigns`), mesmo padrão de
 * `ContactResolver`/`OptOutDetector`/`AiAvailabilityRepository`
 * (`services/conversations/domain`) — não no lado que o implementa
 * (`services/whatsapp`).
 *
 * **Dois caminhos, na ordem (Fase L, Bloco L5 — `FASE_L_MOTOR_DE_LEADS.md`
 * §20, risco aceito explicitamente pelo fundador em 2026-08-18):**
 *
 * 1. **Reengajamento** (comportamento original do L4): se `contactId` está
 *    presente E já existe uma `WhatsAppConversation` desse contato nesta
 *    sessão (`ConversationRepository.findByContactAndSession`), o envio usa o
 *    `contactJid` REAL dessa conversa — nunca reconstruído do telefone
 *    (identidade ≠ endereço de envio, ver docstring de
 *    `normalizePhoneToE164`).
 * 2. **Primeiro contato** (L5, novo): sem conversa prévia, a implementação
 *    real resolve um telefone — direto de `phoneE164` (destinatário solto) ou
 *    buscando o `WhatsAppContact` por `contactId` (Contato salvo que nunca
 *    conversou nesta sessão) — constrói o `contactJid` a partir dele, envia,
 *    e CRIA a `WhatsAppConversation` (`stage: 'contacted'`, já que foi a
 *    empresa quem procurou primeiro). Sem NENHUM telefone resolvível
 *    (`contactId` sem Contato encontrado, ou nem `contactId` nem `phoneE164`),
 *    devolve `ok: false` sem tentar enviar.
 */
export interface CampaignMessageSender {
  /**
   * `media` (Fase L, Bloco L8) — OPCIONAL, `undefined` para o comportamento
   * original (só texto, L4/L5 inalterados). Quando presente, `content` vira
   * a legenda da mídia.
   */
  send(
    tenantId: string,
    sessionName: string,
    recipient: CampaignSendRecipient,
    content: string,
    media?: CampaignSendMedia,
  ): Promise<CampaignMessageSendResult>;
}
