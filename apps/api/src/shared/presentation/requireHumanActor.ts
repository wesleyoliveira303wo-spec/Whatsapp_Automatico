import { NextFunction, Request, RequestHandler, Response } from 'express';

import { RequestWithPrincipal } from './authenticate';

/**
 * Deixa passar só uma PESSOA identificável (`principal.kind === 'user'`) —
 * nunca a API key (plano máquina) nem o acesso assistido do suporte. Para
 * ações em que "quem fez" precisa ser uma pessoa da empresa: gerir a equipe,
 * autorizar o suporte, assinar ou trocar o plano.
 *
 * Nasceu copiado dentro de `usersRouter` e `tenantSupportAccessRouter`; a
 * cobrança (B5) seria a terceira cópia, então virou um lugar só. A mensagem
 * muda por uso, o código 403 `human_required` não.
 */
export function requireHumanActor(message: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = (req as RequestWithPrincipal).principal;
    if (!principal || principal.kind !== 'user') {
      res.status(403).json({ error: 'human_required', message });
      return;
    }
    next();
  };
}
