import { splitReplyIntoParagraphs } from '../../../src/services/ai/domain/messageSplitting';

describe('splitReplyIntoParagraphs', () => {
  it('devolve o texto inteiro como único item quando não há quebra de linha', () => {
    expect(splitReplyIntoParagraphs('Olá, tudo bem?')).toEqual(['Olá, tudo bem?']);
  });

  it('divide em vários itens numa quebra de linha simples (formato que a IA já usa)', () => {
    expect(splitReplyIntoParagraphs('Primeira parte.\nSegunda parte.\nTerceira parte.')).toEqual([
      'Primeira parte.',
      'Segunda parte.',
      'Terceira parte.',
    ]);
  });

  it('trata uma sequência de várias quebras de linha (parágrafo em branco) como um único separador', () => {
    expect(splitReplyIntoParagraphs('Primeira parte.\n\n\nSegunda parte.')).toEqual([
      'Primeira parte.',
      'Segunda parte.',
    ]);
  });

  it('remove espaço em branco nas bordas de cada parágrafo', () => {
    expect(splitReplyIntoParagraphs('  Primeira parte.  \n  Segunda parte.  ')).toEqual([
      'Primeira parte.',
      'Segunda parte.',
    ]);
  });

  it('descarta linhas vazias/só-espaço entre parágrafos reais (ex.: "\\n \\n")', () => {
    expect(splitReplyIntoParagraphs('Primeira parte.\n \nSegunda parte.')).toEqual([
      'Primeira parte.',
      'Segunda parte.',
    ]);
  });

  it('normaliza quebras de linha estilo Windows (\\r\\n)', () => {
    expect(splitReplyIntoParagraphs('Primeira parte.\r\nSegunda parte.')).toEqual([
      'Primeira parte.',
      'Segunda parte.',
    ]);
  });

  it('nunca devolve lista vazia — texto só com espaço/quebras vira um único item (trim, possivelmente vazio)', () => {
    expect(splitReplyIntoParagraphs('   \n\n   ')).toEqual(['']);
  });
});
