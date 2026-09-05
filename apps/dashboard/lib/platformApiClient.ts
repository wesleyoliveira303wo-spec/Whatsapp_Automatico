import { getApiBaseUrl } from './apiClient';
import type { PlatformSession } from './platformSession';

export interface PlatformApiResponse<T = unknown> {
  status: number;
  body: T;
}

/**
 * Cliente das rotas `/api/platform/...` da API — Fase 1.
 *
 * Separado de `apiClient.ts` de propósito: aquele monta SEMPRE
 * `/api/tenants/:tenantId/...` a partir do `tenantId` da sessão, e é essa
 * garantia que sustenta o isolamento entre clientes. As rotas de plataforma
 * não têm tenant no caminho; passá-las pelo mesmo cliente exigiria afrouxar
 * justamente a parte que não pode ser afrouxada.
 *
 * Nunca lança para 4xx/5xx — status e corpo são resultado, não exceção
 * (mesmo contrato de `callApi`).
 */
export async function callPlatformApi<T = unknown>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    /** Ausente nas rotas de pré-autenticação (login). */
    session?: PlatformSession;
  } = {},
): Promise<PlatformApiResponse<T>> {
  const url = new URL(`/api/platform${path}`, getApiBaseUrl());

  const response = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(init.session ? { Authorization: `Bearer ${init.session.token}` } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  // 204 (logout) não tem corpo — `json()` explodiria.
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: 'invalid_response', message: text.slice(0, 200) };
    }
  }

  return { status: response.status, body: body as T };
}
