import { parseCsv } from '../../../src/services/contacts/domain/csvParsing';

describe('parseCsv', () => {
  it('parseia CSV simples delimitado por vírgula', () => {
    const result = parseCsv('nome,telefone\nMaria,5521988887777\nJoão,5521977776666');

    expect(result).toEqual([
      ['nome', 'telefone'],
      ['Maria', '5521988887777'],
      ['João', '5521977776666'],
    ]);
  });

  // O Excel em pt-BR exporta CSV com ponto e vírgula, porque a vírgula já é
  // o separador decimal daquele locale — sem detecção, cada linha viraria
  // uma coluna só.
  it('detecta e usa ponto e vírgula (padrão do Excel em pt-BR)', () => {
    const result = parseCsv('nome;telefone\nMaria;5521988887777');

    expect(result).toEqual([
      ['nome', 'telefone'],
      ['Maria', '5521988887777'],
    ]);
  });

  it('trata campos entre aspas, inclusive com o delimitador dentro do campo', () => {
    const result = parseCsv('nome,endereco\n"Maria Silva","Rua A, 123"');

    expect(result).toEqual([
      ['nome', 'endereco'],
      ['Maria Silva', 'Rua A, 123'],
    ]);
  });

  it('trata aspas escapadas por duplicação, dentro de um campo entre aspas', () => {
    const result = parseCsv('nome\n"Loja ""A"" e ""B"""');

    expect(result).toEqual([['nome'], ['Loja "A" e "B"']]);
  });

  it('trata quebra de linha DENTRO de um campo entre aspas', () => {
    const result = parseCsv('nome,obs\nMaria,"linha 1\nlinha 2"');

    expect(result).toEqual([
      ['nome', 'obs'],
      ['Maria', 'linha 1\nlinha 2'],
    ]);
  });

  it('aceita \\r\\n (quebra de linha do Windows/Excel)', () => {
    const result = parseCsv('nome,telefone\r\nMaria,5521988887777\r\n');

    expect(result).toEqual([
      ['nome', 'telefone'],
      ['Maria', '5521988887777'],
    ]);
  });

  it('funciona sem quebra de linha final', () => {
    const result = parseCsv('nome,telefone\nMaria,5521988887777');

    expect(result[result.length - 1]).toEqual(['Maria', '5521988887777']);
  });

  it('ignora linha completamente em branco (ex.: fim do arquivo)', () => {
    const result = parseCsv('nome,telefone\nMaria,5521988887777\n\n');

    expect(result).toHaveLength(2);
  });

  it('devolve array vazio para entrada vazia ou só espaços', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('   \n  \n')).toEqual([]);
  });
});
