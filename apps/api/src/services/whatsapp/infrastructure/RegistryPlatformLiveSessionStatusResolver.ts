import { Logger } from '../../../shared/domain/Logger';
import {
  LiveSessionStatus,
  PlatformLiveSessionStatusResolver,
  SessionRef,
  liveStatusKey,
} from '../../platform/domain/providers/PlatformLiveSessionStatusResolver';
import { WhatsAppConnectionRegistry } from '../application/WhatsAppConnectionRegistry';

/**
 * `PlatformLiveSessionStatusResolver` sobre o `WhatsAppConnectionRegistry`
 * (Fase 3 do `/admin`, ADR #80).
 *
 * Vive em `services/whatsapp/infrastructure` porque é aqui que o registry
 * mora — mesmo padrão de `RegistryContactAvatarSource`. Consome o port
 * declarado em `services/platform/domain`, exatamente como
 * `ContactAvatarRefresherImpl` consome um port de `services/conversations`.
 *
 * Usa `peek()` (leitura pura do Map — nunca `getOrCreate()`), então listar o
 * status ao vivo NUNCA instancia um `SessionManager`/socket Baileys novo.
 * Sessão sem instância viva simplesmente não entra no mapa. Nunca lança:
 * uma falha ao consultar UMA sessão cai para "não sei" (ausente do mapa), e
 * o chamador usa o valor do banco.
 */
export class RegistryPlatformLiveSessionStatusResolver
  implements PlatformLiveSessionStatusResolver
{
  constructor(
    private readonly registry: WhatsAppConnectionRegistry,
    private readonly logger: Logger,
  ) {}

  async resolveLiveStatuses(sessions: SessionRef[]): Promise<Map<string, LiveSessionStatus>> {
    const map = new Map<string, LiveSessionStatus>();

    await Promise.all(
      sessions.map(async (ref) => {
        const live = this.registry.peek(ref.tenantId, ref.sessionName);
        if (!live) return;
        try {
          const status = await live.getStatus();
          map.set(liveStatusKey(ref), status.status);
        } catch (error) {
          // Dessincronia rara (sessão removida do banco entre a listagem e
          // aqui) — não deixa derrubar o painel; fica ausente do mapa.
          this.logger.debug('Falha ao ler status ao vivo de uma sessão para o /admin', {
            tenantId: ref.tenantId,
            sessionName: ref.sessionName,
            error,
          });
        }
      }),
    );

    return map;
  }
}
