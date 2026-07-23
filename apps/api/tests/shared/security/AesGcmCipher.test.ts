import { randomBytes } from 'crypto';

import { AesGcmCipher } from '../../../src/shared/security/infrastructure/AesGcmCipher';

function validMasterKey(): string {
  return randomBytes(32).toString('base64');
}

describe('AesGcmCipher', () => {
  it('deve encriptar e decriptar retornando o texto original', () => {
    const cipher = new AesGcmCipher(validMasterKey());

    const cipherText = cipher.encrypt('tenant-1', 'segredo-do-baileys');
    const plainText = cipher.decrypt('tenant-1', cipherText);

    expect(plainText).toBe('segredo-do-baileys');
  });

  it('não deve reutilizar o mesmo texto cifrado para a mesma entrada (IV aleatório)', () => {
    const cipher = new AesGcmCipher(validMasterKey());

    const first = cipher.encrypt('tenant-1', 'mesmo-segredo');
    const second = cipher.encrypt('tenant-1', 'mesmo-segredo');

    expect(first).not.toBe(second);
    expect(cipher.decrypt('tenant-1', first)).toBe('mesmo-segredo');
    expect(cipher.decrypt('tenant-1', second)).toBe('mesmo-segredo');
  });

  it('deve derivar chaves diferentes por tenant (isolamento multi-tenant)', () => {
    const cipher = new AesGcmCipher(validMasterKey());

    const cipherText = cipher.encrypt('tenant-1', 'segredo-do-tenant-1');

    expect(() => cipher.decrypt('tenant-2', cipherText)).toThrow();
  });

  it('deve rejeitar texto cifrado adulterado (falha de autenticação do GCM)', () => {
    const cipher = new AesGcmCipher(validMasterKey());

    const cipherText = cipher.encrypt('tenant-1', 'segredo-integro');
    const tampered = Buffer.from(cipherText, 'base64');
    tampered[tampered.length - 1] ^= 0xff; // corrompe o último byte do ciphertext

    expect(() => cipher.decrypt('tenant-1', tampered.toString('base64'))).toThrow();
  });

  it('deve rejeitar chave mestra com tamanho inválido', () => {
    const invalidKey = randomBytes(16).toString('base64'); // 16 bytes, não 32

    expect(() => new AesGcmCipher(invalidKey)).toThrow(/32 bytes/);
  });
});
