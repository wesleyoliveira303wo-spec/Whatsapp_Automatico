import { ApiKeyHasher } from '../../../src/shared/security/domain/ApiKeyHasher';

/**
 * Fake de `ApiKeyHasher` — determinístico, sem HMAC/crypto real, mas com a
 * MESMA semântica de verificação do Real: `verify()` rejeita de verdade
 * quando o texto apresentado não corresponde ao hash armazenado (nunca
 * retorna `true` incondicionalmente). Um Fake mais tolerante que o Real
 * mascararia bugs reais de comparação nos consumidores (middleware de
 * autenticação, script de emissão) — mesmo princípio de fidelidade Fake↔Real
 * já aplicado a outros Fakes deste projeto.
 */
export class FakeApiKeyHasher implements ApiKeyHasher {
  hash(plainApiKey: string): string {
    return `fake-hash:${plainApiKey}`;
  }

  verify(plainApiKey: string, storedHash: string): boolean {
    return this.hash(plainApiKey) === storedHash;
  }
}
