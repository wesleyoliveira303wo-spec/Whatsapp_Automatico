import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, RequestHandler, Response } from 'express';

const INTERNAL_SECRET_HEADER = 'x-internal-secret';

/**
 * Middleware de autenticação processo-a-processo (Fase 1, Bloco F1.2) — usado
 * pela rota interna de download de mídia, que o worker de IA (`worker.ts`)
 * chama para obter o binário de uma mensagem SEM instanciar sockets Baileys
 * ele mesmo (regra da ADR #54: só `apps/api` toca Baileys diretamente).
 *
 * Deliberadamente DIFERENTE de `requireApiKey`/`authenticate` (que autenticam
 * um TENANT ou uma PESSOA): aqui não há tenant nem usuário — é um segredo
 * único, fixo, compartilhado entre os dois processos do mesmo deploy
 * (`INTERNAL_API_SECRET`, só em `.env`, nunca exposto a cliente HTTP externo
 * algum). Comparação em tempo constante (`timingSafeEqual`), mesmo padrão já
 * usado em `HmacSha256ApiKeyHasher.verify` — nunca `===` direto num segredo.
 *
 * Rota MONTADA SEM `:tenantId` no path (diferente de toda rota REST pública
 * deste projeto) — o `tenantId`/`sessionName` da mídia pedida vêm do corpo da
 * requisição, verificados pela própria rota, não por este middleware (que só
 * autentica "este chamador é o worker legítimo", não "este tenant existe").
 */
export function requireInternalSecret(expectedSecret: string): RequestHandler {
  return function requireInternalSecretMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const provided = req.header(INTERNAL_SECRET_HEADER);
    if (!provided) {
      res.status(401).json({ error: 'missing_internal_secret' });
      return;
    }

    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expectedSecret);
    const valid =
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer);

    if (!valid) {
      res.status(401).json({ error: 'invalid_internal_secret' });
      return;
    }

    next();
  };
}
