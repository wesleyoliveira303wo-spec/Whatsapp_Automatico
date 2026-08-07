import { WhatsAppSessionService } from '../../../src/services/whatsapp/application/WhatsAppSessionService';
import { WhatsAppConnectionRegistry } from '../../../src/services/whatsapp/application/WhatsAppConnectionRegistry';
import { TenantNotFoundError } from '../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeWhatsAppProviderFactory } from './infrastructure/FakeWhatsAppProviderFactory';
import {
  FakeWhatsAppSessionRepository,
  FakeCredentialsStore,
  FakeWhatsAppSessionEventRepository,
} from './testDoubles';
import { FakeAuditLogRepository } from '../auth/testDoubles';

function buildSut(): {
  service: WhatsAppSessionService;
  tenantRepository: FakeTenantRepository;
  providerFactory: FakeWhatsAppProviderFactory;
  sessionRepo: FakeWhatsAppSessionRepository;
  credentialsStore: FakeCredentialsStore;
  eventRepo: FakeWhatsAppSessionEventRepository;
  auditLogRepository: FakeAuditLogRepository;
} {
  const providerFactory = new FakeWhatsAppProviderFactory();
  const sessionRepo = new FakeWhatsAppSessionRepository();
  const logger = new NoopLogger();
  const eventRepo = new FakeWhatsAppSessionEventRepository();
  const registry = new WhatsAppConnectionRegistry(providerFactory, sessionRepo, logger, eventRepo);
  const tenantRepository = new FakeTenantRepository();
  const credentialsStore = new FakeCredentialsStore();
  const auditLogRepository = new FakeAuditLogRepository();
  // `sessionRepo` é deliberadamente a MESMA instância passada ao Registry
  // (linha acima) e ao Service (abaixo): no mundo real, `WhatsAppSessionService`
  // e `WhatsAppConnectionRegistry` compartilham o mesmo `PrismaWhatsAppSessionRepository`
  // (mesmo banco) — replicar isso aqui é o que permite a `listSessions()`
  // enxergar sessões que o Registry já persistiu via `initSession()`. Mesmo
  // racional para `eventRepo` (M2, Fase 2): é a MESMA instância repassada
  // ao Registry/SessionManager e ao Service, para `getSessionHistory()`
  // enxergar os eventos que `SessionManager.subscribeToProviderEvents` já
  // gravou.
  const service = new WhatsAppSessionService(
    registry,
    tenantRepository,
    logger,
    sessionRepo,
    credentialsStore,
    eventRepo,
    auditLogRepository,
  );
  return {
    service,
    tenantRepository,
    providerFactory,
    sessionRepo,
    credentialsStore,
    eventRepo,
    auditLogRepository,
  };
}

describe('WhatsAppSessionService', () => {
  describe('validação de tenant (comum às quatro operações)', () => {
    it('initSession lança TenantNotFoundError e NUNCA toca o Registry quando o tenant não existe', async () => {
      const { service, providerFactory } = buildSut();

      await expect(service.initSession('tenant-inexistente', 'vendas')).rejects.toThrow(
        TenantNotFoundError,
      );
      // Prova a ordem: a validação acontece ANTES de qualquer chamada ao
      // Registry -- providerFactory.create() nunca deveria ter sido chamado.
      expect(providerFactory.createCalls).toHaveLength(0);
    });

    it('getSessionStatus lança TenantNotFoundError e nunca toca o Registry', async () => {
      const { service, providerFactory } = buildSut();

      await expect(service.getSessionStatus('tenant-inexistente', 'vendas')).rejects.toThrow(
        TenantNotFoundError,
      );
      expect(providerFactory.createCalls).toHaveLength(0);
    });

    it('getSessionQRCode lança TenantNotFoundError e nunca toca o Registry', async () => {
      const { service, providerFactory } = buildSut();

      await expect(service.getSessionQRCode('tenant-inexistente', 'vendas')).rejects.toThrow(
        TenantNotFoundError,
      );
      expect(providerFactory.createCalls).toHaveLength(0);
    });

    it('disconnectSession lança TenantNotFoundError e nunca toca o Registry', async () => {
      const { service, providerFactory } = buildSut();

      await expect(service.disconnectSession('tenant-inexistente', 'vendas')).rejects.toThrow(
        TenantNotFoundError,
      );
      expect(providerFactory.createCalls).toHaveLength(0);
    });

    it('getContactAvatarUrl lança TenantNotFoundError e nunca toca o Registry (Milestone 6, Bloco M6H-2b)', async () => {
      const { service, providerFactory } = buildSut();

      await expect(
        service.getContactAvatarUrl('tenant-inexistente', 'vendas', '5511888888888@s.whatsapp.net'),
      ).rejects.toThrow(TenantNotFoundError);
      expect(providerFactory.createCalls).toHaveLength(0);
    });
  });

  describe('delegação ao Registry quando o tenant existe', () => {
    it('initSession delega ao SessionManager correto e retorna a sessão conectada', async () => {
      const { service, tenantRepository } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });

      const session = await service.initSession('tenant-1', 'vendas');

      expect(session.tenantId).toBe('tenant-1');
      expect(session.sessionName).toBe('vendas');
      // NullWhatsAppProvider é deliberadamente inerte (ver
      // FakeWhatsAppProviderFactory.ts): getStatus() sempre retorna
      // 'disconnected', mesmo após connect() -- este teste verifica
      // delegação e propagação de identidade, não o ciclo de vida real de
      // conexão (isso já é responsabilidade de SessionManager.test.ts, que
      // usa um Fake diferente e mais fiel para esse propósito).
      expect(session.status).toBe('disconnected');
    });

    it('getSessionStatus delega ao SessionManager correto', async () => {
      const { service, tenantRepository } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');

      const status = await service.getSessionStatus('tenant-1', 'vendas');

      expect(status.tenantId).toBe('tenant-1');
      expect(status.sessionName).toBe('vendas');
    });

    it('getSessionQRCode delega ao SessionManager correto', async () => {
      const { service, tenantRepository } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');

      await expect(service.getSessionQRCode('tenant-1', 'vendas')).resolves.toEqual(
        expect.any(String),
      );
    });

    it('getContactAvatarUrl delega ao SessionManager correto (Milestone 6, Bloco M6H-2b)', async () => {
      const { service, tenantRepository, providerFactory } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');
      providerFactory.getCreatedProviders()[0].nextProfilePictureUrl =
        'https://pps.whatsapp.net/fake-avatar.jpg';

      await expect(
        service.getContactAvatarUrl('tenant-1', 'vendas', '5511888888888@s.whatsapp.net'),
      ).resolves.toBe('https://pps.whatsapp.net/fake-avatar.jpg');
    });
  });

  describe('disconnectSession — orquestração de evicção segura (Bloco 4)', () => {
    it('desconecta e evicta a instância do Registry (próxima chamada cria uma instância NOVA)', async () => {
      const { service, tenantRepository, providerFactory } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');
      expect(providerFactory.createCalls).toHaveLength(1);

      await service.disconnectSession('tenant-1', 'vendas');
      await service.initSession('tenant-1', 'vendas');

      // Evictou de verdade: a segunda chamada de initSession criou uma
      // instância NOVA (create() chamado de novo), não reaproveitou a antiga.
      // A ordem exata (capturar geração -> disconnect -> evictIfCurrent) é o
      // que este teste verifica estruturalmente. O cenário de race genuíno
      // (reconexão concorrente ENTRE a captura e a evicção) exige controlar
      // o interleaving diretamente no Registry/SessionManager -- já coberto
      // isoladamente em WhatsAppConnectionRegistry.test.ts, no nível de
      // unidade certo para isso; reproduzi-lo aqui, por trás da API pública
      // do Service, não é possível sem simular timing artificial, o que
      // produziria um teste que finge testar o Service mas na prática só
      // testa o Registry de novo, de forma mais confusa.
      expect(providerFactory.createCalls).toHaveLength(2);
    });
  });

  describe('getSessionStatus — generation (M2, Fase 1)', () => {
    it('inclui o campo generation (0 antes de qualquer evento "connecting" — NullWhatsAppProvider é inerte)', async () => {
      const { service, tenantRepository } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');

      const status = await service.getSessionStatus('tenant-1', 'vendas');

      expect(status.generation).toBe(0);
    });

    it('reflete o incremento de generation quando o provider emite status_changed "connecting"', async () => {
      const { service, tenantRepository, providerFactory } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');
      const [createdProvider] = providerFactory.getCreatedProviders();

      createdProvider.emitEvent({ type: 'status_changed', status: 'connecting' });
      const status = await service.getSessionStatus('tenant-1', 'vendas');

      expect(status.generation).toBe(1);
    });

    it('generation é por instância (ADR #42, não global): reconectar após remover cria instância com geração reiniciada', async () => {
      const { service, tenantRepository, providerFactory } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');
      const [firstProvider] = providerFactory.getCreatedProviders();
      firstProvider.emitEvent({ type: 'status_changed', status: 'connecting' });
      expect((await service.getSessionStatus('tenant-1', 'vendas')).generation).toBe(1);

      await service.disconnectSession('tenant-1', 'vendas');
      await service.initSession('tenant-1', 'vendas');
      const [, secondProvider] = providerFactory.getCreatedProviders();
      secondProvider.emitEvent({ type: 'status_changed', status: 'connecting' });
      const afterReconnect = await service.getSessionStatus('tenant-1', 'vendas');

      // Prova a instância nova por referência (Registry evictou de fato) E o
      // reinício da geração nela: mesma sequência de eventos ('connecting'
      // uma vez) produz a MESMA geração (1) na segunda instância — a geração
      // nunca "soma" com a instância anterior, porque não existe contador
      // global (ver docstring de `SessionManager.generation`).
      expect(secondProvider).not.toBe(firstProvider);
      expect(afterReconnect.generation).toBe(1);
    });
  });

  describe('listSessions (M2, Fase 1)', () => {
    it('lança TenantNotFoundError e nunca toca o repositório quando o tenant não existe', async () => {
      const { service, sessionRepo } = buildSut();
      const spy = jest.spyOn(sessionRepo, 'findAllByTenant');

      await expect(service.listSessions('tenant-inexistente')).rejects.toThrow(TenantNotFoundError);
      expect(spy).not.toHaveBeenCalled();
    });

    it('lista as sessões do tenant sem instanciar um SessionManager novo (não toca o Registry/ProviderFactory)', async () => {
      const { service, tenantRepository, providerFactory } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');
      providerFactory.createCalls.length = 0; // reseta contagem: só nos interessa o que listSessions() faz

      const sessions = await service.listSessions('tenant-1');

      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionName).toBe('vendas');
      expect(providerFactory.createCalls).toHaveLength(0);
    });

    it('não retorna sessões de outros tenants (isolamento)', async () => {
      const { service, tenantRepository } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa 1', apiKeyHash: null });
      tenantRepository.seed({ id: 'tenant-2', name: 'Empresa 2', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');
      await service.initSession('tenant-2', 'suporte');

      const sessions = await service.listSessions('tenant-1');

      expect(sessions).toHaveLength(1);
      expect(sessions[0].tenantId).toBe('tenant-1');
    });

    it('sobrepõe o status do banco com o status AO VIVO quando existe uma instância viva no Registry (correção de bug real, 2026-07-25)', async () => {
      const { service, tenantRepository, providerFactory } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');
      // Simula o cenário do bug real: o banco ficou com "connecting"/"connected"
      // (o que `initSession` grava), mas o socket real já caiu — só o provider
      // (fonte ao vivo) sabe disso; o `NullWhatsAppProvider.getStatus()` default
      // já devolve 'disconnected', reproduzindo exatamente essa divergência.
      const [provider] = providerFactory.getCreatedProviders();
      expect(await provider.getStatus()).toBe('disconnected');

      const sessions = await service.listSessions('tenant-1');

      expect(sessions[0].status).toBe('disconnected');
    });

    it('mantém o status do banco (fallback) quando NÃO existe instância viva no Registry — nunca instancia uma nova só para listar', async () => {
      const { service, tenantRepository, sessionRepo, providerFactory } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      // Popula o repositório diretamente (sem initSession) — simula uma
      // sessão conhecida do banco mas nunca tocada pelo Registry nesta
      // execução do processo (ex.: logo após um restart da API).
      await sessionRepo.upsertByTenantAndSessionName(
        'tenant-1',
        'suporte',
        {
          id: 'sessao-1',
          tenantId: 'tenant-1',
          sessionName: 'suporte',
          provider: 'baileys',
          status: 'connected',
          phoneNumber: '5511999999999',
          connectedAt: new Date(),
          lastSeen: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { status: 'connected', lastSeen: new Date() },
      );

      const sessions = await service.listSessions('tenant-1');

      expect(sessions).toHaveLength(1);
      expect(sessions[0].status).toBe('connected'); // valor do banco, preservado
      expect(providerFactory.createCalls).toHaveLength(0); // nenhuma instância nova criada
    });
  });

  describe('removeSession (M2, Fase 1)', () => {
    it('desconecta, limpa as credenciais do namespace correto e apaga o registro', async () => {
      const { service, tenantRepository, credentialsStore, sessionRepo } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');

      await service.removeSession('tenant-1', 'vendas');

      expect(credentialsStore.clearCalls).toContainEqual({
        tenantId: 'tenant-1',
        namespace: 'whatsapp:session:vendas',
      });
      expect(await sessionRepo.findByTenantAndSessionName('tenant-1', 'vendas')).toBeNull();
    });

    it('evicta a instância do Registry (reconectar depois cria uma instância nova)', async () => {
      const { service, tenantRepository, providerFactory } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');
      expect(providerFactory.createCalls).toHaveLength(1);

      await service.removeSession('tenant-1', 'vendas');
      await service.initSession('tenant-1', 'vendas');

      expect(providerFactory.createCalls).toHaveLength(2);
    });

    it('lança TenantNotFoundError e não toca credentialsStore/repositório quando o tenant não existe', async () => {
      const { service, credentialsStore, sessionRepo } = buildSut();
      const deleteSpy = jest.spyOn(sessionRepo, 'deleteByTenantAndSessionName');

      await expect(service.removeSession('tenant-inexistente', 'vendas')).rejects.toThrow(
        TenantNotFoundError,
      );
      expect(credentialsStore.clearCalls).toHaveLength(0);
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('é idempotente: chamar duas vezes para a mesma sessão não lança na segunda vez', async () => {
      const { service, tenantRepository } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');

      await service.removeSession('tenant-1', 'vendas');

      await expect(service.removeSession('tenant-1', 'vendas')).resolves.toBeUndefined();
    });
  });

  describe('getSessionHistory (M2, Fase 2)', () => {
    it('lança TenantNotFoundError e nunca toca o eventRepository quando o tenant não existe', async () => {
      const { service, eventRepo } = buildSut();
      const spy = jest.spyOn(eventRepo, 'listRecentByTenantAndSessionName');

      await expect(service.getSessionHistory('tenant-inexistente', 'vendas')).rejects.toThrow(
        TenantNotFoundError,
      );
      expect(spy).not.toHaveBeenCalled();
    });

    it('devolve os eventos gravados por SessionManager.subscribeToProviderEvents, do mais novo para o mais antigo', async () => {
      const { service, tenantRepository, providerFactory } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');
      const [createdProvider] = providerFactory.getCreatedProviders();

      createdProvider.emitEvent({
        type: 'status_changed',
        status: 'disconnected',
        disconnectReason: 'timed_out',
      });
      await Promise.resolve();
      await Promise.resolve();
      // Espera real (não só microtasks) entre os dois eventos: garante
      // `occurredAt` mensuravelmente diferente entre eles — sem isso, dois
      // eventos gravados no mesmo milissegundo tornariam a ordenação por
      // `occurredAt desc` ambígua (mesmo risco que existiria no Postgres
      // real para dois INSERTs no mesmo milissegundo sem critério de
      // desempate secundário).
      await new Promise((resolve) => setTimeout(resolve, 2));
      createdProvider.emitEvent({ type: 'status_changed', status: 'connecting' });
      await Promise.resolve();
      await Promise.resolve();

      const history = await service.getSessionHistory('tenant-1', 'vendas');

      expect(history).toHaveLength(2);
      expect(history[0].status).toBe('connecting');
      expect(history[1]).toMatchObject({ status: 'disconnected', disconnectReason: 'timed_out' });
    });

    it('continua consultável depois que a sessão foi removida (histórico sobrevive a removeSession)', async () => {
      const { service, tenantRepository, providerFactory } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      await service.initSession('tenant-1', 'vendas');
      const [createdProvider] = providerFactory.getCreatedProviders();
      createdProvider.emitEvent({
        type: 'status_changed',
        status: 'disconnected',
        disconnectReason: 'logged_out',
      });
      await Promise.resolve();
      await Promise.resolve();

      await service.removeSession('tenant-1', 'vendas');
      const history = await service.getSessionHistory('tenant-1', 'vendas');

      expect(history).toHaveLength(1);
    });

    it('respeita um limit explícito e nunca ultrapassa o teto máximo (MAX_HISTORY_LIMIT)', async () => {
      const { service, tenantRepository, eventRepo } = buildSut();
      tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
      const listSpy = jest.spyOn(eventRepo, 'listRecentByTenantAndSessionName');

      await service.getSessionHistory('tenant-1', 'vendas', 5);
      expect(listSpy).toHaveBeenLastCalledWith('tenant-1', 'vendas', 5);

      await service.getSessionHistory('tenant-1', 'vendas', 999999);
      expect(listSpy).toHaveBeenLastCalledWith('tenant-1', 'vendas', 200);
    });
  });
});

describe('WhatsAppSessionService — auditoria + ator (Milestone 5, Bloco M5D-3)', () => {
  it('initSession audita session.created com o ator', async () => {
    const { service, tenantRepository, auditLogRepository } = buildSut();
    tenantRepository.seed({ id: 'tenant-1', name: 'Empresa', apiKeyHash: null });

    await service.initSession('tenant-1', 'vendas', { userId: 'user-1' }, { ip: '1.2.3.4' });

    const entries = auditLogRepository.all();
    expect(
      entries.some(
        (e) =>
          e.action === 'session.created' && e.actorUserId === 'user-1' && e.targetId === 'vendas',
      ),
    ).toBe(true);
  });

  it('disconnectSession audita session.disconnected_by_user (uma vez)', async () => {
    const { service, tenantRepository, auditLogRepository } = buildSut();
    tenantRepository.seed({ id: 'tenant-1', name: 'Empresa', apiKeyHash: null });

    await service.disconnectSession('tenant-1', 'vendas', { userId: 'user-1' });

    const disconnected = auditLogRepository
      .all()
      .filter((e) => e.action === 'session.disconnected_by_user');
    expect(disconnected).toHaveLength(1);
  });

  it('removeSession audita session.removed e NÃO emite session.disconnected_by_user (evita evento duplo)', async () => {
    const { service, tenantRepository, auditLogRepository } = buildSut();
    tenantRepository.seed({ id: 'tenant-1', name: 'Empresa', apiKeyHash: null });

    await service.removeSession('tenant-1', 'vendas', { userId: 'user-1' });

    const actions = auditLogRepository.all().map((e) => e.action);
    expect(actions).toContain('session.removed');
    expect(actions).not.toContain('session.disconnected_by_user');
  });

  it('plano máquina (sem ator) audita sem actorUserId', async () => {
    const { service, tenantRepository, auditLogRepository } = buildSut();
    tenantRepository.seed({ id: 'tenant-1', name: 'Empresa', apiKeyHash: null });

    await service.initSession('tenant-1', 'vendas');

    expect(
      auditLogRepository
        .all()
        .some((e) => e.action === 'session.created' && e.actorUserId === undefined),
    ).toBe(true);
  });
});
