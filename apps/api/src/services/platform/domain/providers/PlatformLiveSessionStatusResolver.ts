/** Status ao vivo de uma sessão de WhatsApp — os mesmos valores do Domain de `whatsapp`. */
export type LiveSessionStatus = 'connecting' | 'connected' | 'disconnected';

export interface SessionRef {
  tenantId: string;
  sessionName: string;
}

/**
 * Porta que o `/admin` usa para saber o status REAL de uma sessão de WhatsApp
 * — Fase 3 (`ADMIN_PLATFORM_MASTER_PLAN.md` §5.2, ADR #80).
 *
 * Por que existe: `whatsapp_sessions.status` no banco só é atualizado
 * enquanto há instância viva daquela sessão em memória. Um reinício da API
 * deixa o valor congelado no último status conhecido — podendo mostrar
 * "conectado" muito depois de a conexão ter caído. `listSessions()` do
 * produto já corrige isso sobrepondo com o estado do registry ao vivo; o
 * painel precisa da mesma correção para não disparar "WhatsApp caiu" na Fila
 * de ação por causa de um dado velho.
 *
 * Implementada em `services/whatsapp` (é lá que o `WhatsAppConnectionRegistry`
 * vive), mesmo padrão de `ContactAvatarRefresher`. Injetada de forma OPCIONAL
 * no `services/platform`: sem ela (teste, modo degradado) o painel usa o
 * valor do banco, exatamente como na Fase 2.
 */
export interface PlatformLiveSessionStatusResolver {
  /**
   * Para cada sessão informada que TEM uma instância viva no processo, o
   * status atual dela. Sessões sem instância viva simplesmente NÃO aparecem
   * no mapa — o chamador mantém o valor do banco nesse caso.
   *
   * A chave do mapa é `"<tenantId>:<sessionName>"`. Nunca lança: uma falha ao
   * consultar UMA sessão não pode derrubar o painel inteiro.
   */
  resolveLiveStatuses(sessions: SessionRef[]): Promise<Map<string, LiveSessionStatus>>;
}

/** Chave estável usada pelo mapa de `resolveLiveStatuses`. */
export function liveStatusKey(ref: SessionRef): string {
  return `${ref.tenantId}:${ref.sessionName}`;
}
