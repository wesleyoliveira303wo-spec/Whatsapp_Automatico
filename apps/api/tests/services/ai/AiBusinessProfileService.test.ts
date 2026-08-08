import { AiBusinessProfileService } from '../../../src/services/ai/application/AiBusinessProfileService';
import { TenantNotFoundError } from '../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeAiBusinessProfileRepository } from './infrastructure/FakeAiBusinessProfileRepository';

const SESSION = 'sessao-1';

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

describe('AiBusinessProfileService (Base de Conhecimento — Nível 1, por sessão desde M6H-3)', () => {
  describe('getProfile', () => {
    it('devolve null quando o tenant existe mas a sessão não tem perfil', async () => {
      const { sut } = buildSut();

      expect(await sut.getProfile('tenant-1', SESSION)).toBeNull();
    });

    it('devolve o perfil quando existe', async () => {
      const { sut, profiles } = buildSut();
      profiles.seed('tenant-1', SESSION, 'Salão da Maria.');

      const profile = await sut.getProfile('tenant-1', SESSION);

      expect(profile?.content).toBe('Salão da Maria.');
    });

    it('não mistura perfis de sessões diferentes do mesmo tenant', async () => {
      const { sut, profiles } = buildSut();
      profiles.seed('tenant-1', SESSION, 'Perfil da sessão 1.');
      profiles.seed('tenant-1', 'sessao-2', 'Perfil da sessão 2.');

      expect((await sut.getProfile('tenant-1', SESSION))?.content).toBe('Perfil da sessão 1.');
      expect((await sut.getProfile('tenant-1', 'sessao-2'))?.content).toBe('Perfil da sessão 2.');
    });

    it('lança TenantNotFoundError quando o tenant não existe', async () => {
      const { sut } = buildSut();

      await expect(sut.getProfile('tenant-inexistente', SESSION)).rejects.toThrow(
        TenantNotFoundError,
      );
    });
  });

  describe('saveProfile', () => {
    it('faz upsert e devolve o perfil persistido', async () => {
      const { sut, profiles } = buildSut();

      const saved = await sut.saveProfile('tenant-1', SESSION, { content: 'Barbearia do João.' });

      expect(saved.content).toBe('Barbearia do João.');
      expect(await profiles.findByTenantAndSession('tenant-1', SESSION)).not.toBeNull();
    });

    it('sobrescreve o conteúdo anterior (idempotente por tenant+sessão)', async () => {
      const { sut, profiles } = buildSut();
      profiles.seed('tenant-1', SESSION, 'Texto antigo');

      await sut.saveProfile('tenant-1', SESSION, { content: 'Texto novo' });

      expect((await profiles.findByTenantAndSession('tenant-1', SESSION))?.content).toBe(
        'Texto novo',
      );
    });

    it('persiste campos de horário de atendimento (F1.8)', async () => {
      const { sut } = buildSut();

      const saved = await sut.saveProfile('tenant-1', SESSION, {
        content: 'Salão da Maria.',
        offHoursEnabled: true,
        workingHoursStart: '09:00',
        workingHoursEnd: '18:00',
        workingDays: 62,
        timezone: 'America/Sao_Paulo',
      });

      expect(saved.offHoursEnabled).toBe(true);
      expect(saved.workingHoursStart).toBe('09:00');
      expect(saved.workingHoursEnd).toBe('18:00');
      expect(saved.workingDays).toBe(62);
      expect(saved.timezone).toBe('America/Sao_Paulo');
    });

    it('lança TenantNotFoundError quando o tenant não existe (não cria perfil órfão)', async () => {
      const { sut, profiles } = buildSut();

      await expect(
        sut.saveProfile('tenant-inexistente', SESSION, { content: 'x' }),
      ).rejects.toThrow(TenantNotFoundError);
      expect(await profiles.findByTenantAndSession('tenant-inexistente', SESSION)).toBeNull();
    });
  });

  // Fase 1 (2026-08-07) — Botão POWER.
  describe('setAiEnabled', () => {
    it('desliga a IA e devolve o perfil persistido', async () => {
      const { sut } = buildSut();

      const result = await sut.setAiEnabled('tenant-1', SESSION, false);

      expect(result.aiEnabled).toBe(false);
    });

    it('religa a IA sem mexer no content já salvo', async () => {
      const { sut, profiles } = buildSut();
      profiles.seed('tenant-1', SESSION, 'Salão da Maria.');
      await sut.setAiEnabled('tenant-1', SESSION, false);

      const result = await sut.setAiEnabled('tenant-1', SESSION, true);

      expect(result.aiEnabled).toBe(true);
      expect(result.content).toBe('Salão da Maria.');
    });

    it('lança TenantNotFoundError quando o tenant não existe (não cria perfil órfão)', async () => {
      const { sut, profiles } = buildSut();

      await expect(sut.setAiEnabled('tenant-inexistente', SESSION, false)).rejects.toThrow(
        TenantNotFoundError,
      );
      expect(await profiles.findByTenantAndSession('tenant-inexistente', SESSION)).toBeNull();
    });
  });
});
