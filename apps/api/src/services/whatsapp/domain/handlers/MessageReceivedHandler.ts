/**
 * Mensagem inbound já filtrada (nunca `fromMe`, nunca de grupo — ver
 * `BaileysProvider`) repassada por `SessionManager` a quem tiver interesse
 * em processá-la (Milestone 3, Bloco 2: `MessageIngestionService`, em
 * `services/conversations/`). `tenantId`/`sessionName` vêm de
 * `SessionManager` (que já os conhece via `WhatsAppSessionKey`) — o próprio
 * evento do provider (`WhatsAppProviderEvent`) não os carrega, porque uma
 * instância de `WhatsAppProvider` já corresponde a exatamente uma sessão.
 */
export interface InboundWhatsAppMessage {
  tenantId: string;
  sessionName: string;
  from: string;
  content: string;
  receivedAt: Date;
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
