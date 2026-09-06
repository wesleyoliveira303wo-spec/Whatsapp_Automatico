/**
 * Resultado da BUSCA GLOBAL do `/admin` — Painel `/admin`, Fase 6
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §7).
 *
 * Um campo, resultados agrupados por tipo. Pesquisa nome/id de tenant,
 * e-mail/nome de usuário, telefone/nome de contato, nome de sessão, nome de
 * campanha — e o id de qualquer uma delas.
 *
 * **Regra de privacidade (§7):** a busca devolve A ENTIDADE E O CAMINHO ATÉ
 * ELA, nunca conteúdo de conversa. Achar um telefone mostra "existe no tenant
 * X" — ler a conversa continua exigindo aceite (§9). Por isso nenhum campo
 * aqui carrega texto de mensagem: só rótulo, sub-rótulo e o link para o
 * detalhe do tenant.
 */
export type PlatformSearchKind = 'tenant' | 'user' | 'contact' | 'session' | 'campaign';

export interface PlatformSearchHit {
  kind: PlatformSearchKind;
  /** id da entidade encontrada (tenant/user/contact/session/campaign). */
  id: string;
  /** Texto principal: nome do tenant, e-mail, telefone, nome da sessão/campanha. */
  label: string;
  /** Contexto: "no tenant <nome>" (ou o próprio id do tenant, para o tipo `tenant`). */
  sublabel: string;
  /** Tenant a que a entidade pertence — destino do link. */
  tenantId: string;
  /** Caminho dentro do `/admin` — sempre o detalhe do tenant (§7: "o caminho até ela"). */
  href: string;
}

export interface PlatformSearchGroup {
  kind: PlatformSearchKind;
  hits: PlatformSearchHit[];
  /** Havia mais que o teto por tipo — a UI mostra "e mais…". */
  hasMore: boolean;
}

export interface PlatformSearchResults {
  query: string;
  groups: PlatformSearchGroup[];
}

/** Abaixo disto a busca nem consulta o banco (evita varrer a cada tecla). */
export const MIN_SEARCH_QUERY_LENGTH = 2;

/** Teto de resultados POR TIPO (§7: "teto de resultados por tipo"). */
export const SEARCH_LIMIT_PER_KIND = 5;
