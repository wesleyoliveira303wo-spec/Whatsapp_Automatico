import { createHmac, timingSafeEqual } from 'crypto';

import {
  SupportAccessClaims,
  SupportAccessTokenService,
} from '../domain/SupportAccessTokenService';

/**
 * `SupportAccessTokenService` como JWT HS256 nativo (mesma técnica de
 * `Hs256AccessTokenService`/`Hs256PlatformSessionTokenService`): zero
 * dependência, assinatura em tempo constante, `alg` fixado em HS256 (defesa
 * contra confusão de algoritmo), `exp` sempre conferido. Classe SEPARADA das
 * outras duas de propósito — payload incompatível, segredo distinto.
 */
interface JwtPayload {
  supportAccessId?: unknown;
  tenantId?: unknown;
  platformUserId?: unknown;
  iat?: unknown;
  exp?: unknown;
}

export class Hs256SupportAccessTokenService implements SupportAccessTokenService {
  constructor(
    private readonly secret: string,
    private readonly ttlSeconds: number,
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    if (!secret) {
      throw new Error('Hs256SupportAccessTokenService: secret não pode ser vazio.');
    }
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('Hs256SupportAccessTokenService: ttlSeconds deve ser um inteiro positivo.');
    }
  }

  issue(claims: SupportAccessClaims): string {
    const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
    const iat = this.nowSeconds();
    const payload = encodeSegment({
      supportAccessId: claims.supportAccessId,
      tenantId: claims.tenantId,
      platformUserId: claims.platformUserId,
      iat,
      exp: iat + this.ttlSeconds,
    });
    const signingInput = `${header}.${payload}`;
    return `${signingInput}.${this.sign(signingInput)}`;
  }

  verify(token: string): SupportAccessClaims | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const [headerB64, payloadB64, signature] = parts;
    if (!this.signatureMatches(`${headerB64}.${payloadB64}`, signature)) {
      return null;
    }
    let header: { alg?: unknown };
    let payload: JwtPayload;
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (header.alg !== 'HS256') {
      return null;
    }
    if (typeof payload.exp !== 'number' || payload.exp <= this.nowSeconds()) {
      return null;
    }
    if (
      typeof payload.supportAccessId !== 'string' ||
      typeof payload.tenantId !== 'string' ||
      typeof payload.platformUserId !== 'string' ||
      payload.supportAccessId === '' ||
      payload.tenantId === '' ||
      payload.platformUserId === ''
    ) {
      return null;
    }
    return {
      supportAccessId: payload.supportAccessId,
      tenantId: payload.tenantId,
      platformUserId: payload.platformUserId,
    };
  }

  private sign(signingInput: string): string {
    return createHmac('sha256', this.secret).update(signingInput).digest('base64url');
  }

  private signatureMatches(signingInput: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(signingInput));
    const provided = Buffer.from(signature);
    if (expected.length !== provided.length) {
      return false;
    }
    return timingSafeEqual(expected, provided);
  }
}

function encodeSegment(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
