/** Situação de bloqueio de uma identidade (e-mail) tentando entrar. */
export interface AccountLockoutStatus {
  locked: boolean;
  /** Quanto falta (ms) para o bloqueio expirar. `0` quando não está bloqueada. */
  retryAfterMs: number;
}

/**
 * Bloqueio temporário de conta por excesso de falhas de login (bloco B1).
 *
 * Por que isto existe, tendo já dois rate limiters no login: eles contam
 * REQUISIÇÕES (por IP e por identidade) numa janela e devolvem 429 — uma
 * defesa de tráfego, aplicada antes do handler. O lockout é uma defesa de
 * CONTA: conta especificamente as tentativas que FALHARAM, e um login bem
 * sucedido zera o histórico. Um atacante lento o bastante para não estourar
 * o rate limit ainda seria contido aqui.
 *
 * ANTI-ENUMERAÇÃO — regra central desta porta: a contagem é por e-mail
 * TENTADO, exista o usuário ou não. Se só contas reais fossem bloqueadas, a
 * própria resposta de bloqueio viraria um oráculo de "este e-mail existe" —
 * exatamente o vazamento que o hash-isca de `AuthService` já evita no tempo
 * de resposta. Por isso quem registra a falha é o Application Service, que
 * sabe o resultado, e não um middleware que só enxerga a requisição.
 */
export interface AccountLockout {
  /** Consulta sem contar como tentativa. */
  status(email: string): Promise<AccountLockoutStatus>;

  /** Registra UMA falha de login para este e-mail. */
  recordFailure(email: string): Promise<void>;

  /** Zera o histórico de falhas — chamado quando o login dá certo. */
  clear(email: string): Promise<void>;
}
