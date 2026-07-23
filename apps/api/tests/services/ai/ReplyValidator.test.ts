import { validateReply } from '../../../src/services/ai/domain/ReplyValidator';

describe('validateReply', () => {
  it('aceita uma resposta não vazia dentro do limite', () => {
    const result = validateReply('Olá! Como posso ajudar?', 100);

    expect(result).toEqual({ valid: true, sanitized: 'Olá! Como posso ajudar?' });
  });

  it('remove espaços em branco nas bordas da resposta válida', () => {
    const result = validateReply('  Olá!  ', 100);

    expect(result).toEqual({ valid: true, sanitized: 'Olá!' });
  });

  it('rejeita uma resposta vazia', () => {
    const result = validateReply('', 100);

    expect(result).toEqual({ valid: false, reason: 'Resposta vazia' });
  });

  it('rejeita uma resposta composta só de espaços em branco', () => {
    const result = validateReply('   ', 100);

    expect(result.valid).toBe(false);
  });

  it('rejeita uma resposta acima do limite configurado', () => {
    const longContent = 'a'.repeat(101);

    const result = validateReply(longContent, 100);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('100');
    }
  });

  it('aceita uma resposta exatamente no limite configurado', () => {
    const exactContent = 'a'.repeat(100);

    const result = validateReply(exactContent, 100);

    expect(result.valid).toBe(true);
  });
});
