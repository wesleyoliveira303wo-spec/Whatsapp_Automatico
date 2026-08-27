import { createHmac, timingSafeEqual } from 'crypto';
import { AccessTokenClaims, AccessTokenService } from '../domain/AccessTokenService';
import { UserRole } from '../domain/entities/User';

/**
 * Implementacao de `AccessTokenService` como um JWT HS256 usando o HMAC-SHA256
 * NATIVO do Node (Milestone 5, Bloco M5B). Zero dependencia: o Node faz a
 * criptografia de verdade (HMAC); aqui so montamos/conferimos o envelope
 * (base64url) com cuidado. Trocavel por uma lib de JWT atras do mesmo port.
 *
 * Cuidados de seguranca embutidos:
 * - Assinatura conferida em TEMPO CONSTANTE (`timingSafeEqual`).
 * - Algoritmo FIXADO em HS256 no `verify` — rejeita tokens com outro `alg`
 *   (defesa contra o ataque classico de "confusao de algoritmo", ex.: `none`).
 * - Expiracao (`exp`) sempre conferida.
 * O `clock` e injetavel para testar expiracao de forma deterministica.
 */
const VALID_ROLES: ReadonlySet<string> = new Set([
  'owner',
  'administrator',
  'manager',
  'operator',
  'read_only',
]);

interface JwtPayload {
  userId?: unknown;
  tenantId?: unknown;
  role?: unknown;
  mustChangePassword?: unknown;
  iat?: unknown;
  exp?: unknown;
}

export class Hs256AccessTokenService implements AccessTokenService {
  constructor(
    private readonly secret: string,
    private readonly ttlSeconds: number,
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    if (!secret) {
      throw new Error('Hs256AccessTokenService: secret nao pode ser vazio.');
    }
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('Hs256AccessTokenService: ttlSeconds deve ser um inteiro positivo.');
    }
  }

  issue(claims: AccessTokenClaims): string {
    const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
    const iat = this.nowSeconds();
    const payload = encodeSegment({
      userId: claims.userId,
      tenantId: claims.tenantId,
      role: claims.role,
      ...(claims.mustChangePassword ? { mustChangePassword: true } : {}),
      iat,
      exp: iat + this.ttlSeconds,
    });
    const signingInput = `${header}.${payload}`;
    return `${signingInput}.${this.sign(signingInput)}`;
  }

  verify(token: string): AccessTokenClaims | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const [headerB64, payloadB64, signature] = parts;

    // 1. Assinatura (tempo constante) — antes de confiar em qualquer conteudo.
    if (!this.signatureMatches(`${headerB64}.${payloadB64}`, signature)) {
      return null;
    }

    // 2. Decodifica header/payload.
    let header: { alg?: unknown };
    let payload: JwtPayload;
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      return null;
    }

    // 3. Algoritmo fixado (defesa contra confusao de algoritmo).
    if (header.alg !== 'HS256') {
      return null;
    }

    // 4. Expiracao.
    if (typeof payload.exp !== 'number' || payload.exp <= this.nowSeconds()) {
      return null;
    }

    // 5. Formato dos claims.
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.tenantId !== 'string' ||
      typeof payload.role !== 'string'
    ) {
      return null;
    }
    if (!VALID_ROLES.has(payload.role)) {
      return null;
    }

    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role as UserRole,
      mustChangePassword: payload.mustChangePassword === true,
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
