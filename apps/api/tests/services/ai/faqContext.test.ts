import { buildFaqContext } from '../../../src/services/ai/domain/faqContext';

describe('buildFaqContext (Cérebro da IA v3, Fase 2)', () => {
  it('devolve undefined quando não há nenhuma FAQ', () => {
    expect(buildFaqContext([])).toBeUndefined();
  });

  it('inclui o rótulo de seção e a instrução de uso', () => {
    const context = buildFaqContext([{ question: 'Qual o preço?', answer: 'R$ 990', category: null }]);

    expect(context).toContain('# Perguntas frequentes');
    expect(context).toContain('respostas já aprovadas pela empresa');
  });

  it('formata pergunta e resposta como P:/R:', () => {
    const context = buildFaqContext([
      { question: 'Vocês entregam?', answer: 'Sim, entregamos.', category: null },
    ]);

    expect(context).toContain('**P:** Vocês entregam?');
    expect(context).toContain('**R:** Sim, entregamos.');
  });

  it('anexa a categoria entre parênteses quando presente', () => {
    const context = buildFaqContext([{ question: 'Qual o preço?', answer: 'R$ 990', category: 'Preços' }]);

    expect(context).toContain('**P:** Qual o preço? (Preços)');
  });

  it('não anexa parênteses quando a categoria é null', () => {
    const context = buildFaqContext([{ question: 'Qual o preço?', answer: 'R$ 990', category: null }]);

    expect(context).toContain('**P:** Qual o preço?\n');
    expect(context).not.toContain('(');
  });

  it('inclui várias entradas, cada uma com seu par P/R', () => {
    const context = buildFaqContext([
      { question: 'P1', answer: 'R1', category: null },
      { question: 'P2', answer: 'R2', category: null },
    ]);

    expect(context).toContain('**P:** P1');
    expect(context).toContain('**R:** R1');
    expect(context).toContain('**P:** P2');
    expect(context).toContain('**R:** R2');
  });
});
