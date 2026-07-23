import { ESCALATION_MARKER, extractEscalation } from '../../../src/services/ai/domain/escalationSignal';

describe('extractEscalation', () => {
  it('sem marcador: escalate false e content inalterado', () => {
    const result = extractEscalation('Claro! O corte custa R$ 50.');
    expect(result).toEqual({ escalate: false, content: 'Claro! O corte custa R$ 50.' });
  });

  it('com marcador no fim: escalate true e o marcador é removido do content', () => {
    const raw = `Vou te encaminhar para um atendente que resolve isso.\n\n${ESCALATION_MARKER}`;
    const result = extractEscalation(raw);
    expect(result.escalate).toBe(true);
    expect(result.content).toBe('Vou te encaminhar para um atendente que resolve isso.');
    expect(result.content).not.toContain(ESCALATION_MARKER);
  });

  it('remove TODAS as ocorrências do marcador (a IA às vezes repete)', () => {
    const raw = `${ESCALATION_MARKER} Um momento ${ESCALATION_MARKER}`;
    const result = extractEscalation(raw);
    expect(result.escalate).toBe(true);
    expect(result.content).not.toContain(ESCALATION_MARKER);
    expect(result.content).toBe('Um momento');
  });
});
