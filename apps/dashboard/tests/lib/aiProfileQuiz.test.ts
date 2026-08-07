import {
  generateProfileTextFromQuiz,
  countAnsweredEssentialFields,
  ESSENTIAL_QUIZ_FIELDS,
  ADVANCED_QUIZ_FIELDS,
  ALL_QUIZ_FIELDS,
} from '../../lib/aiProfileQuiz';

describe('aiProfileQuiz (Cérebro da IA v2 — Assistente Guiado)', () => {
  describe('ESSENTIAL_QUIZ_FIELDS / ADVANCED_QUIZ_FIELDS / ALL_QUIZ_FIELDS', () => {
    it('tem exatamente 8 perguntas essenciais', () => {
      expect(ESSENTIAL_QUIZ_FIELDS).toHaveLength(8);
    });

    it('ALL_QUIZ_FIELDS é a concatenação de essenciais + avançado, nessa ordem', () => {
      expect(ALL_QUIZ_FIELDS).toEqual([...ESSENTIAL_QUIZ_FIELDS, ...ADVANCED_QUIZ_FIELDS]);
    });
  });

  describe('generateProfileTextFromQuiz', () => {
    it('devolve string vazia quando nenhum campo foi preenchido', () => {
      expect(generateProfileTextFromQuiz({})).toBe('');
    });

    it('gera uma linha markdown por campo preenchido, na ordem definida', () => {
      const text = generateProfileTextFromQuiz({
        businessName: 'Salão da Maria',
        whatYouSell: 'Cortes e coloração',
        pricing: 'Corte R$ 50',
      });
      expect(text).toBe(
        '- Nome: Salão da Maria\n- O que vendemos: Cortes e coloração\n- Preços: Corte R$ 50',
      );
    });

    it('omite campos vazios ou só com espaços', () => {
      const text = generateProfileTextFromQuiz({
        businessName: 'Loja X',
        pricing: '   ',
        hours: '',
      });
      expect(text).toBe('- Nome: Loja X');
    });

    it('faz trim no valor de cada campo', () => {
      const text = generateProfileTextFromQuiz({ businessName: '  Loja X  ' });
      expect(text).toBe('- Nome: Loja X');
    });

    it('inclui o campo avançado (Observações) quando preenchido, ao final', () => {
      const text = generateProfileTextFromQuiz({
        businessName: 'Loja X',
        notes: 'Não atende domingo',
      });
      expect(text).toBe('- Nome: Loja X\n- Observações: Não atende domingo');
    });
  });

  describe('countAnsweredEssentialFields', () => {
    it('conta 0 quando nada foi preenchido', () => {
      expect(countAnsweredEssentialFields({})).toBe(0);
    });

    it('conta só os campos ESSENCIAIS preenchidos, ignorando "avançado"', () => {
      expect(
        countAnsweredEssentialFields({ businessName: 'X', notes: 'Isso não deveria contar' }),
      ).toBe(1);
    });

    it('não conta campos só com espaço em branco', () => {
      expect(countAnsweredEssentialFields({ businessName: '   ' })).toBe(0);
    });

    it('conta todos os 8 quando todos preenchidos', () => {
      expect(
        countAnsweredEssentialFields({
          businessName: 'a',
          whatYouSell: 'a',
          pricing: 'a',
          hours: 'a',
          address: 'a',
          paymentMethods: 'a',
          differentiator: 'a',
          tone: 'a',
        }),
      ).toBe(8);
    });
  });
});
