import { BusinessSummaryService } from '../../../src/services/ai/application/BusinessSummaryService';
import { AiBusinessProfileService } from '../../../src/services/ai/application/AiBusinessProfileService';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeAiBusinessProfileRepository } from './infrastructure/FakeAiBusinessProfileRepository';
import { FakeAiProvider } from './infrastructure/FakeAiProviderFactory';

/**
 * Auditoria do Perfil (2026-08-28) — pedido explícito do fundador: "resumo
 * automático e deve ficar salvo, atualizar somente quando houver interação
 * no cérebro da IA". Cobre o Application Service isolado (o gatilho real —
 * `PUT .../ai-profile` — está coberto em `aiProfileRouter.test.ts`).
 */
describe('BusinessSummaryService', () => {
  const TENANT = 'tenant-1';
  const SESSION = 'sessao-1';
  const FIXED_NOW = new Date('2026-08-28T12:00:00.000Z');

  function setup(): {
    service: BusinessSummaryService;
    profiles: FakeAiBusinessProfileRepository;
    aiProvider: FakeAiProvider;
  } {
    const tenantRepository = new FakeTenantRepository();
    tenantRepository.seed({ id: TENANT, name: 'Empresa Um', apiKeyHash: 'hash' });
    const profiles = new FakeAiBusinessProfileRepository();
    profiles.seed(TENANT, SESSION, 'conteúdo inicial');
    const aiBusinessProfileService = new AiBusinessProfileService(
      profiles,
      tenantRepository,
      new NoopLogger(),
    );
    const aiProvider = new FakeAiProvider();
    const service = new BusinessSummaryService(
      aiBusinessProfileService,
      new NoopLogger(),
      aiProvider,
      () => FIXED_NOW,
    );
    return { service, profiles, aiProvider };
  }

  it('gera e salva o resumo a partir do content informado', async () => {
    const { service, profiles, aiProvider } = setup();
    aiProvider.setNextResult({
      content: 'A empresa vende bolos sob encomenda para toda a cidade.',
      model: 'fake-model',
      tokensInput: 10,
      tokensOutput: 12,
    });

    await service.regenerate(TENANT, SESSION, 'Vendo bolos sob encomenda, entrego na cidade toda.');

    const persisted = await profiles.findByTenantAndSession(TENANT, SESSION);
    expect(persisted?.summary).toBe('A empresa vende bolos sob encomenda para toda a cidade.');
    expect(persisted?.summaryGeneratedAt).toEqual(FIXED_NOW);
  });

  it('passa o content bruto pro provider, num prompt de resumo de NEGÓCIO (não de conversa)', async () => {
    const { service, aiProvider } = setup();

    await service.regenerate(TENANT, SESSION, 'Salão da Maria. Corte R$ 50.');

    expect(aiProvider.generateReplyCalls).toHaveLength(1);
    const request = aiProvider.generateReplyCalls[0];
    expect(request.messages).toEqual([{ role: 'user', content: 'Salão da Maria. Corte R$ 50.' }]);
    expect(request.systemPrompt.toLowerCase()).toContain('negócio');
  });

  it('content vazio/só espaços: limpa o resumo sem chamar a IA (nada a resumir)', async () => {
    const { service, profiles, aiProvider } = setup();
    // Perfil já tinha um resumo de uma edição anterior.
    await profiles.updateSummary(TENANT, SESSION, 'resumo antigo', new Date('2026-08-01T00:00:00.000Z'));

    await service.regenerate(TENANT, SESSION, '   ');

    expect(aiProvider.generateReplyCalls).toHaveLength(0);
    const persisted = await profiles.findByTenantAndSession(TENANT, SESSION);
    expect(persisted?.summary).toBeNull();
  });

  it('falha do provider: não lança, e o resumo antigo permanece intacto (Cérebro continua salvo normalmente)', async () => {
    const { service, profiles, aiProvider } = setup();
    await profiles.updateSummary(TENANT, SESSION, 'resumo antigo', new Date('2026-08-01T00:00:00.000Z'));
    aiProvider.setNextError(new Error('provider fora do ar'));

    await expect(
      service.regenerate(TENANT, SESSION, 'texto novo do cérebro'),
    ).resolves.toBeUndefined();

    const persisted = await profiles.findByTenantAndSession(TENANT, SESSION);
    expect(persisted?.summary).toBe('resumo antigo');
  });

  it('sem AiProvider configurado (credenciais ausentes): degrada graciosamente, não lança', async () => {
    const tenantRepository = new FakeTenantRepository();
    tenantRepository.seed({ id: TENANT, name: 'Empresa Um', apiKeyHash: 'hash' });
    const profiles = new FakeAiBusinessProfileRepository();
    profiles.seed(TENANT, SESSION, 'conteúdo inicial');
    const aiBusinessProfileService = new AiBusinessProfileService(
      profiles,
      tenantRepository,
      new NoopLogger(),
    );
    const service = new BusinessSummaryService(aiBusinessProfileService, new NoopLogger());

    await expect(
      service.regenerate(TENANT, SESSION, 'texto do cérebro'),
    ).resolves.toBeUndefined();
  });
});
