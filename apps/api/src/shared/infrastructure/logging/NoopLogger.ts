import { Logger } from '../../domain/Logger';

/**
 * Null Object para o port `Logger`. Existe para que consumidores (ex.:
 * `SessionManager`) possam exigir `Logger` como dependência **obrigatória**
 * no construtor — sem parâmetro opcional (`logger?: Logger`) e sem
 * checagens de nulidade espalhadas pelo código (`this.logger?.info(...)`).
 * Quem não quiser logging real (ex.: um teste que não testa logging)
 * injeta este objeto.
 *
 * `child()` retorna a própria instância: um "filho" de um no-op continua
 * sendo um no-op, e ainda satisfaz integralmente o contrato `Logger`
 * (Liskov Substitution Principle) sem custo de alocação.
 */
export class NoopLogger implements Logger {
  debug(): void {
    // Intencionalmente vazio — Null Object.
  }

  info(): void {
    // Intencionalmente vazio — Null Object.
  }

  warn(): void {
    // Intencionalmente vazio — Null Object.
  }

  error(): void {
    // Intencionalmente vazio — Null Object.
  }

  child(): Logger {
    return this;
  }
}
