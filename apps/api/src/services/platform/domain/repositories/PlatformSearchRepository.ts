import { PlatformSearchKind } from '../entities/PlatformSearchResult';

/**
 * Porta da busca global (Fase 6, §7). Leitura cross-tenant — só vive em
 * `services/platform`. `ILIKE` sobre colunas já existentes, teto por tipo,
 * sem motor de busca novo.
 *
 * Devolve linhas CRUAS por tipo; o `PlatformSearchService` monta o rótulo, o
 * sub-rótulo e o link. NENHUMA linha carrega conteúdo de conversa (§7).
 */
export interface PlatformSearchRepository {
  /**
   * @param term    o texto digitado, já trimado (usado em `ILIKE '%term%'`).
   * @param digits  só os dígitos de `term` (para casar telefone E.164 sem
   *                depender de `+`, espaços ou hífens); vazio se não houver.
   * @param limit   quantas linhas trazer POR TIPO (o service pede `teto + 1`
   *                para saber se há "e mais…").
   */
  search(term: string, digits: string, limit: number): Promise<RawSearchHits>;
}

export interface RawSearchHit {
  kind: PlatformSearchKind;
  id: string;
  /** Texto principal (nome/e-mail/telefone/nome de sessão/campanha). */
  primary: string;
  tenantId: string;
  /** Nome do tenant dono (para o tipo `tenant` é o próprio nome). */
  tenantName: string;
}

export type RawSearchHits = Record<PlatformSearchKind, RawSearchHit[]>;
