import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Fakes mínimos de `NextApiRequest`/`NextApiResponse` para os testes deste
 * pacote — sem depender de nenhum harness de servidor HTTP real (mesmo
 * espírito dos Fakes de `apps/api/tests/services/whatsapp/testDoubles.ts`:
 * só o suficiente da interface para exercitar a lógica sob teste).
 */
export function createFakeReq(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  const req = {
    method: 'GET',
    cookies: {},
    query: {},
    body: undefined,
    headers: {},
    on: jest.fn(),
    ...overrides,
  } as unknown as NextApiRequest;

  // Bloco B1 (CSRF) — um navegador de verdade, logado, SEMPRE devolve o
  // token no cabeçalho (o `clientApi` lê o cookie legível e o anexa). Um
  // fake que não fizesse isso obrigaria cada teste de rota mutante a montar
  // o cabeçalho à mão, sem nada a ver com o que o teste prova.
  //
  // Deriva do próprio cookie de sessão informado, então o cabeçalho é o
  // token CERTO daquela sessão. Um `headers` explícito nos overrides tem
  // precedência — é assim que os testes da PRÓPRIA proteção CSRF simulam
  // token ausente ou divergente.
  const alreadySet = (overrides.headers as Record<string, unknown> | undefined)?.[
    'x-csrf-token'
  ];
  if (alreadySet === undefined) {
    const token = csrfTokenFromCookies(req.cookies);
    if (token) {
      (req.headers as Record<string, string>)['x-csrf-token'] = token;
    }
  }
  return req;
}

/**
 * Lê o token CSRF de dentro do cookie de sessão cifrado, do mesmo jeito que
 * o BFF faz. Import tardio para não criar dependência de carga entre este
 * módulo de fakes e `lib/dashboardSession`.
 */
function csrfTokenFromCookies(cookies: Record<string, string | undefined>): string | undefined {
  if (!cookies['wa_dashboard_session']) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readSessionFromRequest } = require('../lib/dashboardSession');
    const session = readSessionFromRequest({ cookies });
    return session?.csrfToken;
  } catch {
    return undefined;
  }
}

export interface FakeResponse extends NextApiResponse {
  _status: number | undefined;
  _json: unknown;
  _headers: Record<string, string | string[]>;
  _ended: boolean;
  _written: string[];
}

export function createFakeRes(): FakeResponse {
  const headers: Record<string, string | string[]> = {};
  const written: string[] = [];
  const res: Partial<FakeResponse> = {
    _status: undefined,
    _json: undefined,
    _headers: headers,
    _ended: false,
    _written: written,
  };

  res.status = jest.fn((code: number) => {
    res._status = code;
    return res as NextApiResponse;
  }) as NextApiResponse['status'];

  res.json = jest.fn((data: unknown) => {
    res._json = data;
    return res as NextApiResponse;
  }) as NextApiResponse['json'];

  res.setHeader = jest.fn((name: string, value: string | string[]) => {
    headers[name] = value;
    return res as NextApiResponse;
  }) as NextApiResponse['setHeader'];

  res.end = jest.fn((chunk?: unknown) => {
    res._ended = true;
    if (typeof chunk === 'string') written.push(chunk);
    return res as NextApiResponse;
  }) as NextApiResponse['end'];

  res.write = jest.fn((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  }) as NextApiResponse['write'];

  res.writeHead = jest.fn((status: number) => {
    res._status = status;
    return res as NextApiResponse;
  }) as unknown as NextApiResponse['writeHead'];

  res.flushHeaders = jest.fn() as unknown as NextApiResponse['flushHeaders'];

  return res as FakeResponse;
}

/**
 * Desde o bloco B1 (token CSRF), `setSessionCookie` grava DOIS cookies —
 * a sessão cifrada e o token legível —, então `Set-Cookie` passou a ser um
 * array. Estes dois helpers existem para os testes não repetirem essa
 * normalização (e não voltarem a assumir que o cabeçalho é uma string).
 */
export function setCookieHeaders(res: FakeResponse): string[] {
  const raw = res._headers['Set-Cookie'];
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** O valor do cookie de SESSÃO gravado na resposta (ignora o cookie de CSRF). */
export function sessionCookieValue(res: FakeResponse): string {
  const header = setCookieHeaders(res).find((cookie) =>
    cookie.startsWith('wa_dashboard_session='),
  );
  if (!header) throw new Error('Set-Cookie não contém o cookie de sessão');
  return header.slice('wa_dashboard_session='.length).split(';')[0];
}
