import { encryptCookiePayload, decryptCookiePayload } from '../../lib/cookieCipher';

const VALID_KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');

describe('cookieCipher', () => {
  it('encrypt -> decrypt com a mesma chave devolve o texto original', () => {
    const cipherText = encryptCookiePayload(VALID_KEY, '{"tenantId":"t1","apiKey":"chave"}');

    expect(decryptCookiePayload(VALID_KEY, cipherText)).toBe('{"tenantId":"t1","apiKey":"chave"}');
  });

  it('produz um ciphertext diferente a cada chamada (IV aleatório), mesmo para o mesmo texto', () => {
    const a = encryptCookiePayload(VALID_KEY, 'mesmo texto');
    const b = encryptCookiePayload(VALID_KEY, 'mesmo texto');

    expect(a).not.toBe(b);
  });

  it('decrypt com a chave errada devolve null (nunca lança)', () => {
    const cipherText = encryptCookiePayload(VALID_KEY, 'segredo');

    expect(decryptCookiePayload(OTHER_KEY, cipherText)).toBeNull();
  });

  it('decrypt de um valor corrompido/não-base64-válido devolve null', () => {
    expect(decryptCookiePayload(VALID_KEY, 'isto-nao-e-um-ciphertext-valido')).toBeNull();
  });

  it('decrypt de um ciphertext adulterado (1 byte alterado) devolve null — GCM detecta a violação de integridade', () => {
    const cipherText = encryptCookiePayload(VALID_KEY, 'segredo');
    const raw = Buffer.from(cipherText, 'base64');
    raw[raw.length - 1] ^= 0xff; // inverte o último byte do ciphertext
    const tampered = raw.toString('base64');

    expect(decryptCookiePayload(VALID_KEY, tampered)).toBeNull();
  });

  it('encrypt com chave de tamanho errado lança um erro explicativo', () => {
    expect(() => encryptCookiePayload('chave-muito-curta', 'texto')).toThrow(/32 bytes/);
  });
});
