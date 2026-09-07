import {
  MIN_SEARCH_QUERY_LENGTH,
  PlatformSearchGroup,
  PlatformSearchHit,
  PlatformSearchKind,
  PlatformSearchResults,
  SEARCH_LIMIT_PER_KIND,
} from '../domain/entities/PlatformSearchResult';
import {
  PlatformSearchRepository,
  RawSearchHit,
} from '../domain/repositories/PlatformSearchRepository';

/** Ordem em que os grupos aparecem — tenant primeiro (é o destino de tudo). */
const KIND_ORDER: PlatformSearchKind[] = ['tenant', 'user', 'contact', 'session', 'campaign'];

const KIND_NOUN: Record<PlatformSearchKind, string> = {
  tenant: 'Tenant',
  user: 'Usuário',
  contact: 'Contato',
  session: 'WhatsApp',
  campaign: 'Campanha',
};

/**
 * Busca global do `/admin` — Fase 6 (`ADMIN_PLATFORM_MASTER_PLAN.md` §7).
 *
 * Só orquestração: normaliza a consulta, pede ao repositório `teto + 1` linhas
 * por tipo para saber se há "e mais…", e monta o rótulo/sub-rótulo/link. O
 * link é SEMPRE o detalhe do tenant — "o caminho até a entidade" (§7); não há
 * página de usuário/contato/sessão no `/admin`, e não deve haver (ler dado do
 * cliente exige aceite, §9).
 */
export class PlatformSearchService {
  constructor(private readonly repository: PlatformSearchRepository) {}

  async search(rawQuery: string): Promise<PlatformSearchResults> {
    const query = rawQuery.trim();
    if (query.length < MIN_SEARCH_QUERY_LENGTH) {
      return { query, groups: [] };
    }

    const digits = query.replace(/\D/g, '');
    const raw = await this.repository.search(query, digits, SEARCH_LIMIT_PER_KIND + 1);

    const groups: PlatformSearchGroup[] = [];
    for (const kind of KIND_ORDER) {
      const rows = raw[kind] ?? [];
      if (rows.length === 0) continue;
      const hasMore = rows.length > SEARCH_LIMIT_PER_KIND;
      groups.push({
        kind,
        hasMore,
        hits: rows.slice(0, SEARCH_LIMIT_PER_KIND).map((r) => toHit(kind, r)),
      });
    }

    return { query, groups };
  }
}

function toHit(kind: PlatformSearchKind, row: RawSearchHit): PlatformSearchHit {
  return {
    kind,
    id: row.id,
    label: row.primary,
    sublabel:
      kind === 'tenant'
        ? row.tenantId
        : `${KIND_NOUN[kind]} · no tenant ${row.tenantName}`,
    tenantId: row.tenantId,
    href: `/admin/tenants/${encodeURIComponent(row.tenantId)}`,
  };
}
