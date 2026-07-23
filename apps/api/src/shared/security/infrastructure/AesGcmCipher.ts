import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

import { Cipher } from '../domain/Cipher';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // recomendado pelo NIST SP 800-38D para GCM
const AUTH_TAG_LENGTH_BYTES = 16;
const KEY_LENGTH_BYTES = 32; // AES-256
const HKDF_HASH = 'sha256';
const HKDF_INFO_PREFIX = 'whatsapp-automatico:tenant-credentials:v1:';

/**
 * Implementação de `Cipher` com AES-256-GCM (autenticado) e derivação de
 * chave por tenant via HKDF (RFC 5869) a partir de uma única chave mestra.
 *
 * Formato do texto cifrado (base64): `iv (12 bytes) || authTag (16 bytes) ||
 * ciphertext`. Cada valor carrega seu próprio IV aleatório — nunca reutilizar
 * um IV com a mesma chave é a invariante de segurança mais importante do
 * GCM; `randomBytes` por chamada garante isso.
 *
 * Encriptação em nível de aplicação (não `pgcrypto` do Postgres), por
 * portabilidade e testabilidade — mesma decisão já registrada para outros
 * dados sensíveis do projeto.
 */
export class AesGcmCipher implements Cipher {
  private readonly masterKey: Buffer;

  constructor(masterKeyBase64: string) {
    const key = Buffer.from(masterKeyBase64, 'base64');
    if (key.length !== KEY_LENGTH_BYTES) {
      throw new Error(
        `AesGcmCipher: chave mestra inválida — esperado ${KEY_LENGTH_BYTES} bytes após decode base64, recebido ${key.length}. ` +
          'Gere uma chave com `openssl rand -base64 32` e configure-a via variável de ambiente (nunca hardcoded).',
      );
    }
    this.masterKey = key;
  }

  encrypt(tenantId: string, plainText: string): string {
    const tenantKey = this.deriveTenantKey(tenantId);
    const iv = randomBytes(IV_LENGTH_BYTES);

    const cipher = createCipheriv(ALGORITHM, tenantKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  decrypt(tenantId: string, cipherText: string): string {
    const tenantKey = this.deriveTenantKey(tenantId);
    const raw = Buffer.from(cipherText, 'base64');

    const iv = raw.subarray(0, IV_LENGTH_BYTES);
    const authTag = raw.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
    const ciphertext = raw.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

    const decipher = createDecipheriv(ALGORITHM, tenantKey, iv);
    decipher.setAuthTag(authTag);

    const plainText = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plainText.toString('utf8');
  }

  /**
   * Deriva deterministicamente uma chave de 256 bits exclusiva para
   * `tenantId`. Sendo determinística (mesma entrada -> mesma chave), não
   * precisa ser armazenada — só recalculada a partir da chave mestra sempre
   * que necessário.
   *
   * Trade-off documentado: como todas as chaves derivam de uma única chave
   * mestra, rotacionar a chave mestra invalida todas de uma vez (não há
   * isolamento de rotação por tenant). Uma implementação futura baseada em
   * KMS real por tenant resolveria isso sem exigir mudança neste port.
   */
  private deriveTenantKey(tenantId: string): Buffer {
    const info = `${HKDF_INFO_PREFIX}${tenantId}`;
    const derived = hkdfSync(HKDF_HASH, this.masterKey, Buffer.alloc(0), info, KEY_LENGTH_BYTES);
    return Buffer.from(derived);
  }
}
