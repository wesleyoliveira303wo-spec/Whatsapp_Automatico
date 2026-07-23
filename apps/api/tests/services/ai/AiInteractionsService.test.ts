import { AiInteractionsService } from '../../../src/services/ai/application/AiInteractionsService';
import { TenantNotFoundError } from '../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { AiInteraction } from '../../../src/services/ai/domain/entities/AiInteraction';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeAiInteractionRepository } from './infrastructure/FakeAiInteractionRepository';

function buildInteraction(overrides: Partial<Omit<AiInteraction, 'id' | 'createdAt'>> = {}): Omit<AiInteraction, 'id' | 'createdAt'> {
  return {
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    provider: 'claude',
    model: 'claude-opus-4-8',
    promptVersion: 'v1',
    tokensInput: 12,
    tokensOutput: 8,
    costUsd: '0.00012000',
    latencyMs: 350,
    status: 'success',
    ...overrides,
  };
}

function buildService(): {
  service: AiInteractionsService;
  aiInteractionRepository: FakeAiInteractionRepository;
  tenantRepository: FakeTenantRepository;
} {
  const aiInteractionRepository = new FakeAiInteractionRepository();
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: 'hash-qualquer' });
  const service = new AiInteractionsService(aiInteractionRepository, tenantRepository, new NoopLogger());
  return { service, aiInteractionRepository, tenantRepository };
}

describe('AiInteractionsService (Milestone 3, Bloco 5 - D13)', () => {
  it('com conversationId informado, delega a listByConversation()', async () => {
    const { service, aiInteractionRepository } = buildService();
    await aiInteractionRepository.record(buildInteraction({ conversationId: 'conversation-1' }));
    await aiInteractionRepository.record(buildInteraction({ conversationId: 'conversation-2' }));

    const result = await service.listInteractions('tenant-1', { conversationId: 'conversation-1' });

    expect(result).toHaveLength(1);
    expect(result[0].conversationId).toBe('conversation-1');
  });

  it('sem conversationId, delega a listByTenant() (lista tudo do tenant)', async () => {
    const { service, aiInteractionRepository } = buildService();
    await aiInteractionRepository.record(buildInteraction({ conversationId: 'conversation-1' }));
    await aiInteractionRepository.record(buildInteraction({ conversationId: 'conversation-2' }));

    const result = await service.listInteractions('tenant-1');

    expect(result).toHaveLength(2);
  });

  it('aplica DEFAULT_LIMIT/MAX_LIMIT (nunca excede o teto)', async () => {
    const { service, aiInteractionRepository } = buildService();
    const listByTenantSpy = jest.spyOn(aiInteractionRepository, 'listByTenant');

    await service.listInteractions('tenant-1', { limit: 999999 });

    expect(listByTenantSpy).toHaveBeenCalledWith('tenant-1', 200);
  });

  it('lanca TenantNotFoundError quando o tenant nao existe', async () => {
    const { service } = buildService();

    await expect(service.listInteractions('tenant-inexistente')).rejects.toThrow(TenantNotFoundError);
  });

  it('conversationId de outro tenant devolve lista vazia (nao vaza dados - defesa em profundidade do proprio repositorio)', async () => {
    const { service, aiInteractionRepository } = buildService();
    await aiInteractionRepository.record(buildInteraction({ tenantId: 'tenant-2', conversationId: 'conversation-1' }));

    const result = await service.listInteractions('tenant-1', { conversationId: 'conversation-1' });

    expect(result).toEqual([]);
  });
});
