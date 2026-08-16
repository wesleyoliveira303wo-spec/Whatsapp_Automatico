import { mapImportRows } from '../../../src/services/contacts/domain/contactImport';

describe('mapImportRows', () => {
  it('mapeia linhas válidas com nome e telefone normalizado', () => {
    const result = mapImportRows([
      ['Nome', 'Telefone'],
      ['Maria', '(21) 98888-7777'],
      ['João', '556588887777'],
    ]);

    expect(result.invalid).toEqual([]);
    expect(result.valid).toEqual([
      { rowNumber: 1, phoneE164: '5521988887777', name: 'Maria' },
      // Aplica a MESMA normalização (9º dígito) do resolver do WhatsApp.
      { rowNumber: 2, phoneE164: '5565988887777', name: 'João' },
    ]);
  });

  it('reconhece cabeçalhos alternativos e case-insensitive', () => {
    const result = mapImportRows([
      ['CLIENTE', 'CELULAR'],
      ['Maria', '5521988887777'],
    ]);

    expect(result.valid).toEqual([{ rowNumber: 1, phoneE164: '5521988887777', name: 'Maria' }]);
  });

  it('reconhece cabeçalho de telefone acentuado ("Número")', () => {
    const result = mapImportRows([
      ['Nome', 'Número'],
      ['Maria', '5521988887777'],
    ]);

    expect(result.valid).toHaveLength(1);
  });

  it('funciona sem coluna de nome — contato criado sem nome, sem regressão', () => {
    const result = mapImportRows([['Telefone'], ['5521988887777']]);

    expect(result.valid).toEqual([{ rowNumber: 1, phoneE164: '5521988887777', name: undefined }]);
  });

  it('rejeita TODAS as linhas quando não há coluna de telefone reconhecível', () => {
    const result = mapImportRows([
      ['Nome', 'Idade'],
      ['Maria', '30'],
      ['João', '25'],
    ]);

    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual([
      { rowNumber: 1, reason: 'missing_phone' },
      { rowNumber: 2, reason: 'missing_phone' },
    ]);
  });

  it('rejeita linha com telefone vazio', () => {
    const result = mapImportRows([
      ['Nome', 'Telefone'],
      ['Maria', ''],
    ]);

    expect(result.invalid).toEqual([{ rowNumber: 1, reason: 'missing_phone' }]);
  });

  it('rejeita linha com telefone que não normaliza (ex.: um LID)', () => {
    const result = mapImportRows([
      ['Nome', 'Telefone'],
      ['Maria', '225236742053984'],
    ]);

    expect(result.invalid).toEqual([
      { rowNumber: 1, reason: 'invalid_phone', rawPhone: '225236742053984' },
    ]);
  });

  // O caso central da deduplicação DENTRO do arquivo: a mesma pessoa
  // aparecendo duas vezes com formatos diferentes do 9º dígito precisa ser
  // reconhecida como duplicata, não como duas linhas válidas.
  it('marca ocorrências repetidas do MESMO telefone canônico como duplicate_in_file, mantendo a primeira', () => {
    const result = mapImportRows([
      ['Nome', 'Telefone'],
      ['Maria', '556588887777'], // sem o 9
      ['Maria Silva', '5565988887777'], // com o 9 — mesmo aparelho
    ]);

    expect(result.valid).toEqual([{ rowNumber: 1, phoneE164: '5565988887777', name: 'Maria' }]);
    expect(result.invalid).toEqual([
      { rowNumber: 2, reason: 'duplicate_in_file', rawPhone: '5565988887777' },
    ]);
  });

  it('devolve tudo vazio para um CSV sem nenhuma linha', () => {
    expect(mapImportRows([])).toEqual({ valid: [], invalid: [] });
  });

  it('trata um arquivo só com cabeçalho (nenhuma linha de dado)', () => {
    const result = mapImportRows([['Nome', 'Telefone']]);

    expect(result).toEqual({ valid: [], invalid: [] });
  });
});
