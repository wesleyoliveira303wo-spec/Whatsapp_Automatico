import { ConsoleLogger } from '../../../src/shared/infrastructure/logging/ConsoleLogger';

describe('ConsoleLogger', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function parseLastCall(spy: jest.SpyInstance): Record<string, unknown> {
    const [line] = spy.mock.calls[spy.mock.calls.length - 1] as [string];
    return JSON.parse(line) as Record<string, unknown>;
  }

  it('deve escrever debug/info em console.log com nível correto', () => {
    const logger = new ConsoleLogger();

    logger.debug('mensagem de debug');
    expect(parseLastCall(logSpy)).toMatchObject({ level: 'debug', message: 'mensagem de debug' });

    logger.info('mensagem de info');
    expect(parseLastCall(logSpy)).toMatchObject({ level: 'info', message: 'mensagem de info' });
  });

  it('deve escrever warn em console.warn', () => {
    const logger = new ConsoleLogger();

    logger.warn('mensagem de warn');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(parseLastCall(warnSpy)).toMatchObject({ level: 'warn', message: 'mensagem de warn' });
  });

  it('deve escrever error em console.error', () => {
    const logger = new ConsoleLogger();

    logger.error('mensagem de erro');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(parseLastCall(errorSpy)).toMatchObject({ level: 'error', message: 'mensagem de erro' });
  });

  it('deve incluir metadata e timestamp na linha estruturada', () => {
    const logger = new ConsoleLogger();

    logger.info('evento com metadata', { tenantId: 'tenant-1', sessionName: 'default' });

    const entry = parseLastCall(logSpy);
    expect(entry).toMatchObject({ tenantId: 'tenant-1', sessionName: 'default' });
    expect(typeof entry.timestamp).toBe('string');
  });

  it('child() deve mesclar bindings a todo log subsequente, sem exigir repeti-los', () => {
    const logger = new ConsoleLogger();
    const child = logger.child({ tenantId: 'tenant-1', sessionName: 'default' });

    child.info('evento da sessão', { sessionId: 'session-1' });

    const entry = parseLastCall(logSpy);
    expect(entry).toMatchObject({
      tenantId: 'tenant-1',
      sessionName: 'default',
      sessionId: 'session-1',
    });
  });

  it('child() encadeado deve acumular bindings dos pais', () => {
    const logger = new ConsoleLogger({ service: 'whatsapp' });
    const grandchild = logger.child({ tenantId: 'tenant-1' }).child({ sessionName: 'default' });

    grandchild.debug('evento aninhado');

    const entry = parseLastCall(logSpy);
    expect(entry).toMatchObject({
      service: 'whatsapp',
      tenantId: 'tenant-1',
      sessionName: 'default',
    });
  });

  it('deve serializar instâncias de Error em meta, preservando message e stack', () => {
    const logger = new ConsoleLogger();
    const error = new Error('algo quebrou');

    logger.error('falha ao processar', { error });

    const entry = parseLastCall(errorSpy);
    const serializedError = entry.error as { name: string; message: string; stack: string };
    expect(serializedError.name).toBe('Error');
    expect(serializedError.message).toBe('algo quebrou');
    expect(typeof serializedError.stack).toBe('string');
  });

  it('meta explícita sobrescreve bindings herdados de child() em caso de colisão de chave', () => {
    const logger = new ConsoleLogger({ status: 'connecting' });

    logger.info('status mudou', { status: 'connected' });

    const entry = parseLastCall(logSpy);
    expect(entry.status).toBe('connected');
  });
});
