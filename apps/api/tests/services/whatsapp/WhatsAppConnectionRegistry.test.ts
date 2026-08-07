import { WhatsAppConnectionRegistry } from '../../../src/services/whatsapp/application/WhatsAppConnectionRegistry';
import { SessionManager } from '../../../src/services/whatsapp/application/SessionManager';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeWhatsAppProviderFactory } from './infrastructure/FakeWhatsAppProviderFactory';
import {
  FakeWhatsAppSessionRepository,
  FakeWhatsAppSessionEventRepository,
  FakeMessageReceivedHandler,
} from './testDoubles';

function buildRegistry(messageReceivedHandler?: FakeMessageReceivedHandler): {
  registry: WhatsAppConnectionRegistry;
  providerFactory: FakeWhatsAppProviderFactory;
} {
  const providerFactory = new FakeWhatsAppProviderFactory();
  const repo = new FakeWhatsAppSessionRepository();
  // Reaproveita o Null Object real de Infrastructure em vez de duplicar um
  // Fake equivalente aqui — nada nestes testes verifica conteúdo de log.
  const logger = new NoopLogger();
  // M2, Fase 2 — repassado ao SessionManager por dentro do Registry; nada
  // nestes testes verifica o histórico em si (isso é responsabilidade de
  // SessionManager.test.ts), só precisa satisfazer o construtor.
  const eventRepo = new FakeWhatsAppSessionEventRepository();
  const registry = new WhatsAppConnectionRegistry(
    providerFactory,
    repo,
    logger,
    eventRepo,
    messageReceivedHandler,
  );
  return { registry, providerFactory };
}

describe('WhatsAppConnectionRegistry', () => {
  it('cria um SessionManager na primeira chamada para um par (tenantId, sessionName), chamando providerFactory.create() exatamente uma vez com os mesmos valores', () => {
    const { registry, providerFactory } = buildRegistry();

    const sessionManager = registry.getOrCreate('tenant-1', 'vendas');

    expect(sessionManager).toBeInstanceOf(SessionManager);
    expect(providerFactory.createCalls).toEqual([{ tenantId: 'tenant-1', sessionName: 'vendas' }]);
  });

  it('reaproveita a MESMA instância de SessionManager em chamadas repetidas para o mesmo par, sem chamar providerFactory.create() de novo', () => {
    const { registry, providerFactory } = buildRegistry();

    const first = registry.getOrCreate('tenant-1', 'vendas');
    const second = registry.getOrCreate('tenant-1', 'vendas');
    const third = registry.getOrCreate('tenant-1', 'vendas');

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(providerFactory.createCalls).toHaveLength(1);
  });

  it('cria instâncias DISTINTAS quando o tenantId difere (mesmo sessionName)', () => {
    const { registry, providerFactory } = buildRegistry();

    const tenantA = registry.getOrCreate('tenant-1', 'vendas');
    const tenantB = registry.getOrCreate('tenant-2', 'vendas');

    expect(tenantA).not.toBe(tenantB);
    expect(providerFactory.createCalls).toEqual([
      { tenantId: 'tenant-1', sessionName: 'vendas' },
      { tenantId: 'tenant-2', sessionName: 'vendas' },
    ]);
  });

  it('cria instâncias DISTINTAS quando o sessionName difere (mesmo tenantId)', () => {
    const { registry, providerFactory } = buildRegistry();

    const vendas = registry.getOrCreate('tenant-1', 'vendas');
    const suporte = registry.getOrCreate('tenant-1', 'suporte');

    expect(vendas).not.toBe(suporte);
    expect(providerFactory.createCalls).toEqual([
      { tenantId: 'tenant-1', sessionName: 'vendas' },
      { tenantId: 'tenant-1', sessionName: 'suporte' },
    ]);
  });

  it('não cria dois SessionManager (nem chama create() duas vezes) para o mesmo par, mesmo sob chamadas "concorrentes" disparadas no mesmo microtask', async () => {
    // getOrCreate() é síncrono (sem await no meio) — chamá-lo de dentro de
    // funções async e aguardar via Promise.all NÃO produz interleaving real:
    // cada chamada roda até o fim antes da próxima começar. Este teste prova
    // isso na prática, não só por leitura do código.
    const { registry, providerFactory } = buildRegistry();

    const callConcurrently = async (): Promise<SessionManager> =>
      registry.getOrCreate('tenant-1', 'vendas');

    const [a, b, c] = await Promise.all([
      callConcurrently(),
      callConcurrently(),
      callConcurrently(),
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(providerFactory.createCalls).toHaveLength(1);
  });

  it('o SessionManager criado funciona de ponta a ponta com o provider e a chave derivados da MESMA WhatsAppSessionKey', async () => {
    // Verifica indiretamente que não há duplicação/divergência de
    // identidade: o provider foi criado com os valores de uma sessionKey, e
    // a sessão persistida pelo SessionManager (que recebeu a instância da
    // MESMA sessionKey) usa exatamente o mesmo tenantId/sessionName.
    const { registry, providerFactory } = buildRegistry();

    const sessionManager = registry.getOrCreate('tenant-1', 'vendas');
    const session = await sessionManager.init();

    expect(session.tenantId).toBe('tenant-1');
    expect(session.sessionName).toBe('vendas');
    expect(providerFactory.createCalls).toEqual([{ tenantId: 'tenant-1', sessionName: 'vendas' }]);

    const [createdProvider] = providerFactory.getCreatedProviders();
    expect(await createdProvider.getStatus()).toBe(session.status);
  });

  describe('messageReceivedHandler (Milestone 3, Bloco 5 — D5, exceção formal à ADR #45)', () => {
    it('repassa o 6º argumento (messageReceivedHandler) opcional ao SessionManager criado por getOrCreate(), de ponta a ponta até uma mensagem recebida', async () => {
      const handler = new FakeMessageReceivedHandler();
      const { registry, providerFactory } = buildRegistry(handler);

      const sessionManager = registry.getOrCreate('tenant-1', 'vendas');
      await sessionManager.init();

      // Simula uma mensagem recebida chegando pelo provider real desta
      // instância — prova, de ponta a ponta (sem tocar BullMQ/Redis/Prisma),
      // que o Registry de fato encaminha o handler para o SessionManager que
      // constrói (D5): antes deste bloco, `getOrCreate()` nunca passava nada
      // no 6º parâmetro de `new SessionManager(...)`, então nenhuma mensagem
      // recebida chegaria a `MessageIngestionService` em produção.
      const [createdProvider] = providerFactory.getCreatedProviders();
      const receivedAt = new Date('2026-07-16T10:00:00Z');
      createdProvider.emitEvent({
        type: 'message_received',
        from: '5511999999999@s.whatsapp.net',
        content: 'Oi!',
        receivedAt,
      });

      expect(handler.getAll()).toEqual([
        {
          tenantId: 'tenant-1',
          sessionName: 'vendas',
          from: '5511999999999@s.whatsapp.net',
          content: 'Oi!',
          receivedAt,
        },
      ]);
    });

    it('sem messageReceivedHandler (mesmo padrão anterior ao Bloco 5), o SessionManager continua funcionando normalmente e ignora message_received sem lançar', async () => {
      const { registry, providerFactory } = buildRegistry();

      const sessionManager = registry.getOrCreate('tenant-1', 'vendas');
      await sessionManager.init();
      expect(sessionManager).toBeInstanceOf(SessionManager);

      const [createdProvider] = providerFactory.getCreatedProviders();
      expect(() =>
        createdProvider.emitEvent({
          type: 'message_received',
          from: 'x@s.whatsapp.net',
          content: 'oi',
          receivedAt: new Date(),
        }),
      ).not.toThrow();
    });
  });

  describe('evictIfCurrent (Production Hardening, Bloco 4)', () => {
    it('remove a entrada quando a geração informada ainda é a atual (fluxo real: getOrCreate -> init -> disconnect -> evictIfCurrent)', async () => {
      const { registry } = buildRegistry();
      const sessionManager = registry.getOrCreate('tenant-1', 'vendas');
      await sessionManager.init();
      const generation = sessionManager.getGeneration();
      await sessionManager.disconnect();

      const evicted = registry.evictIfCurrent('tenant-1', 'vendas', generation);

      expect(evicted).toBe(true);
    });

    it('após evictar, a próxima getOrCreate() cria uma instância NOVA (a antiga não fica presa no Map)', async () => {
      const { registry, providerFactory } = buildRegistry();
      const first = registry.getOrCreate('tenant-1', 'vendas');
      await first.init();
      const generation = first.getGeneration();
      await first.disconnect();
      registry.evictIfCurrent('tenant-1', 'vendas', generation);

      const second = registry.getOrCreate('tenant-1', 'vendas');

      expect(second).not.toBe(first);
      expect(providerFactory.createCalls).toHaveLength(2);
    });

    it('[race fechada] NÃO remove quando a geração avançou entre a captura e a evicção (reconexão concorrente aconteceu no meio-tempo)', async () => {
      const { registry, providerFactory } = buildRegistry();
      const sessionManager = registry.getOrCreate('tenant-1', 'vendas');
      // init() registra o listener em subscribeToProviderEvents — sem isso,
      // emitEvent() abaixo não teria efeito nenhum (armadilha real encontrada
      // rodando este teste: `getOrCreate()` sozinho NÃO chama init(), então
      // o listener ainda não existe até aqui).
      await sessionManager.init();
      const capturedGeneration = sessionManager.getGeneration();

      // Simula uma reconexão concorrente entre a captura da geração e a
      // chamada de evictIfCurrent() — origem irrelevante (poderia ser outra
      // requisição HTTP ou a reconexão automática interna do Baileys após
      // 515); do ponto de vista do Registry, só a geração importa.
      const [createdProvider] = providerFactory.getCreatedProviders();
      createdProvider.emitEvent({ type: 'status_changed', status: 'connecting' });

      const evicted = registry.evictIfCurrent('tenant-1', 'vendas', capturedGeneration);

      expect(evicted).toBe(false);
      // A instância continua no Map — próxima getOrCreate() devolve a MESMA,
      // não órfã nem substituída por engano.
      const stillSame = registry.getOrCreate('tenant-1', 'vendas');
      expect(stillSame).toBe(sessionManager);
      expect(providerFactory.createCalls).toHaveLength(1);
    });

    it('retorna false, sem lançar, para um par (tenantId, sessionName) que nunca existiu no Map', () => {
      const { registry } = buildRegistry();

      const evicted = registry.evictIfCurrent('tenant-inexistente', 'sessao-inexistente', 0);

      expect(evicted).toBe(false);
    });

    it('retorna false ao tentar evictar duas vezes seguidas (segunda chamada não encontra mais a entrada)', () => {
      const { registry } = buildRegistry();
      const sessionManager = registry.getOrCreate('tenant-1', 'vendas');
      const generation = sessionManager.getGeneration();

      const firstEviction = registry.evictIfCurrent('tenant-1', 'vendas', generation);
      const secondEviction = registry.evictIfCurrent('tenant-1', 'vendas', generation);

      expect(firstEviction).toBe(true);
      expect(secondEviction).toBe(false);
    });
  });
});
