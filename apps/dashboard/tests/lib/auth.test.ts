import type { GetServerSidePropsContext } from 'next';
import { requirePageSession, requireProtectedPageSession } from '../../lib/auth';
import { readSessionFromRequest } from '../../lib/dashboardSession';

jest.mock('../../lib/dashboardSession');

function fakeContext(): GetServerSidePropsContext {
  return { req: { cookies: {} } } as unknown as GetServerSidePropsContext;
}

describe('requirePageSession (M2, Fase 4 — guarda de autenticação de páginas)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('delega a readSessionFromRequest(context.req)', () => {
    const context = fakeContext();
    (readSessionFromRequest as jest.Mock).mockReturnValue({
      tenantId: 'tenant-1',
      apiKey: 'chave',
    });

    const result = requirePageSession(context);

    expect(readSessionFromRequest).toHaveBeenCalledWith(context.req);
    expect(result).toEqual({ tenantId: 'tenant-1', apiKey: 'chave' });
  });

  it('devolve null quando não há sessão', () => {
    const context = fakeContext();
    (readSessionFromRequest as jest.Mock).mockReturnValue(null);

    expect(requirePageSession(context)).toBeNull();
  });
});

describe('requireProtectedPageSession (Milestone 5, Bloco M5F-2 — portão da senha provisória)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('sem sessão: redirect para /login', () => {
    (readSessionFromRequest as jest.Mock).mockReturnValue(null);

    expect(requireProtectedPageSession(fakeContext())).toEqual({
      kind: 'redirect',
      redirect: { destination: '/login', permanent: false },
    });
  });

  it('usuário com senha provisória: redirect para /change-password (não navega pelo resto)', () => {
    (readSessionFromRequest as jest.Mock).mockReturnValue({
      tenantId: 'tenant-1',
      accessToken: 'acc',
      refreshToken: 'ref',
      user: { id: 'u1', email: 'a@b.com', role: 'operator', mustChangePassword: true },
    });

    expect(requireProtectedPageSession(fakeContext())).toEqual({
      kind: 'redirect',
      redirect: { destination: '/change-password', permanent: false },
    });
  });

  it('usuário com senha definitiva: passa (kind ok, com a sessão)', () => {
    const session = {
      tenantId: 'tenant-1',
      accessToken: 'acc',
      refreshToken: 'ref',
      user: { id: 'u1', email: 'a@b.com', role: 'operator', mustChangePassword: false },
    };
    (readSessionFromRequest as jest.Mock).mockReturnValue(session);

    expect(requireProtectedPageSession(fakeContext())).toEqual({ kind: 'ok', session });
  });

  it('sessão de MÁQUINA (sem user): passa direto — comportamento pré-M5F intacto', () => {
    const session = { tenantId: 'tenant-1', apiKey: 'chave' };
    (readSessionFromRequest as jest.Mock).mockReturnValue(session);

    expect(requireProtectedPageSession(fakeContext())).toEqual({ kind: 'ok', session });
  });
});
