import type { NextApiRequest, NextApiResponse } from 'next';
import { setSessionCookie } from '../../../lib/dashboardSession';
import { getApiBaseUrl } from '../../../lib/apiClient';

/**
 * Registro self-service (Fase Auth/Registro, 2026-08-26): cria Tenant+Owner
 * numa unica chamada a `POST /api/auth/register` (API) e ja autentica —
 * mesmo tratamento de tokens do login (cookie httpOnly, nunca no browser).
 * Antes desta rota, criar um tenant era SQL manual (achado da auditoria).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { name, email, password, companyName } = req.body ?? {};
  if (
    typeof name !== 'string' ||
    name.trim() === '' ||
    typeof email !== 'string' ||
    email.trim() === '' ||
    typeof password !== 'string' ||
    password === '' ||
    typeof companyName !== 'string' ||
    companyName.trim() === ''
  ) {
    res.status(400).json({
      error: 'invalid_params',
      message: 'name, email, password e companyName sao obrigatorios',
    });
    return;
  }

  let apiBaseUrl: string;
  try {
    apiBaseUrl = getApiBaseUrl();
  } catch (error) {
    res.status(500).json({ error: 'server_misconfigured', message: (error as Error).message });
    return;
  }

  let registerResponse: Response;
  try {
    registerResponse = await fetch(new URL('/api/auth/register', apiBaseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, companyName }),
    });
  } catch (error) {
    res.status(502).json({ error: 'api_unreachable', message: (error as Error).message });
    return;
  }

  if (registerResponse.status === 409) {
    res.status(409).json({ error: 'email_in_use', message: 'Este e-mail ja esta em uso.' });
    return;
  }
  if (registerResponse.status === 422) {
    const errorBody = (await registerResponse.json().catch(() => ({}))) as { error?: unknown };
    res.status(422).json({
      error: typeof errorBody.error === 'string' ? errorBody.error : 'invalid_input',
      message: 'A senha deve ter pelo menos 8 caracteres.',
    });
    return;
  }
  if (!registerResponse.ok) {
    res.status(502).json({ error: 'api_error', status: registerResponse.status });
    return;
  }

  let body: {
    accessToken?: unknown;
    refreshToken?: unknown;
    tenantId?: unknown;
    user?: Record<string, unknown>;
  };
  try {
    body = (await registerResponse.json()) as typeof body;
  } catch {
    res.status(502).json({ error: 'api_error', message: 'resposta de registro invalida' });
    return;
  }

  const { accessToken, refreshToken, tenantId, user } = body;
  if (
    typeof accessToken !== 'string' ||
    typeof refreshToken !== 'string' ||
    typeof tenantId !== 'string' ||
    !user ||
    typeof user.id !== 'string' ||
    typeof user.email !== 'string' ||
    typeof user.role !== 'string'
  ) {
    res.status(502).json({ error: 'api_error', message: 'resposta de registro invalida' });
    return;
  }

  const sessionUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: false,
  };
  setSessionCookie(res, { tenantId, accessToken, refreshToken, user: sessionUser });
  res.status(201).json({ tenantId, user: sessionUser });
}
