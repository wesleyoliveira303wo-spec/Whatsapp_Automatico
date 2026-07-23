import { createHmac, timingSafeEqual } from 'crypto';

import { ApiKeyHasher } from '../domain/ApiKeyHasher';

const ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';

/**
 * Implementação de `ApiKeyHasher` com HMAC-SHA256 e pepper fixo — ver
 * justificativa completa do algoritmo em `ApiKeyHasher.ts`.
 *
 * O pepper é recebido via construtor, nunca lido de `process.env`
 * diretamente aqui — mesma separação já usada em `AesGcmCipher`: quem
 * compõe a aplicação decide de onde o segredo vem (variável de ambiente,
 * secret manager, etc.), esta classe só sabe usá-lo.
 */
export class HmacSha256ApiKeyHasher implements ApiKeyHasher {
  private readonly pepper: string;

  constructor(pepper: string) {
    if (!pepper) {
      throw new Error(
        'HmacSha256ApiKeyHasher: pepper vazio ou ausente. Configure a variável de ambiente ' +
          'API_KEY_PEPPER (ver .env.example) — gere um valor com: openssl rand -base64 32',
      );
    }
    this.pepper = pepper;
  }

  hash(plainApiKey: string): string {
    return createHmac(ALGORITHM, this.pepper).update(plainApiKey, 'utf8').digest(DIGEST_ENCODING);
  }

  /**
   * Compara em tempo constante (`timingSafeEqual`) — nunca `===` direto (ver
   * justificativa em `ApiKeyHasher.verify`). `timingSafeEqual` exige buffers
   * do MESMO tamanho; um hash armazenado corrompido, truncado ou de outro
   * algoritmo teria tamanho diferente do hash recém-calculado — retornar
   * `false` nesse caso é seguro e correto, uma falha de autenticação nunca
   * deve lançar exceção.
   */
  verify(plainApiKey: string, storedHash: string): boolean {
    const computedHash = this.hash(plainApiKey);

    const computedBuffer = Buffer.from(computedHash, DIGEST_ENCODING);
    const storedBuffer = Buffer.from(storedHash, DIGEST_ENCODING);

    if (computedBuffer.length !== storedBuffer.length) {
      return false;
    }

    return timingSafeEqual(computedBuffer, storedBuffer);
  }
}
