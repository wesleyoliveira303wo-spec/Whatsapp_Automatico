import {
  WhatsAppGroupDirectoryService,
} from '../../../../src/services/whatsapp/application/WhatsAppGroupDirectoryService';
import { WhatsAppConnectionRegistry } from '../../../../src/services/whatsapp/application/WhatsAppConnectionRegistry';
import { WhatsAppNotConnectedError } from '../../../../src/services/whatsapp/domain/errors/WhatsAppNotConnectedError';
import { WhatsAppGroupSummary } from '../../../../src/services/whatsapp/domain/entities/WhatsAppGroupSummary';
import { FakeWhatsAppProviderFactory } from '../infrastructure/FakeWhatsAppProviderFactory';
import { FakeWhatsAppSessionRepository, FakeWhatsAppSessionEventRepository } from '../testDoubles';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { TenantNotFoundError } from '../../../../src/shared/tenant/domain/errors/TenantNotFoundError';

const SAMPLE_GROUP: WhatsAppGroupSummary = {
  jid: '111@g.us',
  name: 'Grupo 1',
  participantCount: 5,
  announce: false,
  isAdmin: true,
  canSend: true,
};

function buildSut(options: { now?: () => number } = {}): {
  service: WhatsAppGroupDirectoryService;
  registry: WhatsAppConnectionRegistry;
  providerFactory: FakeWhatsAppProviderFactory;
  tenantRepository: FakeTenantRepository;
} {
  const providerFactory = new FakeWhatsAppProviderFactory();
  const sessionRepo = new FakeWhatsAppSessionRepository();
  const eventRepo = new FakeWhatsAppSessionEventRepository();
  const logger = new NoopLogger();
  const registry = new WhatsAppConnectionRegistry(providerFactory, sessionRepo, logger, eventRepo);
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });

  const service = new WhatsAppGroupDirectoryService(registry, tenantRepository, logger, {
    now: options.now,
  });
  return { service, registry, providerFactory, tenantRepository };
}

describe('WhatsAppGroupDirectoryService (Disparos em grupos, 2026-09-11)', () => {
  it('lança TenantNotFoundError para tenant inexistente', async () => {
    const { service } = buildSut();

    await expect(service.listGroups('tenant-fantasma', 'default')).rejects.toBeInstanceOf(
      TenantNotFoundError,
    );
  });

  it('lança WhatsAppNotConnectedError sem instância viva no registry (nunca instancia uma só para listar)', async () => {
    const { service, providerFactory } = buildSut();

    await expect(service.listGroups('tenant-1', 'default')).rejects.toBeInstanceOf(
      WhatsAppNotConnectedError,
    );
    expect(providerFactory.getCreatedProviders()).toHaveLength(0);
  });

  it('consulta o provider via a instância viva e devolve o snapshot com fetchedAt', async () => {
    const { service, registry, providerFactory } = buildSut({ now: () => 1_000 });
    registry.getOrCreate('tenant-1', 'default');
    const [provider] = providerFactory.getCreatedProviders();
    provider.listGroupsResult = [SAMPLE_GROUP];

    const snapshot = await service.listGroups('tenant-1', 'default');

    expect(snapshot.groups).toEqual([SAMPLE_GROUP]);
    expect(snapshot.fetchedAt).toEqual(new Date(1_000));
  });

  it('reaproveita o cache dentro do TTL — não consulta o provider de novo', async () => {
    let now = 0;
    const { service, registry, providerFactory } = buildSut({ now: () => now });
    registry.getOrCreate('tenant-1', 'default');
    const [provider] = providerFactory.getCreatedProviders();
    provider.listGroupsResult = [SAMPLE_GROUP];

    await service.listGroups('tenant-1', 'default');
    now = 5_000; // dentro do TTL padrão (60s)
    provider.listGroupsCalls.length = 0;
    const second = await service.listGroups('tenant-1', 'default');

    expect(provider.listGroupsCalls).toHaveLength(0);
    expect(second.groups).toEqual([SAMPLE_GROUP]);
  });

  it('depois do TTL, consulta de novo mesmo sem forceRefresh', async () => {
    let now = 0;
    const { service, registry, providerFactory } = buildSut({ now: () => now });
    registry.getOrCreate('tenant-1', 'default');
    const [provider] = providerFactory.getCreatedProviders();
    provider.listGroupsResult = [SAMPLE_GROUP];

    await service.listGroups('tenant-1', 'default');
    now = 61_000; // depois do TTL padrão (60s)
    await service.listGroups('tenant-1', 'default');

    expect(provider.listGroupsCalls).toHaveLength(2);
  });

  it('forceRefresh respeita o PISO de atualização (não bombardeia o socket a cada clique)', async () => {
    let now = 0;
    const { service, registry, providerFactory } = buildSut({ now: () => now });
    registry.getOrCreate('tenant-1', 'default');
    const [provider] = providerFactory.getCreatedProviders();
    provider.listGroupsResult = [SAMPLE_GROUP];

    await service.listGroups('tenant-1', 'default');
    now = 2_000; // menos que o piso de 10s
    const second = await service.listGroups('tenant-1', 'default', { forceRefresh: true });

    expect(provider.listGroupsCalls).toHaveLength(1); // não consultou de novo
    expect(second.groups).toEqual([SAMPLE_GROUP]);
  });

  it('forceRefresh consulta de novo depois do piso de atualização', async () => {
    let now = 0;
    const { service, registry, providerFactory } = buildSut({ now: () => now });
    registry.getOrCreate('tenant-1', 'default');
    const [provider] = providerFactory.getCreatedProviders();
    provider.listGroupsResult = [SAMPLE_GROUP];

    await service.listGroups('tenant-1', 'default');
    now = 11_000; // depois do piso de 10s
    await service.listGroups('tenant-1', 'default', { forceRefresh: true });

    expect(provider.listGroupsCalls).toHaveLength(2);
  });

  it('deduplica consultas em voo — duas chamadas simultâneas geram uma única consulta ao provider', async () => {
    const { service, registry, providerFactory } = buildSut();
    registry.getOrCreate('tenant-1', 'default');
    const [provider] = providerFactory.getCreatedProviders();
    let resolveListGroups: ((groups: WhatsAppGroupSummary[]) => void) | undefined;
    provider.listGroups = () =>
      new Promise((resolve) => {
        resolveListGroups = resolve;
      });

    const first = service.listGroups('tenant-1', 'default');
    const second = service.listGroups('tenant-1', 'default');
    // As duas chamadas passam por um `await` (checagem do tenant) antes de
    // sequer chegar em `live.listGroups()` — dá tempo ao microtask loop até
    // o resolver de fato existir, antes de acioná-lo.
    for (let i = 0; i < 20 && !resolveListGroups; i += 1) await Promise.resolve();
    resolveListGroups!([SAMPLE_GROUP]);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.groups).toEqual([SAMPLE_GROUP]);
    expect(secondResult).toBe(firstResult); // mesma Promise/objeto — nunca duas consultas.
  });

  it('propaga o erro do provider (ex.: timeout) sem cachear nada', async () => {
    const { service, registry, providerFactory } = buildSut();
    registry.getOrCreate('tenant-1', 'default');
    const [provider] = providerFactory.getCreatedProviders();
    provider.nextListGroupsError = new Error('timeout simulado');

    await expect(service.listGroups('tenant-1', 'default')).rejects.toThrow('timeout simulado');

    // Uma consulta seguinte tenta de novo (nada foi cacheado da falha).
    provider.listGroupsResult = [SAMPLE_GROUP];
    const snapshot = await service.listGroups('tenant-1', 'default');
    expect(snapshot.groups).toEqual([SAMPLE_GROUP]);
  });
});
