import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * ROTA DESATIVADA — Base de Conhecimento (Nível 1 — o "Cérebro da IA") migrou
 * de rota flat por tenant para ANINHADA por sessão (Milestone 6, Bloco
 * M6H-3, 2026-07-25). Ver `pages/api/sessions/[sessionName]/ai-profile/index.ts`.
 * Arquivo mantido (não pode ser apagado neste ambiente) só como aviso claro
 * em vez de um 404 silencioso — mesmo padrão já usado para as demais rotas
 * flat desativadas na M6H-1b (ex.: `pages/ai-profile.tsx`).
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse): void {
  res.status(410).json({
    error: 'route_moved',
    message:
      'Esta rota foi substituída por /api/sessions/:sessionName/ai-profile (Cérebro da IA por sessão).',
  });
}
