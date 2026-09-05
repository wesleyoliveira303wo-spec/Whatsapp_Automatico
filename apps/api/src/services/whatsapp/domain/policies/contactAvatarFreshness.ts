/**
 * Bloco B2 (issue #13) — decide QUANDO uma foto de perfil em cache precisa
 * ser reconsultada. Função pura de Domain (mesmo padrão de
 * `shouldAutoRespond`/`shouldAiUpdateStage`/`shouldReactivateBot`): a regra
 * mora aqui, testável sem banco e sem socket, e a Infrastructure só aplica.
 */

/** Uma foto ENCONTRADA vale por 7 dias — trocar a foto de perfil é raro. */
export const AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Um "não tem foto" vale por 6 horas — bem menos, porque esse resultado tem
 * duas causas indistinguíveis do lado de fora: o contato realmente não tem
 * foto (ou bloqueou por privacidade), ou a consulta expirou no timeout de 6s
 * do `BaileysProvider` num momento de socket carregado. Cachear "sem foto"
 * para sempre foi um bug real de 2026-07-30 (a foto nunca aparecia, nem com
 * F5); cachear por tempo nenhum recria o bombardeio que a ADR #78 documenta.
 */
export const NO_AVATAR_TTL_MS = 6 * 60 * 60 * 1000;

export interface ContactAvatarCacheEntry {
  /** `undefined` aqui significa "checamos e não tem foto" — a ausência de ENTRADA é representada por não haver objeto nenhum. */
  avatarUrl?: string;
  refreshedAt: Date;
}

/**
 * `true` quando a entrada precisa ser reconsultada. Uma entrada AUSENTE
 * (`undefined`) é sempre "vencida" — nunca foi checada.
 *
 * Vencido NÃO quer dizer inútil: quem lê continua servindo o valor vencido
 * imediatamente (uma foto de uma semana atrás é melhor que nenhuma) e só
 * agenda a atualização para fora do caminho da requisição.
 */
export function isContactAvatarStale(
  entry: ContactAvatarCacheEntry | undefined,
  now: Date = new Date(),
): boolean {
  if (!entry) return true;
  const ttl = entry.avatarUrl ? AVATAR_TTL_MS : NO_AVATAR_TTL_MS;
  return now.getTime() - entry.refreshedAt.getTime() >= ttl;
}
