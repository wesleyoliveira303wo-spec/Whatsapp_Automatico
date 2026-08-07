import {
  ESCALATION_MARKER_UNKNOWN_ANSWER,
  ESCALATION_MARKER_REQUESTED_HUMAN,
  extractEscalation,
  escalationMarkerFor,
} from '../../../src/services/ai/domain/escalationSignal';

describe('extractEscalation', () => {
  it('sem marcador: escalationReason undefined e content inalterado', () => {
    const result = extractEscalation('Claro! O corte custa R$ 50.');
    expect(result).toEqual({ escalationReason: undefined, content: 'Claro! O corte custa R$ 50.' });
  });

  it('com marcador de "não sei" no fim: escalationReason unknown_answer e o marcador é removido do content', () => {
    const raw = `Vou te encaminhar para um atendente que resolve isso.\n\n${ESCALATION_MARKER_UNKNOWN_ANSWER}`;
    const result = extractEscalation(raw);
    expect(result.escalationReason).toBe('unknown_answer');
    expect(result.content).toBe('Vou te encaminhar para um atendente que resolve isso.');
    expect(result.content).not.toContain(ESCALATION_MARKER_UNKNOWN_ANSWER);
  });

  it('com marcador de "pediu atendente" no fim: escalationReason requested_human e o marcador é removido do content', () => {
    const raw = `Já vou te encaminhar para um atendente.\n\n${ESCALATION_MARKER_REQUESTED_HUMAN}`;
    const result = extractEscalation(raw);
    expect(result.escalationReason).toBe('requested_human');
    expect(result.content).toBe('Já vou te encaminhar para um atendente.');
    expect(result.content).not.toContain(ESCALATION_MARKER_REQUESTED_HUMAN);
  });

  it('remove TODAS as ocorrências do marcador (a IA às vezes repete)', () => {
    const raw = `${ESCALATION_MARKER_UNKNOWN_ANSWER} Um momento ${ESCALATION_MARKER_UNKNOWN_ANSWER}`;
    const result = extractEscalation(raw);
    expect(result.escalationReason).toBe('unknown_answer');
    expect(result.content).not.toContain(ESCALATION_MARKER_UNKNOWN_ANSWER);
    expect(result.content).toBe('Um momento');
  });

  it('quando os dois marcadores aparecem juntos (caso não instruído, mas não impossível), prevalece unknown_answer', () => {
    const raw = `Não sei e o cliente pediu.\n${ESCALATION_MARKER_UNKNOWN_ANSWER}\n${ESCALATION_MARKER_REQUESTED_HUMAN}`;
    const result = extractEscalation(raw);
    expect(result.escalationReason).toBe('unknown_answer');
    expect(result.content).not.toContain(ESCALATION_MARKER_UNKNOWN_ANSWER);
    expect(result.content).not.toContain(ESCALATION_MARKER_REQUESTED_HUMAN);
  });
});

describe('escalationMarkerFor', () => {
  it('devolve o marcador correto para cada motivo', () => {
    expect(escalationMarkerFor('unknown_answer')).toBe(ESCALATION_MARKER_UNKNOWN_ANSWER);
    expect(escalationMarkerFor('requested_human')).toBe(ESCALATION_MARKER_REQUESTED_HUMAN);
  });
});
