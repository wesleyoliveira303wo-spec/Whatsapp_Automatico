import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * ROTA DESATIVADA — Analytics migrou de rota flat por tenant para ANINHADA
 * por sessão (Milestone 6, Bloco M6H-4, 2026-07-26). Ver
 * `pages/api/sessions/[sessionName]/analytics/ai-usage.ts`. Arquivo mantido
 * (não pode ser apagado neste ambiente) só como aviso claro em vez de um 404
 * silencioso — mesmo padrão já usado para `pages/api/ai-profile/index.ts`
 * (M6H-3).
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse): void {
  res.status(410).json({
    error: 'route_moved',
    message:
      'Esta rota foi substituída por /api/sessions/:sessionName/analytics/ai-usage (Analytics por sessão).',
  });
}
