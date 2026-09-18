import { NextFunction, Request, Response } from 'express';

import { requireHumanActor } from '../../../src/shared/presentation/requireHumanActor';
import { Principal } from '../../../src/shared/presentation/authenticate';

function run(principal: Principal | undefined): { next: jest.Mock; status: jest.Mock; json: jest.Mock } {
  const next = jest.fn();
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  requireHumanActor('Precisa de pessoa.')(
    { principal } as unknown as Request,
    { status } as unknown as Response,
    next as NextFunction,
  );
  return { next, status, json };
}

describe('requireHumanActor', () => {
  it('pessoa logada passa', () => {
    const { next, status } = run({ kind: 'user', userId: 'u1', tenantId: 't1', role: 'owner' });
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it.each([
    ['API key', { kind: 'machine', tenantId: 't1' } as Principal],
    [
      'suporte',
      { kind: 'support', tenantId: 't1', platformUserId: 'p1', supportAccessId: 's1' } as Principal,
    ],
    ['ninguém', undefined],
  ])('%s: 403 human_required com a mensagem de quem usa', (_label, principal) => {
    const { next, status, json } = run(principal);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'human_required', message: 'Precisa de pessoa.' });
  });
});
