import { parseJsonSafely } from '../../lib/parseJsonSafely';

describe('parseJsonSafely (M2, Fase 4)', () => {
  it('decodifica um JSON válido', () => {
    expect(parseJsonSafely<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });

  it('devolve null para um JSON malformado, sem lançar', () => {
    expect(parseJsonSafely('{não é json')).toBeNull();
  });

  it('devolve null para string vazia', () => {
    expect(parseJsonSafely('')).toBeNull();
  });
});
