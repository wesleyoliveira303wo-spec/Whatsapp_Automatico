import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Fakes mínimos de `NextApiRequest`/`NextApiResponse` para os testes deste
 * pacote — sem depender de nenhum harness de servidor HTTP real (mesmo
 * espírito dos Fakes de `apps/api/tests/services/whatsapp/testDoubles.ts`:
 * só o suficiente da interface para exercitar a lógica sob teste).
 */
export function createFakeReq(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return {
    method: 'GET',
    cookies: {},
    query: {},
    body: undefined,
    headers: {},
    on: jest.fn(),
    ...overrides,
  } as unknown as NextApiRequest;
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
