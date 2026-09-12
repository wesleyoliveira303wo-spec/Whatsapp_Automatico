/**
 * Porta de 1 método (2026-09-12) — pede a atualização da foto de perfil do
 * PRÓPRIO número de uma sessão (a que aparece no Workspace e no card de
 * Configurações, `${phoneNumber}@s.whatsapp.net`).
 *
 * Achado: desde a mudança de gatilho de 2026-09-05 (`ContactAvatarService`),
 * quem enfileira uma foto para buscar é a chegada de uma MENSAGEM daquele
 * contato — e a sessão nunca manda mensagem para si mesma. O número da
 * própria sessão nunca tinha, portanto, NENHUM caminho que pedisse a foto
 * dele — diferente de um contato comum, que eventualmente tenta de novo (o
 * WhatsApp pode não responder, mas o pedido acontece), a foto da sessão
 * simplesmente nunca era perguntada. `SessionManager` consome esta porta ao
 * confirmar conexão (`init()` e o evento `status_changed`) para fechar essa
 * lacuna, sem o bounded context de sessões precisar conhecer
 * `ContactAvatarService` por inteiro — implementada por ele mesmo.
 */
export interface OwnAvatarRefresher {
  /** Nunca lança — falhar ao pedir a foto não pode impedir a sessão de conectar. */
  ensureOwnAvatarQueued(tenantId: string, sessionName: string, phoneNumber: string): Promise<void>;
}
