import { Logger } from '../../domain/Logger';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Implementação padrão (dev) do port `Logger`, escrevendo uma linha JSON
 * estruturada por evento em `stdout`/`stderr`. Não é a implementação final
 * de produção — `CLAUDE.md` já define Winston como a biblioteca alvo; esta
 * classe existe para que o módulo WhatsApp (e qualquer outro consumidor)
 * tenha, desde já, uma implementação real e testável do port, sem acoplar
 * nada a Winston antes da hora (YAGNI).
 *
 * Trocar por um `WinstonLogger` no futuro não exige mudar o port nem os
 * consumidores — só criar a nova classe em `shared/infrastructure/logging/`
 * e trocar a instância na composição (Ports & Adapters).
 */
export class ConsoleLogger implements Logger {
  private readonly bindings: Record<string, unknown>;

  constructor(bindings: Record<string, unknown> = {}) {
    this.bindings = bindings;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write('error', message, meta);
  }

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLogger({ ...this.bindings, ...bindings });
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.bindings,
      ...this.serializeMeta(meta),
    };
    const line = JSON.stringify(entry);

    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  /**
   * `JSON.stringify` não captura `message`/`stack` de instâncias de `Error`
   * (não são propriedades enumeráveis) — sem este tratamento, um
   * `logger.error('falha', { error: err })` perderia justamente a
   * informação mais útil para depuração.
   */
  private serializeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!meta) {
      return undefined;
    }

    const serialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      serialized[key] =
        value instanceof Error
          ? { name: value.name, message: value.message, stack: value.stack }
          : value;
    }
    return serialized;
  }
}
