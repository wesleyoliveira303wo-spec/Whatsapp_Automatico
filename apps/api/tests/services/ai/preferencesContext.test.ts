import { buildPreferencesContext } from '../../../src/services/ai/domain/preferencesContext';
import { AiPreferences } from '../../../src/services/ai/domain/entities/AiPreferences';

function preferences(overrides: Partial<AiPreferences> = {}): AiPreferences {
  return {
    tenantId: 'tenant-1',
    sessionName: 'sessao-1',
    updatedAt: new Date('2026-08-26T00:00:00.000Z'),
    autonomyLevel: 'balanced',
    maxDiscountPercent: null,
    topicsToAvoid: null,
    escalateAfterAttempts: null,
    customHandoffMessage: null,
    ...overrides,
  };
}

describe('buildPreferencesContext (Cérebro da IA v3, Fase 3)', () => {
  it('devolve undefined quando não há preferências (sessão nunca configurou)', () => {
    expect(buildPreferencesContext(null)).toBeUndefined();
  });

  it('sempre inclui a instrução de autonomia, mesmo sem nenhum outro campo configurado', () => {
    const context = buildPreferencesContext(preferences());

    expect(context).toContain('# Preferências de atendimento');
    expect(context).toContain('EQUILIBRADO');
  });

  it('varia a instrução conforme o nível de autonomia', () => {
    expect(buildPreferencesContext(preferences({ autonomyLevel: 'conservative' }))).toContain(
      'CONSERVADOR',
    );
    expect(buildPreferencesContext(preferences({ autonomyLevel: 'autonomous' }))).toContain(
      'AUTÔNOMO',
    );
  });

  it('inclui o limite de desconto só quando configurado', () => {
    const semLimite = buildPreferencesContext(preferences());
    expect(semLimite).not.toContain('desconto');

    const comLimite = buildPreferencesContext(preferences({ maxDiscountPercent: 15 }));
    expect(comLimite).toContain('até 15%');
  });

  it('inclui os assuntos a evitar só quando configurado e não vazio (trim)', () => {
    expect(buildPreferencesContext(preferences({ topicsToAvoid: '   ' }))).not.toContain(
      'evitar',
    );

    const context = buildPreferencesContext(
      preferences({ topicsToAvoid: 'reembolsos, disputas jurídicas' }),
    );
    expect(context).toContain('reembolsos, disputas jurídicas');
  });

  it('inclui o critério de escalar após N tentativas só quando configurado', () => {
    const context = buildPreferencesContext(preferences({ escalateAfterAttempts: 3 }));
    expect(context).toContain('até 3');
    expect(context).toContain('encaminhar');
  });

  it('nunca menciona a mensagem de encaminhamento (customHandoffMessage não é instrução de prompt)', () => {
    const context = buildPreferencesContext(
      preferences({ customHandoffMessage: 'Segura aí que já te chamo um humano!' }),
    );
    expect(context).not.toContain('Segura aí');
  });

  it('combina todos os campos configurados num único bloco', () => {
    const context = buildPreferencesContext(
      preferences({
        autonomyLevel: 'autonomous',
        maxDiscountPercent: 10,
        topicsToAvoid: 'assuntos jurídicos',
        escalateAfterAttempts: 2,
      }),
    );

    expect(context).toContain('AUTÔNOMO');
    expect(context).toContain('até 10%');
    expect(context).toContain('assuntos jurídicos');
    expect(context).toContain('até 2');
  });
});
