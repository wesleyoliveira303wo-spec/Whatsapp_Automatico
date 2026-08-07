/**
 * Motivo da ÚLTIMA desconexão reportada pelo provider (Production
 * Hardening, Bloco 8a — achado P4, ver PROJECT_STATUS.md). Informação de
 * DIAGNÓSTICO, deliberadamente separada de `WhatsAppSession['status']` (ver
 * docstring de `WhatsAppSession.disconnectReason`): misturar ESTADO (a
 * máquina de estados `connecting`/`connected`/`disconnected`, da qual
 * `SessionManager`/`WhatsAppConnectionRegistry` dependem estruturalmente —
 * ex.: o contador de `generation` incrementa especificamente quando
 * `status === 'connecting'`) com MOTIVO (por que a ÚLTIMA desconexão
 * aconteceu) seria um cheiro de modelagem: não haveria como representar
 * "reconectando depois de um logout" sem perder a informação de que a
 * sessão está, agora, `'connecting'`.
 *
 * Só é significativo enquanto `status === 'disconnected'` — é limpo
 * (`undefined`) assim que a sessão entra em `'connecting'` ou `'connected'`
 * de novo (ver `BaileysProvider.connect()`/`handleConnectionUpdate`).
 *
 * Subconjunto deliberadamente pequeno dos motivos que o Baileys reporta
 * (`DisconnectReason.*`, biblioteca `@whiskeysockets/baileys`) — não replica
 * a lista inteira de códigos numéricos da biblioteca em Domain (YAGNI):
 *
 * - `logged_out` — usuário desvinculou o dispositivo pelo celular
 *   (`DisconnectReason.loggedOut`, já tratado antes deste bloco: BUG-13,
 *   limpeza de credenciais).
 * - `restart_required` — reconexão obrigatória do próprio protocolo
 *   Multi-Device logo após um pareamento (`DisconnectReason.restartRequired`,
 *   já tratado antes deste bloco: BUG-14, reconexão automática).
 * - `connection_lost` — queda de conexão genérica.
 * - `timed_out` — mantido no tipo por completude de Domain, mas hoje
 *   INALCANÇÁVEL a partir de `BaileysProvider`: `DisconnectReason.connectionLost`
 *   e `DisconnectReason.timedOut` são o MESMO valor numérico (408) na
 *   biblioteca real (verificado em
 *   `node_modules/@whiskeysockets/baileys/lib/Types/index.d.ts`) — o próprio
 *   protocolo não os distingue, então nenhum código que dependa só do
 *   `statusCode` consegue distingui-los. Ver `BaileysProvider.mapDisconnectReason`.
 * - `unknown` — qualquer motivo não mapeado explicitamente acima (inclui
 *   `badSession`, `multideviceMismatch`, `forbidden`, `unavailableService`,
 *   `connectionClosed`, `connectionReplaced` e a ausência de `statusCode`) —
 *   fallback deliberado em vez de expandir especulativamente esta união para
 *   cada código que o Baileys já define hoje, sem um consumidor real que
 *   precise distingui-los (mesmo racional do achado F6 para `provider`).
 */
export type WhatsAppDisconnectReason =
  'logged_out' | 'restart_required' | 'connection_lost' | 'timed_out' | 'unknown';
