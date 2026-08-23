import {
  parseRecipientsCsv,
  parseManualPhoneList,
} from '../../../../src/services/campaigns/domain/policies/recipientSources';

describe('parseRecipientsCsv (Reorganização Contatos/Campanhas, 2026-08-17)', () => {
  it('extrai telefone e nome de um CSV válido', () => {
    const csv = 'nome,telefone\nMaria,65988887777\nJoão,(65) 8888-7776';
    const result = parseRecipientsCsv(csv);
    expect(result.totalRows).toBe(2);
    expect(result.recipients).toEqual([
      { rawPhone: '5565988887777', name: 'Maria' },
      { rawPhone: '5565988887776', name: 'João' },
    ]);
    expect(result.invalid).toEqual([]);
  });

  it('reporta linhas inválidas sem derrubar as válidas', () => {
    const csv = 'telefone\n123\n65988887777';
    const result = parseRecipientsCsv(csv);
    expect(result.recipients).toEqual([{ rawPhone: '5565988887777', name: undefined }]);
    expect(result.invalid).toEqual([{ rowNumber: 1, reason: 'invalid_phone', rawPhone: '123' }]);
  });

  it('sem coluna de telefone reconhecível: nada é importado', () => {
    const csv = 'coluna_qualquer\nabc';
    const result = parseRecipientsCsv(csv);
    expect(result.recipients).toEqual([]);
    expect(result.invalid[0].reason).toBe('missing_phone');
  });
});

describe('parseManualPhoneList', () => {
  it('aceita um telefone por linha, com ou sem nome', () => {
    const result = parseManualPhoneList('65988887777\n65988887776, Maria\n65988887775; João');
    expect(result.recipients).toEqual([
      { rawPhone: '5565988887777', name: undefined },
      { rawPhone: '5565988887776', name: 'Maria' },
      { rawPhone: '5565988887775', name: 'João' },
    ]);
    expect(result.invalidLines).toEqual([]);
  });

  it('ignora linhas em branco e deduplica mantendo a primeira ocorrência', () => {
    const result = parseManualPhoneList('65988887777, Maria\n\n65988887777, Outra Maria');
    expect(result.recipients).toEqual([{ rawPhone: '5565988887777', name: 'Maria' }]);
  });

  it('devolve o texto original de linhas que não normalizam', () => {
    const result = parseManualPhoneList('abc123\n11');
    expect(result.recipients).toEqual([]);
    expect(result.invalidLines).toEqual(['abc123', '11']);
  });
});
