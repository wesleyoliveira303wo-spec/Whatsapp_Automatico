import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * ROTA DESATIVADA — Analytics migrou de rota flat por tenant para ANINHADA
 * por sessão (Milestone 6, Bloco M6H-4, 2026-07-26). Ver
 * `pages/api/sessions/[sessionName]/analytics/session-stability.ts`. Mesmo
 * racional de `pages/api/analytics/ai-usage.ts`.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse): void {
  res.status(410).json({
    error: 'route_moved',
    message:
      'Esta rota foi substituída por /api/sessions/:sessionName/analytics/session-stability (Analytics por sessão).',
  });
}
