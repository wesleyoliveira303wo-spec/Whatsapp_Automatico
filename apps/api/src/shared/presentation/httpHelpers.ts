import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Extraído de `whatsAppSessionsRouter.ts` para `shared/presentation/` na
 * Milestone 3, Bloco 5 — mesmo gatilho de extração já usado para
 * `requireApiKey` (D9): até o Bloco 4, `whatsAppSessionsRouter.ts` era o
 * único router do projeto, então `asyncHandler`/`validateOrRespond` viviam
 * duplicados ali sem custo real. O Bloco 5 introduz o segundo e o terceiro
 * router (`conversationsRouter`, `aiInteractionsRouter`) — duplicar estas
 * duas funções uma terceira vez violaria DRY (`CLAUDE.md` §17, "código
 * duplicado é proibição"), então são extraídas agora, no mesmo momento em
 * que o segundo consumidor de fato aparece (mesmo critério já aplicado a
 * `requireApiKey`).
 */

/** Encaminha rejeições de handlers async para o middleware de erro do Express (`next`), que não faz isso sozinho na v4. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Valida um schema Zod contra um objeto; em caso de falha, responde 400 e
 * devolve `undefined` (o chamador deve checar e retornar sem prosseguir). Em
 * caso de sucesso, devolve os dados validados.
 *
 * Assinatura com 3 genéricos (`Output`/`Def`/`Input`), não só `z.ZodSchema<T>`
 * (Reforma do escalonamento, 2026-07-25): schemas com `.transform()` cujo
 * tipo de ENTRADA difere do de SAÍDA (ex.: `needsHumanAttention` — entra como
 * `"true" | undefined`, sai como `true | undefined`) não são atribuíveis a
 * `z.ZodSchema<T>` sozinho, porque esse alias fixa só o `Output` e o TS ainda
 * tenta casar o `Input` inferido do literal contra `T` — o terceiro genérico
 * solto (`Input = Output`, default para os schemas sem transform que já
 * usavam esta função) resolve sem quebrar nenhum chamador existente.
 */
export function validateOrRespond<Output, Def extends z.ZodTypeDef = z.ZodTypeDef, Input = Output>(
  schema: z.ZodType<Output, Def, Input>,
  data: unknown,
  res: Response,
): Output | undefined {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({
      error: 'invalid_params',
      message: result.error.errors.map((e) => e.message).join('; '),
    });
    return undefined;
  }
  return result.data;
}
