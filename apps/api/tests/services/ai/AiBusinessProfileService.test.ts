import { AiBusinessProfileService } from '../../../src/services/ai/application/AiBusinessProfileService';
import { TenantNotFoundError } from '../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeAiBusinessProfileRepository } from './infrastructure/FakeAiBusinessProfileRepository';

function buildSut(): {
  sut: AiBusinessProfileService;
  profiles: FakeAiBusinessProfileRepository;
  tenants: FakeTenantRepository;
} {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const profiles = new FakeAiBusinessProfileRepository();
  const sut = new AiBusinessProfileService(profiles, tenants, new NoopLogger());
  return { sut, profiles, tenants };
}

describe('AiBusinessProfileService (Base de Conhecimento — Nível 1)', () => {
  describe('getProfile', () => {
    it('devolve null quando o tenant existe mas não tem perfil', async () => {
      const { sut } = buildSut();

      expect(await sut.getProfile('tenant-1')).toBeNull();
    });

    it('devolve o perfil quando existe', async () => {
      const { sut, profiles } = buildSut();
      profiles.seed('tenant-1', 'Salão da Maria.');

      const profile = await sut.getProfile('tenant-1');

      expect(profile?.content).toBe('Salão da Maria.');
    });

    it('lança TenantNotFoundError quando o tenant não existe', async () => {
      const { sut } = buildSut();

      await expect(sut.getProfile('tenant-inexistente')).rejects.toThrow(TenantNotFoundError);
    });
  });

  describe('saveProfile', () => {
    it('faz upsert e devolve o perfil persistido', async () => {
      const { sut, profiles } = buildSut();

      const saved = await sut.saveProfile('tenant-1', 'Barbearia do João.');

      expect(saved.content).toBe('Barbearia do João.');
      expect(await profiles.findByTenant('tenant-1')).not.toBeNull();
    });

    it('sobrescreve o conteúdo anterior (idempotente por tenant)', async () => {
      const { sut, profiles } = buildSut();
      profiles.seed('tenant-1', 'Texto antigo');

      await sut.saveProfile('tenant-1', 'Texto novo');

      expect((await profiles.findByTenant('tenant-1'))?.content).toBe('Texto novo');
    });

    it('lança TenantNotFoundError quando o tenant não existe (não cria perfil órfão)', async () => {
      const { sut, profiles } = buildSut();

      await expect(sut.saveProfile('tenant-inexistente', 'x')).rejects.toThrow(TenantNotFoundError);
      expect(await profiles.findByTenant('tenant-inexistente')).toBeNull();
    });
  });
});
