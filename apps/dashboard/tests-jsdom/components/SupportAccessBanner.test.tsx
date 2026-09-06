import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import SupportAccessBanner from '@/components/SupportAccessBanner';
import type { ActiveSupportAccess } from '@/lib/clientApi';

const useRouter = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => useRouter() }));

const fetchActive = jest.fn();
const respond = jest.fn();
const revoke = jest.fn();
const leave = jest.fn();
jest.mock('@/lib/clientApi', () => {
  const actual = jest.requireActual('@/lib/clientApi');
  return {
    ...actual,
    fetchActiveSupportAccess: (...a: unknown[]) => fetchActive(...a),
    respondSupportAccess: (...a: unknown[]) => respond(...a),
    revokeSupportAccess: (...a: unknown[]) => revoke(...a),
    leaveSupportSession: (...a: unknown[]) => leave(...a),
  };
});

function open(patch: Partial<ActiveSupportAccess>): ActiveSupportAccess {
  return {
    id: 'sa-1',
    tenantId: 't-1',
    platformUserId: 'admin-1',
    reason: 'ver a IA',
    status: 'pending',
    requestedAt: '2026-09-06T12:00:00Z',
    respondedAt: null,
    respondedByUserId: null,
    expiresAt: null,
    adminName: 'Wesley',
    adminEmail: 'w@francis.app',
    ...patch,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useRouter.mockReturnValue({ pathname: '/app', push: jest.fn() });
});

describe('SupportAccessBanner', () => {
  it('não renderiza nada em /admin', () => {
    useRouter.mockReturnValue({ pathname: '/admin/tenants', push: jest.fn() });
    fetchActive.mockResolvedValue({ open: open({ status: 'pending' }), canRespond: true, viewerIsSupport: false });
    const { container } = render(<SupportAccessBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchActive).not.toHaveBeenCalled();
  });

  it('pending + canRespond → Autorizar/Recusar; autorizar chama respond("accept")', async () => {
    fetchActive.mockResolvedValue({ open: open({ status: 'pending' }), canRespond: true, viewerIsSupport: false });
    respond.mockResolvedValue({ request: open({ status: 'accepted' }) });
    render(<SupportAccessBanner />);

    await screen.findByText(/pediu acesso à sua conta/i);
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar acesso' }));

    await waitFor(() => expect(respond).toHaveBeenCalledWith('sa-1', 'accept'));
  });

  it('pending sem permissão → mostra aviso, sem botões de ação', async () => {
    fetchActive.mockResolvedValue({ open: open({ status: 'pending' }), canRespond: false, viewerIsSupport: false });
    render(<SupportAccessBanner />);

    await screen.findByText(/Só o dono ou um administrador pode responder/i);
    expect(screen.queryByRole('button', { name: 'Autorizar acesso' })).toBeNull();
  });

  it('accepted → faixa fixa SEM botão de fechar; só "Encerrar acesso" (Regra 4)', async () => {
    fetchActive.mockResolvedValue({
      open: open({ status: 'accepted', respondedAt: '2026-09-06T12:05:00Z' }),
      canRespond: true,
      viewerIsSupport: false,
    });
    revoke.mockResolvedValue({ request: open({ status: 'revoked' }) });
    render(<SupportAccessBanner />);

    await screen.findByText(/está acessando sua conta agora/i);
    expect(screen.queryByRole('button', { name: /fechar|dispensar|close/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar acesso' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('sa-1'));
  });

  it('viewerIsSupport → barra "Sessão de suporte" com "Sair do suporte" (não o aviso do cliente)', async () => {
    fetchActive.mockResolvedValue({
      open: open({ status: 'accepted' }),
      canRespond: true,
      viewerIsSupport: true,
    });
    leave.mockResolvedValue({ ok: true });
    Object.defineProperty(window, 'location', {
      value: { assign: jest.fn() },
      writable: true,
    });
    render(<SupportAccessBanner />);

    await screen.findByText(/Sessão de suporte/i);
    expect(screen.queryByRole('button', { name: 'Encerrar acesso' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sair do suporte' }));
    await waitFor(() => expect(leave).toHaveBeenCalled());
  });

  it('401 na chamada /active → não renderiza nada (deslogado)', async () => {
    const { ClientApiError } = jest.requireActual('@/lib/clientApi');
    fetchActive.mockRejectedValue(new ClientApiError(401, { error: 'not_authenticated' }));
    const { container } = render(<SupportAccessBanner />);
    await waitFor(() => expect(fetchActive).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
