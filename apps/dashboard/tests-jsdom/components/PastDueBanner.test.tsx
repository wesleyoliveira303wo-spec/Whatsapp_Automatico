import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';

import PastDueBanner from '@/components/PastDueBanner';
import type { BillingStatus, SessionUserInfo } from '@/lib/clientApi';

const useRouter = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => useRouter() }));

const useMe = jest.fn();
jest.mock('@/hooks/useMe', () => ({ useMe: () => useMe() }));

const fetchBillingStatus = jest.fn();
const openBillingPortal = jest.fn();
jest.mock('@/lib/clientApi', () => {
  const actual = jest.requireActual('@/lib/clientApi');
  return {
    ...actual,
    fetchBillingStatus: (...a: unknown[]) => fetchBillingStatus(...a),
    openBillingPortal: (...a: unknown[]) => openBillingPortal(...a),
  };
});

function billing(overrides: Partial<BillingStatus> = {}): BillingStatus {
  return {
    plan: 'pro',
    planSource: 'self_service',
    billingEnabled: true,
    trialAvailable: false,
    subscription: null,
    ...overrides,
  };
}

function subscription(
  overrides: Partial<NonNullable<BillingStatus['subscription']>> = {},
): NonNullable<BillingStatus['subscription']> {
  return {
    plan: 'pro',
    status: 'active',
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    pastDueSince: null,
    ...overrides,
  };
}

function user(overrides: Partial<SessionUserInfo> = {}): SessionUserInfo {
  return {
    id: 'u1',
    email: 'dono@empresa.com',
    role: 'owner',
    mustChangePassword: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useRouter.mockReturnValue({ pathname: '/sessions/vendas/conversations' });
  useMe.mockReturnValue({ user: user() });
});

describe('PastDueBanner (B5, etapa 3)', () => {
  it('sem atraso: não renderiza nada', async () => {
    fetchBillingStatus.mockResolvedValue({
      billing: billing({ subscription: subscription({ status: 'active' }) }),
    });

    render(<PastDueBanner />);

    await waitFor(() => expect(fetchBillingStatus).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('em atraso, usuário qualquer (não dono): mostra o prazo, sem botão de gerenciar', async () => {
    useMe.mockReturnValue({ user: user({ role: 'operator' }) });
    fetchBillingStatus.mockResolvedValue({
      billing: billing({
        subscription: subscription({
          status: 'past_due',
          pastDueSince: '2026-09-18T00:00:00.000Z',
        }),
      }),
    });

    render(<PastDueBanner />);

    await screen.findByRole('status');
    expect(screen.getByText(/Pagamento em atraso/)).toBeInTheDocument();
    expect(screen.getByText(/20\/09/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Atualizar pagamento/i })).not.toBeInTheDocument();
  });

  it('em atraso, DONO: mostra o prazo e o botão que abre o portal', async () => {
    fetchBillingStatus.mockResolvedValue({
      billing: billing({
        subscription: subscription({
          status: 'past_due',
          pastDueSince: '2026-09-18T00:00:00.000Z',
        }),
      }),
    });

    render(<PastDueBanner />);

    const button = await screen.findByRole('button', { name: /Atualizar pagamento/i });
    expect(button).toBeInTheDocument();
  });

  it('prazo já vencido: mostra "a qualquer momento" em vez de uma data no passado', async () => {
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    fetchBillingStatus.mockResolvedValue({
      billing: billing({
        subscription: subscription({ status: 'past_due', pastDueSince: past }),
      }),
    });

    render(<PastDueBanner />);

    await screen.findByRole('status');
    expect(screen.getByText(/a qualquer momento/)).toBeInTheDocument();
  });

  it('não renderiza no /admin', async () => {
    useRouter.mockReturnValue({ pathname: '/admin/tenants/t1' });
    fetchBillingStatus.mockResolvedValue({
      billing: billing({
        subscription: subscription({
          status: 'past_due',
          pastDueSince: '2026-09-18T00:00:00.000Z',
        }),
      }),
    });

    render(<PastDueBanner />);

    expect(fetchBillingStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
