import { RefreshTokenRepository } from '../domain/repositories/RefreshTokenRepository';
import { RefreshTokenCodec } from '../domain/RefreshTokenCodec';

/** Metadados opcionais de origem da sessao (so diagnostico/auditoria). */
export interface RefreshTokenMeta {
  userAgent?: string;
  ip?: string;
}

/**
 * Resultado de `rotate` — uniao discriminada (nao excecao): uma tentativa de
 * renovar com token invalido e um RESULTADO normal, nao um erro de programa.
 * O `AuthService` (M5C) mapeia cada caso para o HTTP certo.
 */
export type RotateRefreshTokenResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'reuse_detected' };

/**
 * Janela de tolerância a REUSO CONCORRENTE (2026-09-12) — ver achado abaixo.
 * Curta o bastante para nunca abrir espaço real de exploração (um token
 * roubado e usado minutos/horas depois continua caindo em `reuse_detected`
 * normalmente); longa o bastante para cobrir a diferença de latência entre
 * duas requisições HTTP disparadas juntas pela mesma aba do navegador.
 */
export const REUSE_GRACE_MS = 10_000;

/**
 * Logica de ciclo de vida do refresh token (o "cartao de ponto") — Milestone
 * 5, Bloco M5B (D53/D58). Application: orquestra o `RefreshTokenRepository`
 * (M5A) + o `RefreshTokenCodec`. Nenhuma dependencia de HTTP/Prisma aqui —
 * testavel com Fakes.
 *
 * Regras:
 * - `issue`: gera token novo, guarda so o HASH + validade.
 * - `rotate` (ROTACAO): a cada uso, o token apresentado e REVOGADO e um novo e
 *   emitido. Se o token nao existe -> `not_found`. Se ja expirou -> `expired`.
 *   Se ja estava REVOGADO -> REUSO — mas antes de tratar como roubo, ver a
 *   janela de tolerância abaixo.
 * - `revoke`/`revokeAllForUser`: logout de um dispositivo / de todos.
 *
 * **Achado de produção (2026-09-12):** o Dashboard abre várias conexões/polls
 * na MESMA tela de conversa (mensagens, interações de IA, detalhe) — cada uma
 * chamando `requireSession` (BFF) de forma independente. O hotfix de
 * 2026-08-25 já dedupa chamadas concorrentes DENTRO do mesmo processo do BFF
 * quando estão literalmente em voo ao mesmo tempo — mas duas requisições
 * disparadas juntas pelo navegador podem chegar ao servidor com uma diferença
 * de dezenas/centenas de ms (fila de conexão do navegador, VM lenta, etc.): se
 * a primeira já terminou de rotacionar (e o Map do BFF já esqueceu o pedido)
 * quando a segunda chega, a segunda apresenta um token que JÁ FOI consumido —
 * reuso genuíno aos olhos do `rotate()` de então, que revogava a FAMÍLIA
 * INTEIRA. Medido no Postgres de produção: três ocorrências no mesmo dia,
 * cada uma um token novo sendo revogado ~200ms–2,3s depois de criado — tempo
 * incompatível com o ciclo normal de rotação (~14 min, a cada renovação
 * proativa do access token), compatível com exatamente esta corrida. É essa
 * revogação em massa que aparece para o usuário como "Falha ao carregar as
 * mensagens"/"Falha ao carregar as interações de IA" seguido de logout total.
 *
 * **Correção:** uma segunda tentativa de usar um token JÁ revogado, dentro de
 * `REUSE_GRACE_MS` da revogação, devolve o MESMO token novo que a primeira
 * tentativa já tinha emitido — nunca é tratada como reuso. Só vira
 * `reuse_detected` (e revoga tudo) quando a apresentação repetida acontece
 * DEPOIS da janela de graça, ou quando não há registro de para onde aquele
 * token foi rotacionado (ex.: processo reiniciado no meio) — o comportamento
 * de segurança de antes, intacto para o caso que ele existe para pegar: uso
 * de um token realmente antigo, roubado e reaproveitado bem depois.
 */
export class RefreshTokenService {
  /**
   * Para onde cada token revogado foi rotacionado, só durante a janela de
   * graça — em memória, por PROCESSO (mesma suposição já documentada para
   * `KeyedMutex`/`inFlightRefreshes` do Dashboard neste projeto: `apps/api`
   * roda como processo único e persistente). Limitação aceita: se a API
   * escalar horizontalmente, esta tolerância só protege dentro de uma
   * instância — mesma ressalva já registrada alhures.
   */
  private readonly recentlyRotated = new Map<
    string,
    { userId: string; newToken: string; expiresAtMs: number }
  >();

  constructor(
    private readonly repository: RefreshTokenRepository,
    private readonly codec: RefreshTokenCodec,
    private readonly ttlMs: number,
    private readonly now: () => Date = () => new Date(),
    private readonly graceMs: number = REUSE_GRACE_MS,
  ) {}

  async issue(userId: string, meta: RefreshTokenMeta = {}): Promise<string> {
    const { token, tokenHash } = this.codec.generate();
    const expiresAt = new Date(this.now().getTime() + this.ttlMs);
    await this.repository.create({
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    // Purga oportunista (Fase Auth, 2026-08-26): apaga tokens ja expirados
    // deste usuario a cada emissao nova. Best-effort — nunca impede o login.
    this.repository.purgeExpiredForUser(userId, this.now()).catch(() => {});
    return token;
  }

  async rotate(presentedToken: string): Promise<RotateRefreshTokenResult> {
    this.pruneExpiredRotations();
    const tokenHash = this.codec.hash(presentedToken);
    const record = await this.repository.findByTokenHash(tokenHash);

    if (!record) {
      return { ok: false, reason: 'not_found' };
    }
    if (record.revokedAt !== undefined) {
      // Janela de tolerância a reuso CONCORRENTE (ver docstring da classe):
      // se ESTE MESMO token já foi rotacionado há pouco (a entrada só existe
      // se ainda estiver dentro de `graceMs` — `pruneExpiredRotations()`
      // acima já removeu qualquer uma vencida), devolve o token novo que a
      // primeira tentativa já emitiu, em vez de tratar como roubo.
      const recent = this.recentlyRotated.get(tokenHash);
      if (recent) {
        return { ok: true, userId: recent.userId, token: recent.newToken };
      }
      // Reuso fora da janela de graça (ou sem registro de para onde este
      // token foi rotacionado) = provável roubo. Revoga a família toda.
      await this.repository.revokeAllByUser(record.userId);
      return { ok: false, reason: 'reuse_detected' };
    }
    if (record.expiresAt.getTime() <= this.now().getTime()) {
      return { ok: false, reason: 'expired' };
    }

    await this.repository.revokeById(record.id);
    const token = await this.issue(record.userId, { userAgent: record.userAgent, ip: record.ip });
    this.recentlyRotated.set(tokenHash, {
      userId: record.userId,
      newToken: token,
      expiresAtMs: this.now().getTime() + this.graceMs,
    });
    return { ok: true, userId: record.userId, token };
  }

  /**
   * Descarta entradas vencidas do mapa de tolerância — mantém o mapa pequeno
   * (limitado pelo volume de rotações dentro de `graceMs`, sempre minúsculo)
   * sem precisar de um timer próprio; roda de graça a cada `rotate()`.
   */
  private pruneExpiredRotations(): void {
    const nowMs = this.now().getTime();
    for (const [hash, entry] of this.recentlyRotated) {
      if (entry.expiresAtMs <= nowMs) {
        this.recentlyRotated.delete(hash);
      }
    }
  }

  async revoke(presentedToken: string): Promise<void> {
    const record = await this.repository.findByTokenHash(this.codec.hash(presentedToken));
    if (record) {
      await this.repository.revokeById(record.id);
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repository.revokeAllByUser(userId);
  }
}
