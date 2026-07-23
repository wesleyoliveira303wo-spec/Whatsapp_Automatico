import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // recomendado pelo NIST SP 800-38D para GCM
const AUTH_TAG_LENGTH_BYTES = 16;
const KEY_LENGTH_BYTES = 32; // AES-256

/**
 * Cifra AES-256-GCM para o conteúdo do cookie de sessão do Dashboard (M2,
 * Fase 3 — BFF-1). Formato do texto cifrado (base64): `iv (12 bytes) ||
 * authTag (16 bytes) || ciphertext` — MESMO formato já documentado em
 * `apps/api/src/shared/security/infrastructure/AesGcmCipher.ts`.
 *
 * Deliberadamente uma implementação PRÓPRIA neste pacote (`apps/dashboard`),
 * não um import de `AesGcmCipher` de `apps/api`: os dois são apps
 * separados/deployáveis independentemente (processos Node distintos, cada
 * um com seu próprio `package.json`/build) — importar através da fronteira
 * de pacote criaria acoplamento estrutural entre um app Next.js e os
 * internals de um app Express, exatamente o tipo de acoplamento indevido
 * que as camadas do projeto evitam (ver CLAUDE.md, Arquitetura Geral).
 *
 * Sem derivação HKDF por tenant (diferente de `AesGcmCipher`): aqui não há
 * múltiplos registros armazenados por tenant precisando de isolamento de
 * chave entre si — é um único cookie efêmero por sessão de navegador,
 * cifrado/decifrado com a MESMA chave mestra em ambas as pontas. HKDF
 * existe em `AesGcmCipher` para isolar N segredos persistidos de N tenants
 * entre si; esse problema não existe aqui.
 *
 * Chave: `DASHBOARD_SESSION_SECRET` (32 bytes após decode base64, gerar com
 * `openssl rand -base64 32` — mesma convenção de `WHATSAPP_CREDENTIALS_MASTER_KEY`
 * em `apps/api`). Deliberadamente uma chave SEPARADA (não a mesma
 * `WHATSAPP_CREDENTIALS_MASTER_KEY`): as duas chaves protegem dados de
 * natureza diferente (credenciais do WhatsApp vs. sessão de login do
 * Dashboard) — reutilizar uma única chave mestra entre dois domínios de
 * segurança diferentes é o tipo de acoplamento que dificulta rotação
 * futura (rotacionar uma forçaria invalidar a outra também, sem motivo).
 */
export function encryptCookiePayload(secretBase64: string, plainText: string): string {
  const key = decodeKey(secretBase64);
  const iv = randomBytes(IV_LENGTH_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Retorna `null` (em vez de lançar) quando o cookie está ausente, corrompido ou foi cifrado com uma chave diferente — chamadores tratam isso como "sem sessão válida", nunca como um erro 500. */
export function decryptCookiePayload(secretBase64: string, cipherTextBase64: string): string | null {
  try {
    const key = decodeKey(secretBase64);
    const raw = Buffer.from(cipherTextBase64, 'base64');

    const iv = raw.subarray(0, IV_LENGTH_BYTES);
    const authTag = raw.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
    const ciphertext = raw.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const plainText = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plainText.toString('utf8');
  } catch {
    return null;
  }
}

function decodeKey(secretBase64: string): Buffer {
  const key = Buffer.from(secretBase64, 'base64');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `cookieCipher: DASHBOARD_SESSION_SECRET inválida — esperado ${KEY_LENGTH_BYTES} bytes após decode base64, recebido ${key.length}. ` +
        'Gere uma chave com `openssl rand -base64 32` e configure-a via variável de ambiente (nunca hardcoded).',
    );
  }
  return key;
}
