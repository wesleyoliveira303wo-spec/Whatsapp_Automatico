import { appendFaqEntry, appendToProfileContent } from '../../lib/aiProfileFaq';

describe('aiProfileFaq — appendFaqEntry (Cérebro da IA, cadastrar pergunta não respondida)', () => {
  it('anexa a pergunta/resposta ao final de um texto já existente, separado por linha em branco', () => {
    const result = appendFaqEntry(
      '- Nome: Loja X',
      'Vocês entregam aos domingos?',
      'Não, só de terça a sábado.',
    );
    expect(result).toBe(
      '- Nome: Loja X\n\n**P:** Vocês entregam aos domingos?\n**R:** Não, só de terça a sábado.',
    );
  });

  it('quando o texto atual está vazio, não deixa linhas em branco no início', () => {
    const result = appendFaqEntry('', 'Tem estacionamento?', 'Sim, na rua ao lado.');
    expect(result).toBe('**P:** Tem estacionamento?\n**R:** Sim, na rua ao lado.');
  });

  it('quando o texto atual é só espaços/quebras de linha, trata como vazio', () => {
    const result = appendFaqEntry('   \n  ', 'Aceita Pix?', 'Sim.');
    expect(result).toBe('**P:** Aceita Pix?\n**R:** Sim.');
  });

  it('faz trim da pergunta e da resposta', () => {
    const result = appendFaqEntry('Texto', '  Pergunta com espaço  ', '  Resposta com espaço  ');
    expect(result).toBe('Texto\n\n**P:** Pergunta com espaço\n**R:** Resposta com espaço');
  });

  it('remove espaço em excesso ao final do texto atual antes de anexar', () => {
    const result = appendFaqEntry('Texto existente\n\n\n', 'P?', 'R.');
    expect(result).toBe('Texto existente\n\n**P:** P?\n**R:** R.');
  });
});

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
