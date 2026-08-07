import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * ROTA REMOVIDA (2026-07-31, ADR #89) — existiu por poucas horas, criada
 * pela ADR #87 para "devolver à IA" o controle da classificação de uma
 * conversa travada por correção manual. A própria TRAVA deixou de existir
 * na ADR #89 (a IA passou a reclassificar sempre, só nunca regredindo o
 * card no funil), então não há mais nada a destravar e esta rota perdeu o
 * propósito.
 *
 * Responde `410 Gone` em vez de simplesmente sumir porque o ambiente de
 * desenvolvimento deste projeto não permite apagar arquivos — mesmo
 * tratamento já dado às rotas flat de `ai-profile`/`analytics` migradas
 * para o padrão aninhado (ADRs #82/#83): um erro explícito é mais fácil de
 * diagnosticar do que um 404 silencioso, caso algum cliente antigo ainda
 * chame este caminho.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse): void {
  res.status(410).json({
    error: 'route_removed',
    message:
      'A trava de classificação por correção humana não existe mais (ADR #89): a IA reclassifica todas as conversas automaticamente e nunca move um card para trás no funil.',
  });
}
