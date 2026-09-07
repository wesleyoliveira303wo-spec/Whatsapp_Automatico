import { TenantOverview } from './entities/TenantOverview';
import {
  LiveSessionStatus,
  liveStatusKey,
} from './providers/PlatformLiveSessionStatusResolver';

/** Sessão crua do banco — o mínimo para reconciliar contagens. */
export interface RawSession {
  tenantId: string;
  sessionName: string;
  /** Status do banco em minúsculo (`connected` / `disconnected` / `connecting`). */
  status: LiveSessionStatus;
}

/**
 * Sobrepõe o status de sessão do BANCO pelo status do REGISTRY AO VIVO
 * (ADR #80) e recalcula `connectedSessionCount` de cada `TenantOverview`.
 *
 * FUNÇÃO PURA. Recebe: os overviews com contagens do banco, a lista crua de
 * todas as sessões, e o mapa `"<tenantId>:<sessionName>" -> statusAoVivo`
 * (só as que têm instância viva). Devolve novos overviews — os originais não
 * são mutados.
 *
 * Sem entrada no mapa para uma sessão → vale o status do banco (sessão nunca
 * tocada neste processo, ou processo sem registry). `sessionCount` nunca
 * muda — só quantas dessas estão conectadas AGORA.
 */
export function applyLiveSessionOverlay(
  overviews: TenantOverview[],
  rawSessions: RawSession[],
  liveStatuses: Map<string, LiveSessionStatus>,
): TenantOverview[] {
  const connectedByTenant = new Map<string, number>();
  for (const session of rawSessions) {
    const live = liveStatuses.get(liveStatusKey(session));
    const effective = live ?? session.status;
    if (effective === 'connected') {
      connectedByTenant.set(session.tenantId, (connectedByTenant.get(session.tenantId) ?? 0) + 1);
    }
  }

  return overviews.map((overview) => {
    const connected = connectedByTenant.get(overview.id);
    // Se o tenant não tem nenhuma sessão na lista crua, não mexe (mantém o
    // que o overview já trouxe — que também será 0/0).
    if (connected === undefined && overview.sessionCount === 0) return overview;
    return { ...overview, connectedSessionCount: connected ?? 0 };
  });
}
