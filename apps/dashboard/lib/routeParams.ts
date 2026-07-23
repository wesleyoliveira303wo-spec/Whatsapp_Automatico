import type { NextApiResponse } from 'next';

/**
 * Extrai um parâmetro de rota dinâmica do Next.js (`req.query[name]`), que
 * é tipado como `string | string[] | undefined` mesmo para segmentos
 * únicos (`[sessionName].ts`) — só vira array em rotas catch-all
 * (`[...slug].ts]`), que não é o caso aqui, mas o TypeScript não sabe disso
 * estaticamente. Responde 400 e devolve `undefined` se ausente/vazio/array —
 * mesmo padrão de `validateOrRespond()` usado no router Express de
 * `apps/api` (Bloco 7): validar e já responder no caminho de falha, sem
 * repetir esse guard em cada rota.
 */
export function requireStringParam(value: string | string[] | undefined, name: string, res: NextApiResponse): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    res.status(400).json({ error: 'invalid_params', message: `${name} não pode ser vazio` });
    return undefined;
  }
  return value;
}
