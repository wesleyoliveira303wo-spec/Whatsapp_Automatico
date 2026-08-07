import { sanitizeHeaders } from '../../../src/shared/infrastructure/logging/sanitizeHeaders';

describe('sanitizeHeaders', () => {
  it('redige x-api-key', () => {
    const result = sanitizeHeaders({ 'x-api-key': 'segredo-123' });

    expect(result['x-api-key']).toBe('[REDACTED]');
  });

  it('redige authorization', () => {
    const result = sanitizeHeaders({ authorization: 'Bearer segredo' });

    expect(result.authorization).toBe('[REDACTED]');
  });

  it('redige cookie e set-cookie', () => {
    const result = sanitizeHeaders({
      cookie: 'session=abc',
      'set-cookie': 'session=abc; HttpOnly',
    });

    expect(result.cookie).toBe('[REDACTED]');
    expect(result['set-cookie']).toBe('[REDACTED]');
  });

  it('é case-insensitive (X-API-Key, Authorization em qualquer capitalização)', () => {
    const result = sanitizeHeaders({ 'X-API-Key': 'segredo', AUTHORIZATION: 'Bearer segredo' });

    expect(result['X-API-Key']).toBe('[REDACTED]');
    expect(result.AUTHORIZATION).toBe('[REDACTED]');
  });

  it('preserva headers não sensíveis inalterados', () => {
    const result = sanitizeHeaders({
      'content-type': 'application/json',
      'x-request-id': 'abc-123',
    });

    expect(result['content-type']).toBe('application/json');
    expect(result['x-request-id']).toBe('abc-123');
  });

  it('não muta o objeto original', () => {
    const original = { 'x-api-key': 'segredo-123' };

    sanitizeHeaders(original);

    expect(original['x-api-key']).toBe('segredo-123');
  });

  it('lida com objeto de headers vazio', () => {
    expect(sanitizeHeaders({})).toEqual({});
  });
});
