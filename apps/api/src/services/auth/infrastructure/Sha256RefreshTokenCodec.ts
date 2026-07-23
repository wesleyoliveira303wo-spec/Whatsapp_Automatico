import { createHash, randomBytes } from 'crypto';
import { GeneratedRefreshToken, RefreshTokenCodec } from '../domain/RefreshTokenCodec';

/**
 * Implementacao de `RefreshTokenCodec` com utilitarios NATIVOS do Node
 * (Milestone 5, Bloco M5B): `randomBytes` para gerar 32 bytes de aleatoriedade
 * (alta entropia) e `sha256` para o hash guardado. Zero dependencia.
 */
export class Sha256RefreshTokenCodec implements RefreshTokenCodec {
  generate(): GeneratedRefreshToken {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
