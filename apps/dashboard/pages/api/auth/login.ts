import type { NextApiRequest, NextApiResponse } from 'next';
import { setSessionCookie } from '../../../lib/dashboardSession';
import { getApiBaseUrl } from '../../../lib/apiClient';

/**
 * Login do Dashboard (M2, Fase 3 — BFF-1). Recebe `{ tenantId, apiKey }` no
 * corpo — a MESMA API key de longo prazo já emitida via
 * `apps/api/src/scripts/issueApiKey.ts` (Production Hardening, Bloco 3).
 * Deliberadamente NÃO introduz um conceito novo de "conta de usuário do
 * Dashboard" — reaproveita o modelo de autenticação já existente (API key
 * por tenant), só realoca ONDE o segredo fica guardado depois do login (num
 * cookie httpOnly do servidor, nunca em `localStorage`/JS do browser). Ver
 * decisão de arquitetura da Milestone 2.
 *
 * Validação: NÃO existe (nem foi criado) um endpoint dedicado
 * "verify-api-key" em `apps/api` — isso teria sido uma mudança de contrato
 * público do backend, fora do escopo desta Fase (que é só BFF, `apps/dashboard`).
 * Em vez disso, reaproveita `GET /api/tenants/:tenantId/whatsapp-sessions`
 * (a rota de listagem, M2 Fase 1): se responder 200, a API key é válida
 * PARA aquele tenantId; se 401/403, é inválida ou não corresponde ao
 * tenant. Zero peça nova no backend — confirma a validade fazendo a
 * primeira chamada real que o Dashboard precisaria fazer de qualquer jeito.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { tenantId, apiKey, email, password } = req.body ?? {};
  if (typeof tenantId !== 'string' || tenantId.trim() === '') {
    res.status(400).json({ error: 'invalid_params', message: 'tenantId é obrigatório' });
    return;
  }

  // --- Modo PESSOA (M5F-1): e-mail + senha -> tokens da API ---
  // Tem prioridade quando ambos os pares vierem (não deveria acontecer).
  if (typeof email === 'string' && email.trim() !== '') {
    await loginAsUser(res, tenantId, email, typeof password === 'string' ? password : '');
    return;
  }

  // --- Modo MAQUINA (M2, Fase 3 — inalterado): tenantId + apiKey ---
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    res.status(400).json({ error: 'invalid_params', message: 'informe email+password ou apiKey' });
    return;
  }

  let apiBaseUrl: string;
  try {
    apiBaseUrl = getApiBaseUrl();
  } catch (error) {
    res.status(500).json({ error: 'server_misconfigured', message: (error as Error).message });
    return;
  }

  let verifyResponse: Response;
  try {
    verifyResponse = await fetch(new URL(`/api/tenants/${encodeURIComponent(tenantId)}/whatsapp-sessions`, apiBaseUrl), {
      headers: { 'X-API-Key': apiKey },
    });
  } catch (error) {
    res.status(502).json({ error: 'api_unreachable', message: (error as Error).message });
    return;
  }

  if (verifyResponse.status === 401 || verifyResponse.status === 403) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }
  if (!verifyResponse.ok) {
    res.status(502).json({ error: 'api_error', status: verifyResponse.status });
    return;
  }

  setSessionCookie(res, { tenantId, apiKey });
  res.status(200).json({ tenantId });
}

/**
 * Login de PESSOA (Milestone 5, Bloco M5F-1): repassa e-mail+senha para
 * `POST /api/tenants/:tenantId/auth/login` da API e guarda os tokens + user
 * no cookie httpOnly cifrado. O browser NUNCA ve os tokens — só recebe
 * `{ tenantId, user }` (o `user` inclui `mustChangePassword` para a tela de
 * login redirecionar para a troca obrigatória — M5F-2).
 */
async function loginAsUser(res: NextApiResponse, tenantId: string, email: string, password: string): Promise<void> {
  if (password === '') {
    res.status(400).json({ error: 'invalid_params', message: 'password é obrigatório' });
    return;
  }

  let apiBaseUrl: string;
  try {
    apiBaseUrl = getApiBaseUrl();
  } catch (error) {
    res.status(500).json({ error: 'server_misconfigured', message: (error as Error).message });
    return;
  }

  let loginResponse: Response;
  try {
    loginResponse = await fetch(new URL(`/api/tenants/${encodeURIComponent(tenantId)}/auth/login`, apiBaseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (error) {
    res.status(502).json({ error: 'api_unreachable', message: (error as Error).message });
    return;
  }

  if (loginResponse.status === 401) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }
  if (!loginResponse.ok) {
    res.status(502).json({ error: 'api_error', status: loginResponse.status });
    return;
  }

  let body: { accessToken?: unknown; refreshToken?: unknown; user?: Record<string, unknown> };
  try {
    body = (await loginResponse.json()) as typeof body;
  } catch {
    res.status(502).json({ error: 'api_error', message: 'resposta de login inválida' });
    return;
  }

  const { accessToken, refreshToken, user } = body;
  if (
    typeof accessToken !== 'string' ||
    typeof refreshToken !== 'string' ||
    !user ||
    typeof user.id !== 'string' ||
    typeof user.email !== 'string' ||
    typeof user.role !== 'string'
  ) {
    res.status(502).json({ error: 'api_error', message: 'resposta de login inválida' });
    return;
  }

  const sessionUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword === true,
  };
  setSessionCookie(res, { tenantId, accessToken, refreshToken, user: sessionUser });
  res.status(200).json({ tenantId, user: sessionUser });
}
