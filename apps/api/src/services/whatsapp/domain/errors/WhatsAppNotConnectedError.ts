/**
 * Erro de Domain para quando `WhatsAppProvider.sendMessage()` é chamado sem
 * uma conexão viva (Milestone 3, Bloco 1; ajuste de auditoria arquitetural
 * do Claude Design — ver `MILESTONE_003_AI_AUTORESPONDER.md`). Mesmo motivo
 * de `WhatsAppSessionNotFoundError`/`WhatsAppQRCodeNotAvailableError`:
 * permite que a Presentation mapeie este erro por classe (`instanceof`),
 * nunca por comparação de string de mensagem.
 *
 * "Conexão viva" significa socket presente E `currentStatus === 'connected'`
 * — a mera existência do socket não basta (uma sessão em `'connecting'`
 * também tem um socket, mas não está pronta para enviar). Ver
 * `BaileysProvider.sendMessage()`.
 */
export class WhatsAppNotConnectedError extends Error {
  constructor(tenantId: string, sessionName: string) {
    super(`Sessão do WhatsApp não está conectada (tenantId=${tenantId}, sessionName=${sessionName}) — não é possível enviar mensagem.`);
    this.name = 'WhatsAppNotConnectedError';
  }
}
