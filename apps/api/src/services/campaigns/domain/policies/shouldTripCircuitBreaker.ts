export type CampaignSendOutcome = 'sent' | 'failed';

export interface CircuitBreakerOptions {
  /** Não avalia nada abaixo desta amostra — evita pausar uma campanha após 1 falha isolada. */
  minSampleSize: number;
  /** Taxa de falha (0–1) acima da qual a campanha pausa sozinha. */
  maxFailureRate: number;
}

/** Padrões conservadores — Fase L, Bloco L4 (`FASE_L_MOTOR_DE_LEADS.md` §9.3: "obrigatório, não opcional"). */
export const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  minSampleSize: 5,
  maxFailureRate: 0.4,
};

/**
 * Disjuntor de segurança — Fase L, Bloco L4. A campanha pausa sozinha se, na
 * amostra mais recente, a taxa de falha ultrapassar o limiar. É a única
 * proteção real contra descobrir um bloqueio do WhatsApp tarde demais: "é
 * barato de implementar e é a diferença entre perder 20 mensagens e perder o
 * número" (análise aprovada).
 *
 * `recentOutcomes` já vem do mais recente para o mais antigo (ordem de
 * chegada não importa para esta função — só a taxa importa), tipicamente as
 * últimas 5–10 tentativas de UMA campanha.
 *
 * ESCOPO DESTE BLOCO: só a variante "taxa de falha de envio". A segunda
 * variante do documento aprovado ("primeiras N mensagens sem nenhuma
 * resposta") depende de saber se o contato respondeu — hoje só marcado por
 * um gancho de ingestão ainda não implementado (`CampaignRecipient.repliedAt`
 * existe no schema desde o L3, mas nada o preenche ainda) — fica registrado
 * como trabalho futuro, não implementado aqui.
 */
export function shouldTripCircuitBreaker(
  recentOutcomes: CampaignSendOutcome[],
  options: CircuitBreakerOptions = DEFAULT_CIRCUIT_BREAKER_OPTIONS,
): boolean {
  if (recentOutcomes.length < options.minSampleSize) {
    return false;
  }
  const failures = recentOutcomes.filter((outcome) => outcome === 'failed').length;
  return failures / recentOutcomes.length > options.maxFailureRate;
}
