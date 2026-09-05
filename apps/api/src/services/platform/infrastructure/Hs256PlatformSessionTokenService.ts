import { createHmac, timingSafeEqual } from 'crypto';

import {
  PlatformSessionClaims,
  PlatformSessionTokenService,
} from '../domain/PlatformSessionTokenService';

interface JwtPayload {
  platformUserId?: unknown;
  iat?: unknown;
  exp?: unknown;
}

/**
 * Crachá do `/admin` como JWT HS256 sobre o HMAC nativo do Node — mesma
 * técnica e os mesmos cuidados de `Hs256AccessTokenService` (assinatura
 * conferida em tempo constante, algoritmo FIXADO em HS256 para barrar
 * confusão de algoritmo, expiração sempre checada).
 *
 * É uma classe separada, e não a mesma com claims opcionais, de propósito: o
 * segredo é OUTRO e o formato do payload é OUTRO. Fundir as duas faria a
 * separação entre os dois porteiros depender de um `if`; separadas, ela é
 * estrutural — nem um crachá de tenant vira crachá de plataforma por engano,
 * nem um vazamento de um dos segredos alcança o outro lado.
 */
export class Hs256PlatformSessionTokenService implements PlatformSessionTokenService {
  constructor(
    private readonly secret: string,
    private readonly ttlSeconds: number,
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    if (!secret) {
      throw new Error('Hs256PlatformSessionTokenService: secret não pode ser vazio.');
    }
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('Hs256PlatformSessionTokenService: ttlSeconds deve ser um inteiro positivo.');
    }
  }

  issue(claims: PlatformSessionClaims): string {
    const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
    const iat = this.nowSeconds();
    const payload = encodeSegment({
      platformUserId: claims.platformUserId,
      iat,
      exp: iat + this.ttlSeconds,
    });
    const signingInput = `${header}.${payload}`;
    return `${signingInput}.${this.sign(signingInput)}`;
  }

  verify(token: string): PlatformSessionClaims | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;

    // Assinatura primeiro — nada do conteúdo é lido antes de confiar nela.
    if (!this.signatureMatches(`${headerB64}.${payloadB64}`, signature)) return null;

    let header: { alg?: unknown };
    let payload: JwtPayload;
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      return null;
    }

    if (header.alg !== 'HS256') return null;
    if (typeof payload.exp !== 'number' || payload.exp <= this.nowSeconds()) return null;
    if (typeof payload.platformUserId !== 'string' || payload.platformUserId.length === 0) {
      return null;
    }

    return { platformUserId: payload.platformUserId };
  }

  private sign(signingInput: string): string {
    return createHmac('sha256', this.secret).update(signingInput).digest('base64url');
  }

  private signatureMatches(signingInput: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(signingInput));
    const provided = Buffer.from(signature);
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  }
}

function encodeSegment(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
