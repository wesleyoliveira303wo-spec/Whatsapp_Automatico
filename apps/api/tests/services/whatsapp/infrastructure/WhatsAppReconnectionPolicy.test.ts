import { Logger } from '../../../../src/shared/domain/Logger';
import {
  WhatsAppReconnectionPolicy,
  ReconnectionPolicyConfig,
} from '../../../../src/services/whatsapp/infrastructure/providers/baileys/WhatsAppReconnectionPolicy';

function createFakeLogger(): Logger & {
  calls: { level: string; message: string; meta?: Record<string, unknown> }[];
} {
  const calls: { level: string; message: string; meta?: Record<string, unknown> }[] = [];
  const logger = {
    calls,
    debug: (message: string, meta?: Record<string, unknown>) =>
      calls.push({ level: 'debug', message, meta }),
    info: (message: string, meta?: Record<string, unknown>) =>
      calls.push({ level: 'info', message, meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      calls.push({ level: 'warn', message, meta }),
    error: (message: string, meta?: Record<string, unknown>) =>
      calls.push({ level: 'error', message, meta }),
    child: () => logger,
  };
  return logger;
}

// Config pequena e determinística para os testes — nunca a mesma do
// default de produção (`DEFAULT_RECONNECTION_POLICY_CONFIG`), para deixar
// explícito que o comportamento não depende de constantes específicas.
const TEST_CONFIG: ReconnectionPolicyConfig = {
  baseDelayMs: 100,
  factor: 2,
  maxDelayMs: 1000,
  maxConsecutiveFailures: 3,
};

describe('WhatsAppReconnectionPolicy', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('agenda onRetry após o backoff base na primeira falha recuperável', () => {
    const policy = new WhatsAppReconnectionPolicy(TEST_CONFIG, createFakeLogger());
    const onRetry = jest.fn();

    policy.scheduleReconnect('connection_lost', onRetry);

    expect(onRetry).not.toHaveBeenCalled();
    jest.advanceTimersByTime(TEST_CONFIG.baseDelayMs - 1);
    expect(onRetry).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('nunca agenda reconexão para logged_out (motivo definitivo)', () => {
    const policy = new WhatsAppReconnectionPolicy(TEST_CONFIG, createFakeLogger());
    const onRetry = jest.fn();

    policy.scheduleReconnect('logged_out', onRetry);
    jest.advanceTimersByTime(100000);

    expect(onRetry).not.toHaveBeenCalled();
  });

  it('cresce o delay exponencialmente a cada falha consecutiva (backoff)', () => {
    const policy = new WhatsAppReconnectionPolicy(TEST_CONFIG, createFakeLogger());
    const onRetry = jest.fn();

    // 1ª falha: delay = 100ms (base * factor^0)
    policy.scheduleReconnect('connection_lost', onRetry);
    jest.advanceTimersByTime(100);
    expect(onRetry).toHaveBeenCalledTimes(1);

    // 2ª falha: delay = 200ms (base * factor^1)
    policy.scheduleReconnect('connection_lost', onRetry);
    jest.advanceTimersByTime(199);
    expect(onRetry).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(onRetry).toHaveBeenCalledTimes(2);

    // 3ª falha: delay = 400ms (base * factor^2)
    policy.scheduleReconnect('connection_lost', onRetry);
    jest.advanceTimersByTime(399);
    expect(onRetry).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1);
    expect(onRetry).toHaveBeenCalledTimes(3);
  });

  it('nunca ultrapassa maxDelayMs, mesmo com muitas falhas consecutivas', () => {
    const config: ReconnectionPolicyConfig = {
      baseDelayMs: 100,
      factor: 10,
      maxDelayMs: 500,
      maxConsecutiveFailures: 10,
    };
    const policy = new WhatsAppReconnectionPolicy(config, createFakeLogger());
    const onRetry = jest.fn();

    policy.scheduleReconnect('connection_lost', onRetry); // tentativa 1: 100ms
    jest.advanceTimersByTime(100);
    policy.scheduleReconnect('connection_lost', onRetry); // tentativa 2: min(1000, 500) = 500ms

    jest.advanceTimersByTime(499);
    expect(onRetry).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('abre o circuito após exceder maxConsecutiveFailures e para de agendar novas tentativas', () => {
    const policy = new WhatsAppReconnectionPolicy(TEST_CONFIG, createFakeLogger());
    const onRetry = jest.fn();

    // 3 falhas permitidas (maxConsecutiveFailures = 3)
    policy.scheduleReconnect('connection_lost', onRetry);
    jest.advanceTimersByTime(100);
    policy.scheduleReconnect('connection_lost', onRetry);
    jest.advanceTimersByTime(200);
    policy.scheduleReconnect('connection_lost', onRetry);
    jest.advanceTimersByTime(400);
    expect(onRetry).toHaveBeenCalledTimes(3);

    // 4ª falha consecutiva: excede o limite — circuito abre, nada agendado
    policy.scheduleReconnect('connection_lost', onRetry);
    jest.advanceTimersByTime(100000);
    expect(onRetry).toHaveBeenCalledTimes(3);
  });

  it('loga em warn quando o circuito abre', () => {
    const logger = createFakeLogger();
    const policy = new WhatsAppReconnectionPolicy(TEST_CONFIG, logger);
    const onRetry = jest.fn();

    for (let i = 0; i < TEST_CONFIG.maxConsecutiveFailures; i += 1) {
      policy.scheduleReconnect('connection_lost', onRetry);
      jest.runOnlyPendingTimers();
    }
    policy.scheduleReconnect('connection_lost', onRetry); // excede o limite

    const warnLog = logger.calls.find(
      (c) => c.level === 'warn' && String(c.message).includes('Circuito de reconexão aberto'),
    );
    expect(warnLog).toBeDefined();
  });

  it('reset() fecha o circuito e zera o contador — próxima falha volta a começar do delay base', () => {
    const policy = new WhatsAppReconnectionPolicy(TEST_CONFIG, createFakeLogger());
    const onRetry = jest.fn();

    for (let i = 0; i < TEST_CONFIG.maxConsecutiveFailures; i += 1) {
      policy.scheduleReconnect('connection_lost', onRetry);
      jest.runOnlyPendingTimers();
    }
    policy.scheduleReconnect('connection_lost', onRetry); // circuito abre
    jest.advanceTimersByTime(100000);
    expect(onRetry).toHaveBeenCalledTimes(TEST_CONFIG.maxConsecutiveFailures);

    policy.reset(); // simula conexão bem-sucedida

    onRetry.mockClear();
    policy.scheduleReconnect('connection_lost', onRetry); // deve voltar a agendar, delay base de novo
    jest.advanceTimersByTime(TEST_CONFIG.baseDelayMs - 1);
    expect(onRetry).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('cancelPending() cancela um timer agendado e não disparado', () => {
    const policy = new WhatsAppReconnectionPolicy(TEST_CONFIG, createFakeLogger());
    const onRetry = jest.fn();

    policy.scheduleReconnect('connection_lost', onRetry);
    policy.cancelPending();
    jest.advanceTimersByTime(100000);

    expect(onRetry).not.toHaveBeenCalled();
  });

  it('reset() também cancela um timer pendente', () => {
    const policy = new WhatsAppReconnectionPolicy(TEST_CONFIG, createFakeLogger());
    const onRetry = jest.fn();

    policy.scheduleReconnect('connection_lost', onRetry);
    policy.reset();
    jest.advanceTimersByTime(100000);

    expect(onRetry).not.toHaveBeenCalled();
  });
});
