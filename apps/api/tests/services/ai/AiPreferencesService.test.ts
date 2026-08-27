import { AiPreferencesService } from '../../../src/services/ai/application/AiPreferencesService';
import { TenantNotFoundError } from '../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeAiPreferencesRepository } from './infrastructure/FakeAiPreferencesRepository';

const SESSION = 'sessao-1';

function buildSut(): {
  sut: AiPreferencesService;
  preferences: FakeAiPreferencesRepository;
  tenants: FakeTenantRepository;
} {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const preferences = new FakeAiPreferencesRepository();
  const sut = new AiPreferencesService(preferences, tenants, new NoopLogger());
  return { sut, preferences, tenants };
}

describe('AiPreferencesService (Cérebro da IA v3, Fase 3)', () => {
  describe('getPreferences', () => {
    it('devolve null quando o tenant existe mas a sessão não configurou preferências', async () => {
      const { sut } = buildSut();

      expect(await sut.getPreferences('tenant-1', SESSION)).toBeNull();
    });

    it('devolve as preferências quando existem', async () => {
      const { sut, preferences } = buildSut();
      preferences.seed('tenant-1', SESSION, {
        autonomyLevel: 'autonomous',
        maxDiscountPercent: 10,
      });

      const result = await sut.getPreferences('tenant-1', SESSION);

      expect(result?.autonomyLevel).toBe('autonomous');
      expect(result?.maxDiscountPercent).toBe(10);
    });

    it('não mistura preferências de sessões diferentes do mesmo tenant', async () => {
      const { sut, preferences } = buildSut();
      preferences.seed('tenant-1', SESSION, { autonomyLevel: 'conservative' });
      preferences.seed('tenant-1', 'sessao-2', { autonomyLevel: 'autonomous' });

      expect((await sut.getPreferences('tenant-1', SESSION))?.autonomyLevel).toBe('conservative');
      expect((await sut.getPreferences('tenant-1', 'sessao-2'))?.autonomyLevel).toBe('autonomous');
    });

    it('lança TenantNotFoundError quando o tenant não existe', async () => {
      const { sut } = buildSut();

      await expect(sut.getPreferences('tenant-inexistente', SESSION)).rejects.toThrow(
        TenantNotFoundError,
      );
    });
  });

  describe('savePreferences', () => {
    it('faz upsert parcial e devolve o estado persistido', async () => {
      const { sut, preferences } = buildSut();

      const saved = await sut.savePreferences('tenant-1', SESSION, { maxDiscountPercent: 20 });

      expect(saved.maxDiscountPercent).toBe(20);
      expect(await preferences.findByTenantAndSession('tenant-1', SESSION)).not.toBeNull();
    });

    it('campo não informado preserva o valor já gravado', async () => {
      const { sut } = buildSut();
      await sut.savePreferences('tenant-1', SESSION, {
        autonomyLevel: 'autonomous',
        topicsToAvoid: 'jurídico',
      });

      const saved = await sut.savePreferences('tenant-1', SESSION, { maxDiscountPercent: 5 });

      expect(saved.autonomyLevel).toBe('autonomous');
      expect(saved.topicsToAvoid).toBe('jurídico');
      expect(saved.maxDiscountPercent).toBe(5);
    });

    it('null explícito limpa um campo já configurado', async () => {
      const { sut } = buildSut();
      await sut.savePreferences('tenant-1', SESSION, { maxDiscountPercent: 20 });

      const saved = await sut.savePreferences('tenant-1', SESSION, { maxDiscountPercent: null });

      expect(saved.maxDiscountPercent).toBeNull();
    });

    it('lança TenantNotFoundError quando o tenant não existe (não cria linha órfã)', async () => {
      const { sut, preferences } = buildSut();

      await expect(
        sut.savePreferences('tenant-inexistente', SESSION, { autonomyLevel: 'autonomous' }),
      ).rejects.toThrow(TenantNotFoundError);
      expect(await preferences.findByTenantAndSession('tenant-inexistente', SESSION)).toBeNull();
    });
  });
});
