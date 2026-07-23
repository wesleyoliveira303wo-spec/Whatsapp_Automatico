import { resolveTenantFromApiKey } from '../../../src/shared/tenant/application/resolveTenantFromApiKey';
import { FakeApiKeyHasher } from '../security/FakeApiKeyHasher';
import { FakeTenantRepository } from './FakeTenantRepository';

describe('resolveTenantFromApiKey', () => {
  it('resolve o tenant dono da API key apresentada', async () => {
    const hasher = new FakeApiKeyHasher();
    const tenantRepository = new FakeTenantRepository();
    const apiKeyHash = hasher.hash('chave-valida-do-tenant-1');
    tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash });

    const tenant = await resolveTenantFromApiKey(hasher, tenantRepository, 'chave-valida-do-tenant-1');

    expect(tenant).toEqual({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash });
  });

  it('retorna null quando a API key não corresponde a nenhum tenant', async () => {
    const hasher = new FakeApiKeyHasher();
    const tenantRepository = new FakeTenantRepository();
    tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: hasher.hash('chave-do-tenant-1') });

    const tenant = await resolveTenantFromApiKey(hasher, tenantRepository, 'chave-errada');

    expect(tenant).toBeNull();
  });

  it('retorna null para API key vazia, sem consultar o repositório', async () => {
    const hasher = new FakeApiKeyHasher();
    const tenantRepository = new FakeTenantRepository();
    jest.spyOn(tenantRepository, 'findByApiKeyHash');

    const tenant = await resolveTenantFromApiKey(hasher, tenantRepository, '');

    expect(tenant).toBeNull();
    expect(tenantRepository.findByApiKeyHash).not.toHaveBeenCalled();
  });

  it('não resolve tenant cuja apiKeyHash é null (sem chave emitida)', async () => {
    const hasher = new FakeApiKeyHasher();
    const tenantRepository = new FakeTenantRepository();
    tenantRepository.seed({ id: 'tenant-sem-chave', name: 'Empresa Sem Chave', apiKeyHash: null });

    const tenant = await resolveTenantFromApiKey(hasher, tenantRepository, 'qualquer-coisa');

    expect(tenant).toBeNull();
  });
});
