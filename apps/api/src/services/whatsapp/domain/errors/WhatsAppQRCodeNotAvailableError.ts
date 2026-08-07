/**
 * Erro de Domain para quando `getQRCode()` é chamado antes de a sessão ter
 * recebido um QR Code do provider (nenhum evento `connection.update` com
 * campo `qr` chegou ainda). Substitui o uso de `Error` genérico (BUG-07),
 * pelo mesmo motivo do `WhatsAppSessionNotFoundError`: permite que a camada
 * de Presentation (futuro `errorMiddleware`, Bloco 7) mapeie este erro para
 * um status HTTP específico pelo nome da classe, e não por comparação de
 * string de mensagem.
 *
 * Não importa nada de Infrastructure nem de Baileys — apenas `Error`
 * (global). `tenantId`/`sessionName` são recebidos como strings simples,
 * não como `WhatsAppSessionKey`, para não acoplar este erro de Domain a
 * outro tipo de Domain sem necessidade real (a mensagem só precisa
 * identificar a sessão para fins de log/depuração).
 */
export class WhatsAppQRCodeNotAvailableError extends Error {
  constructor(tenantId: string, sessionName: string) {
    super(
      `QR Code ainda não disponível para esta sessão (tenantId=${tenantId}, sessionName=${sessionName}) — aguarde o evento de conexão gerar um.`,
    );
    this.name = 'WhatsAppQRCodeNotAvailableError';
  }
}
