import { HmacSha256ApiKeyHasher } from '../../../src/shared/security/infrastructure/HmacSha256ApiKeyHasher';

describe('HmacSha256ApiKeyHasher', () => {
  it('deve ser determinístico: mesma chave + mesmo pepper geram sempre o mesmo hash', () => {
    const hasher = new HmacSha256ApiKeyHasher('pepper-de-teste');

    const first = hasher.hash('minha-api-key');
    const second = hasher.hash('minha-api-key');

    expect(first).toBe(second);
  });

  it('deve gerar hashes diferentes para peppers diferentes (mesma chave em texto plano)', () => {
    const hasherA = new HmacSha256ApiKeyHasher('pepper-a');
    const hasherB = new HmacSha256ApiKeyHasher('pepper-b');

    expect(hasherA.hash('mesma-api-key')).not.toBe(hasherB.hash('mesma-api-key'));
  });

  it('verify() deve retornar true para o par correto de chave e hash', () => {
    const hasher = new HmacSha256ApiKeyHasher('pepper-de-teste');
    const stored = hasher.hash('minha-api-key');

    expect(hasher.verify('minha-api-key', stored)).toBe(true);
  });

  it('verify() deve retornar false quando a chave apresentada está errada', () => {
    const hasher = new HmacSha256ApiKeyHasher('pepper-de-teste');
    const stored = hasher.hash('minha-api-key');

    expect(hasher.verify('chave-errada', stored)).toBe(false);
  });

  it('verify() deve retornar false (sem lançar) para um hash armazenado de tamanho diferente', () => {
    const hasher = new HmacSha256ApiKeyHasher('pepper-de-teste');

    expect(hasher.verify('minha-api-key', 'hash-curto-e-invalido')).toBe(false);
  });

  it('deve rejeitar pepper vazio na construção', () => {
    expect(() => new HmacSha256ApiKeyHasher('')).toThrow(/API_KEY_PEPPER/);
  });
});
