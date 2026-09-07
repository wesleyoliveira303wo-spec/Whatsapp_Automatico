import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../../../lib/dashboardSession';
import { callApi } from '../../../../lib/apiClient';
import { requireStringParam } from '../../../../lib/routeParams';

/**
 * Proxy do Bloco B2 (issue #13) para `POST /:sessionName/contacts/avatars` —
 * as fotos de perfil EM LOTE, servidas do cache do servidor.
 *
 * É a rota que as listas usam: uma requisição por tela, no lugar de uma por
 * linha (que foi o que contribuiu para o incidente da ADR #78, com dezenas
 * de consultas ao vivo no mesmo socket que envia as mensagens).
 *
 * `POST` numa leitura é deliberado (ver a rota na API): a lista de JIDs não
 * caberia com folga numa query string. Como é POST, o cabeçalho CSRF do
 * bloco B1 é obrigatório — o `clientApi` já o anexa sozinho.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireSession(req, res);
  if (!session) return;
  const sessionName = requireStringParam(req.query.sessionName, 'sessionName', res);
  if (!sessionName) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { status, body } = await callApi(
    session,
    `/${encodeURIComponent(sessionName)}/contacts/avatars`,
    { method: 'POST', body: req.body },
  );
  res.status(status).json(body);
}
