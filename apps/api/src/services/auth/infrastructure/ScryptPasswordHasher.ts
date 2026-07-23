import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { PasswordHasher } from '../domain/PasswordHasher';

/**
 * Implementacao de `PasswordHasher` com `scrypt` NATIVO do Node (Milestone 5,
 * Bloco M5B). scrypt e um KDF lento e memory-hard (recomendado para senha,
 * mesma familia de bcrypt/argon2), e ja vem no Node — zero dependencia nova,
 * zero compilacao nativa (mais robusto no nosso ambiente; a troca por
 * bcrypt/argon2 no futuro e so uma nova classe atras do mesmo port).
 *
 * Formato do hash guardado (auto-descritivo, para sobreviver a mudanca de
 * parametros no futuro): `scrypt:<N>:<r>:<p>:<saltHex>:<hashHex>`. O `verify`
 * le os parametros do proprio hash — hashes antigos continuam validaveis mesmo
 * se os defaults mudarem.
 *
 * Comparacao final com `timingSafeEqual` (tempo constante) — nao vaza, pelo
 * tempo de resposta, o quao "perto" a senha errada chegou.
 */
const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const KEY_LENGTH = 64;

export class ScryptPasswordHasher implements PasswordHasher {
  hash(plainPassword: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const salt = randomBytes(16);
      scrypt(plainPassword, salt, KEY_LENGTH, { N: DEFAULT_N, r: DEFAULT_R, p: DEFAULT_P }, (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(`scrypt:${DEFAULT_N}:${DEFAULT_R}:${DEFAULT_P}:${salt.toString('hex')}:${derivedKey.toString('hex')}`);
      });
    });
  }

  verify(plainPassword: string, storedHash: string): Promise<boolean> {
    return new Promise((resolve) => {
      const parts = storedHash.split(':');
      if (parts.length !== 6 || parts[0] !== 'scrypt') {
        resolve(false);
        return;
      }
      const N = Number(parts[1]);
      const r = Number(parts[2]);
      const p = Number(parts[3]);
      let salt: Buffer;
      let expected: Buffer;
      try {
        salt = Buffer.from(parts[4], 'hex');
        expected = Buffer.from(parts[5], 'hex');
      } catch {
        resolve(false);
        return;
      }
      if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || expected.length === 0) {
        resolve(false);
        return;
      }
      scrypt(plainPassword, salt, expected.length, { N, r, p }, (err, derivedKey) => {
        if (err) {
          resolve(false);
          return;
        }
        resolve(derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected));
      });
    });
  }
}
