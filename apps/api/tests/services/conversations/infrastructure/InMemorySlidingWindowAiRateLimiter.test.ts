import { InMemorySlidingWindowAiRateLimiter } from '../../../../src/services/conversations/infrastructure/repositories/InMemorySlidingWindowAiRateLimiter';

describe('InMemorySlidingWindowAiRateLimiter', () => {
  it('mensagens normais (dentro do limite por conversa) sempre passam', () => {
    let now = 0;
    const limiter = new InMemorySlidingWindowAiRateLimiter(
      { limit: 6, windowMs: 60_000 },
      { limit: 30, windowMs: 60_000 },
      () => now,
    );

    for (let i = 0; i < 6; i += 1) {
      now += 1_000;
      expect(limiter.consume('tenant-1', 'default', 'conversation-1')).toBe(true);
    }
  });

  it('rajada na mesma conversa: a 7ª tentativa dentro da janela é bloqueada', () => {
    let now = 0;
    const limiter = new InMemorySlidingWindowAiRateLimiter(
      { limit: 6, windowMs: 60_000 },
      { limit: 30, windowMs: 60_000 },
      () => now,
    );

    for (let i = 0; i < 6; i += 1) {
      now += 100;
      expect(limiter.consume('tenant-1', 'default', 'conversation-1')).toBe(true);
    }
    now += 100;
    expect(limiter.consume('tenant-1', 'default', 'conversation-1')).toBe(false);
  });

  it('recuperação: depois que a janela desliza, a mesma conversa volta a ser permitida sem ação manual', () => {
    let now = 0;
    const limiter = new InMemorySlidingWindowAiRateLimiter(
      { limit: 6, windowMs: 60_000 },
      { limit: 30, windowMs: 60_000 },
      () => now,
    );

    for (let i = 0; i < 6; i += 1) {
      now += 100;
      limiter.consume('tenant-1', 'default', 'conversation-1');
    }
    expect(limiter.consume('tenant-1', 'default', 'conversation-1')).toBe(false);

    // Avança além da janela de 60s — as 6 tentativas antigas expiram.
    now += 60_001;
    expect(limiter.consume('tenant-1', 'default', 'conversation-1')).toBe(true);
  });

  it('múltiplas conversas da MESMA sessão: bloqueio por sessão soma todas, mesmo sem nenhuma conversa individual estourar', () => {
    let now = 0;
    const limiter = new InMemorySlidingWindowAiRateLimiter(
      { limit: 100, windowMs: 60_000 }, // limite por conversa alto de propósito — não é o que queremos testar aqui
      { limit: 5, windowMs: 60_000 },
      () => now,
    );

    for (let i = 0; i < 5; i += 1) {
      now += 10;
      // 5 conversas DIFERENTES da mesma sessão, 1 mensagem cada.
      expect(limiter.consume('tenant-1', 'default', `conversation-${i}`)).toBe(true);
    }
    now += 10;
    expect(limiter.consume('tenant-1', 'default', 'conversation-extra')).toBe(false);
  });

  it('múltiplos tenants nunca competem pelo mesmo limite (isolamento)', () => {
    let now = 0;
    const limiter = new InMemorySlidingWindowAiRateLimiter(
      { limit: 1, windowMs: 60_000 },
      { limit: 1, windowMs: 60_000 },
      () => now,
    );

    expect(limiter.consume('tenant-A', 'default', 'conversation-1')).toBe(true);
    expect(limiter.consume('tenant-A', 'default', 'conversation-1')).toBe(false);
    // Outro tenant, mesmo nome de sessão/conversa — não deve ser afetado.
    now += 10;
    expect(limiter.consume('tenant-B', 'default', 'conversation-1')).toBe(true);
  });

  it('limite por conversa some ANTES do limite por sessão: uma conversa isolada não pode saturar sozinha', () => {
    let now = 0;
    const limiter = new InMemorySlidingWindowAiRateLimiter(
      { limit: 2, windowMs: 60_000 },
      { limit: 100, windowMs: 60_000 },
      () => now,
    );

    expect(limiter.consume('tenant-1', 'default', 'conversation-1')).toBe(true);
    now += 10;
    expect(limiter.consume('tenant-1', 'default', 'conversation-1')).toBe(true);
    now += 10;
    expect(limiter.consume('tenant-1', 'default', 'conversation-1')).toBe(false);
    // Outra conversa da mesma sessão continua livre — o bloqueio foi só da conversa 1.
    expect(limiter.consume('tenant-1', 'default', 'conversation-2')).toBe(true);
  });
});
