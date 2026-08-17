/**
 * Resultado de UMA tentativa de envio de mensagem de campanha — nunca lança,
 * sempre devolve um resultado (mesmo espírito de `MediaSender`/
 * `MediaDownloader`: o chamador decide o que fazer com uma falha, sem
 * try/catch espalhado). `ok: false` cobre tanto "sem conversa existente
 * nesta sessão" (ver docstring do port) quanto qualquer erro do canal de
 * envio (`WhatsAppNotConnectedError` e afins) — o motivo textual (não um
 * enum) vira `CampaignRecipient.errorMessage`, mesma disciplina de
 * `skipReason`.
 */
export interface CampaignMessageSendResult {
  ok: boolean;
  conversationId?: string;
  failureReason?: string;
}

/**
 * Porta (port) de ENVIO de mensagem de campanha — Fase L, Bloco L4. Mesmo
 * papel estrutural de `OutboundMessageDispatcher`/`MediaSender`: o canal pelo
 * qual `services/campaigns` chega até um `WhatsAppProvider` sem NUNCA
 * importar `WhatsAppConnectionRegistry`/`SessionManager` diretamente.
 *
 * Declarado no lado CONSUMIDOR (`campaigns`), mesmo padrão de
 * `ContactResolver`/`OptOutDetector`/`AiAvailabilityRepository`
 * (`services/conversations/domain`) — não no lado que o implementa
 * (`services/whatsapp`).
 *
 * **DELIBERADAMENTE não aceita um `contactJid`/telefone livre.** Recebe
 * `contactId` (a identidade durável, Fase L Bloco L1) — a implementação real
 * (`WhatsAppCampaignMessageSender`) resolve o `contactJid` de ENVIO a partir
 * da conversa JÁ EXISTENTE daquele contato naquela sessão
 * (`ConversationRepository.findByContactAndSession`), nunca reconstruído a
 * partir do telefone canônico (identidade ≠ endereço de envio — ver
 * docstring de `normalizePhoneToE164`). Se não existir conversa prévia,
 * devolve `ok: false` — é exatamente o filtro que restringe o L4 a
 * REENGAJAMENTO de conversas reais, nunca a uma lista fria (decisão
 * registrada em `FASE_L_MOTOR_DE_LEADS.md` §20).
 */
export interface CampaignMessageSender {
  send(
    tenantId: string,
    sessionName: string,
    contactId: string,
    content: string,
  ): Promise<CampaignMessageSendResult>;
}
