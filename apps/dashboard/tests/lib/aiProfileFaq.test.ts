import { appendToProfileContent } from '../../lib/aiProfileFaq';

describe('aiProfileFaq — appendToProfileContent (correção 2026-07-30, ADR #87)', () => {
  it('anexa ao final de um texto existente, separado por linha em branco', () => {
    expect(appendToProfileContent('- Nome: Loja X', '- Horário: 9h às 18h')).toBe(
      '- Nome: Loja X\n\n- Horário: 9h às 18h',
    );
  });

  it('quando o texto atual está vazio, devolve só a adição, sem linha em branco no início', () => {
    expect(appendToProfileContent('', '- Nome: Loja X')).toBe('- Nome: Loja X');
  });

  it('quando o texto atual é só espaço, trata como vazio', () => {
    expect(appendToProfileContent('   \n  ', '- Nome: Loja X')).toBe('- Nome: Loja X');
  });

  it('faz trim da adição', () => {
    expect(appendToProfileContent('Texto', '  - Novo campo  ')).toBe('Texto\n\n- Novo campo');
  });

  it('quando a adição é vazia/só espaço, devolve o texto atual sem mudança (nem duas chamadas seguidas geram lixo)', () => {
    expect(appendToProfileContent('Texto existente', '   ')).toBe('Texto existente');
  });

  it('chamado duas vezes seguidas ACUMULA (nunca sobrescreve a primeira adição)', () => {
    const afterFirst = appendToProfileContent('- Nome: Loja X', '- Horário: 9h às 18h');
    const afterSecond = appendToProfileContent(afterFirst, '- Endereço: Rua A, 123');
    expect(afterSecond).toBe('- Nome: Loja X\n\n- Horário: 9h às 18h\n\n- Endereço: Rua A, 123');
  });
});
