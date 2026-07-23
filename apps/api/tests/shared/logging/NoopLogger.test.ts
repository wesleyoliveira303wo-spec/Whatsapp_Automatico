import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';

describe('NoopLogger', () => {
  it('não deve lançar exceção e não deve escrever em console.* ao chamar qualquer nível', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const logger = new NoopLogger();

    expect(() => {
      logger.debug('mensagem', { qualquer: 'valor' });
      logger.info('mensagem', { qualquer: 'valor' });
      logger.warn('mensagem', { qualquer: 'valor' });
      logger.error('mensagem', { qualquer: 'valor' });
    }).not.toThrow();

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('child() deve retornar um Logger que ainda satisfaz o contrato inteiro (Liskov)', () => {
    const logger = new NoopLogger();

    const child = logger.child({ tenantId: 'tenant-1' });

    expect(typeof child.debug).toBe('function');
    expect(typeof child.info).toBe('function');
    expect(typeof child.warn).toBe('function');
    expect(typeof child.error).toBe('function');
    expect(typeof child.child).toBe('function');
    expect(() => child.info('evento')).not.toThrow();
  });

  it('child() retorna a própria instância (no-op não precisa alocar um novo objeto)', () => {
    const logger = new NoopLogger();

    expect(logger.child({ tenantId: 'tenant-1' })).toBe(logger);
  });
});
