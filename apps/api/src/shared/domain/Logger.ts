/**
 * Porta (port) compartilhada de logging estruturado, usada por qualquer
 * bounded context da API (WhatsApp, IA, CRM, Analytics, Scheduler) que
 * precise registrar eventos sem depender de uma biblioteca concreta
 * (Winston, Pino, console).
 *
 * Vive em `shared/domain` — e não em `services/whatsapp/domain` — porque
 * não pertence a nenhum bounded context específico; é infraestrutura
 * transversal (cross-cutting concern), não uma regra de negócio (por isso
 * não é um Domain Service) nem um conceito de modelo de domínio
 * compartilhado (por isso o termo "Shared Kernel", no sentido estrito de
 * DDD, não se aplica aqui).
 *
 * Segue a mesma convenção já usada por `WhatsAppProvider` e
 * `WhatsAppSessionRepository`: a interface (port) vive no Domain; qualquer
 * implementação concreta vive na Infrastructure e depende desta interface,
 * nunca o contrário.
 *
 * Escopo deliberadamente mínimo (Interface Segregation Principle): apenas
 * logging estruturado com níveis. Métricas e tracing (OpenTelemetry,
 * Prometheus — ver `ARCHITECTURE.md` §9) são preocupações distintas e
 * devem ganhar seus próprios ports no futuro, nunca ser absorvidas aqui.
 */
export interface Logger {
  /** Detalhes úteis apenas em desenvolvimento/depuração. */
  debug(message: string, meta?: Record<string, unknown>): void;

  /** Eventos normais do ciclo de vida (ex.: sessão conectada). */
  info(message: string, meta?: Record<string, unknown>): void;

  /** Situações recuperáveis que merecem atenção, mas não são falhas. */
  warn(message: string, meta?: Record<string, unknown>): void;

  /**
   * Falhas. Para preservar stack trace, passe o erro original em
   * `meta.error` (ex.: `logger.error('Falha ao conectar', { error: err })`).
   * Implementações devem serializar `Error` de forma legível, já que
   * `JSON.stringify` numa instância de `Error` não captura `message`/`stack`
   * por padrão (essas propriedades não são enumeráveis).
   */
  error(message: string, meta?: Record<string, unknown>): void;

  /**
   * Retorna um novo `Logger` com `bindings` mesclados a todo log futuro,
   * sem precisar repeti-los em cada chamada (ex.:
   * `logger.child({ tenantId, sessionName })`). A instância retornada deve
   * satisfazer integralmente este mesmo contrato — nunca uma versão
   * degradada (Liskov Substitution Principle).
   */
  child(bindings: Record<string, unknown>): Logger;
}
