/**
 * B5, etapa 2 — a aba Plano. Travas:
 * - a linha de situação (Grátis, teste, ativa, atraso, ativado pela equipe);
 * - quem vê os botões (só o dono, só com a cobrança ligada, só sem assinatura);
 * - a volta do Stripe: "Ativando seu plano…" até o aviso chegar, e o prazo;
 * - clicar leva para a página do Stripe; um erro da API aparece num alerta.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlanSettingsTab from '../../components/PlanSettingsTab';
import * as clientApi from '../../lib/clientApi';
import type { BillingStatus } from '../../lib/clientApi';

const mockReplace = jest.fn();
let mockQuery: Record<string, string> = {};

jest.mock('next/router', () => ({
  useRouter: () => ({
    query: mockQuery,
    asPath: `/settings/plano${mockQuery.checkout ? `?checkout=${mockQuery.checkout}` : ''}`,
    replace: mockReplace,
  }),
}));

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchBillingStatus: jest.fn(),
  startCheckout: jest.fn(),
  openBillingPortal: jest.fn(),
}));

const mockFetch = clientApi.fetchBillingStatus as jest.Mock;
const mockCheckout = clientApi.startCheckout as jest.Mock;
const mockPortal = clientApi.openBillingPortal as jest.Mock;

function billing(overrides: Partial<BillingStatus> = {}): BillingStatus {
  return {
    plan: 'free',
    planSource: 'self_service',
    billingEnabled: true,
    trialAvailable: true,
    subscription: null,
    ...overrides,
  };
}

const activePro: BillingStatus['subscription'] = {
  plan: 'pro',
  status: 'active',
  trialEndsAt: null,
  currentPeriodEnd: '2026-10-18T15:00:00.000Z',
  cancelAtPeriodEnd: false,
  pastDueSince: null,
};

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

beforeEach(() => {
  mockQuery = {};
  mockReplace.mockReset();
  mockFetch.mockReset();
  mockCheckout.mockReset();
  mockPortal.mockReset();
});

describe('PlanSettingsTab', () => {
  it('Grátis: mostra o plano, a situação e os três planos pagos com preço', async () => {
    mockFetch.mockResolvedValue({ billing: billing() });
    render(<PlanSettingsTab canManage />);

    expect(await screen.findByText('Você está no Grátis.')).toBeInTheDocument();
    for (const [name, price] of [
      ['Disparos', 'R$ 69'],
      ['Pro', 'R$ 119'],
      ['Enterprise', 'R$ 249'],
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
      expect(screen.getByText(price)).toBeInTheDocument();
    }
    expect(screen.getByText('Até 5 WhatsApps')).toBeInTheDocument();
  });

  it('dono com teste disponível: cada plano oferece "Testar 1 dia grátis"', async () => {
    mockFetch.mockResolvedValue({ billing: billing() });
    render(<PlanSettingsTab canManage />);

    const buttons = await screen.findAllByRole('button', { name: 'Testar 1 dia grátis' });
    expect(buttons).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Gerenciar assinatura' })).not.toBeInTheDocument();
  });

  it('teste já usado: o botão vira "Assinar"', async () => {
    mockFetch.mockResolvedValue({ billing: billing({ trialAvailable: false }) });
    render(<PlanSettingsTab canManage />);

    expect(await screen.findAllByRole('button', { name: 'Assinar' })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Testar 1 dia grátis' })).not.toBeInTheDocument();
  });

  it('clicar em assinar leva para a página do Stripe', async () => {
    mockFetch.mockResolvedValue({ billing: billing() });
    mockCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    const navigate = jest.fn();
    render(<PlanSettingsTab canManage navigate={navigate} />);

    const [, proButton] = await screen.findAllByRole('button', { name: 'Testar 1 dia grátis' });
    fireEvent.click(proButton);

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1'),
    );
    expect(mockCheckout).toHaveBeenCalledWith('pro');
  });

  it('erro da API aparece num alerta, com a mensagem dela', async () => {
    mockFetch.mockResolvedValue({ billing: billing() });
    mockCheckout.mockRejectedValue(
      new clientApi.ClientApiError(409, {
        error: 'subscription_already_active',
        message: 'Este workspace já tem uma assinatura.',
      }),
    );
    const navigate = jest.fn();
    render(<PlanSettingsTab canManage navigate={navigate} />);

    const [button] = await screen.findAllByRole('button', { name: 'Testar 1 dia grátis' });
    fireEvent.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este workspace já tem uma assinatura.',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('assinatura ativa: marca "Seu plano", mostra a próxima cobrança e o portal', async () => {
    mockFetch.mockResolvedValue({ billing: billing({ plan: 'pro', subscription: activePro }) });
    mockPortal.mockResolvedValue({ url: 'https://billing.stripe.com/p/session_1' });
    const navigate = jest.fn();
    render(<PlanSettingsTab canManage navigate={navigate} />);

    expect(await screen.findByText('Próxima cobrança em 18/10.')).toBeInTheDocument();
    expect(screen.getByText('Seu plano')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Assinar|Testar 1 dia grátis/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar assinatura' }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('https://billing.stripe.com/p/session_1'),
    );
  });

  it('plano ativado pela equipe: diz isso e não oferece assinatura', async () => {
    mockFetch.mockResolvedValue({ billing: billing({ plan: 'pro', planSource: 'manual' }) });
    render(<PlanSettingsTab canManage />);

    expect(await screen.findByText('Ativado pela equipe do Francis.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Assinar|Testar 1 dia grátis/ }),
    ).not.toBeInTheDocument();
  });

  it('quem não é dono vê os planos, mas não os botões', async () => {
    mockFetch.mockResolvedValue({ billing: billing() });
    render(<PlanSettingsTab canManage={false} />);

    expect(
      await screen.findByText('Só o dono da conta assina ou troca de plano.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Assinar|Testar 1 dia grátis/ }),
    ).not.toBeInTheDocument();
  });

  it('cobrança desligada: aponta para o comercial', async () => {
    mockFetch.mockResolvedValue({ billing: billing({ billingEnabled: false }) });
    render(<PlanSettingsTab canManage />);

    expect(
      await screen.findByText(/A assinatura pelo site ainda não está disponível/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Falar com o comercial' })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/5521982925941'),
    );
    expect(
      screen.queryByRole('button', { name: /Assinar|Testar 1 dia grátis/ }),
    ).not.toBeInTheDocument();
  });

  it('volta do Stripe cancelada: avisa que nada foi cobrado', async () => {
    mockQuery = { checkout: 'canceled' };
    mockFetch.mockResolvedValue({ billing: billing() });
    render(<PlanSettingsTab canManage />);

    expect(
      await screen.findByText('Nada foi cobrado. Você pode assinar quando quiser.'),
    ).toBeInTheDocument();
  });

  it('volta do Stripe paga: espera o aviso chegar e confirma', async () => {
    mockQuery = { checkout: 'done' };
    mockFetch
      .mockResolvedValueOnce({ billing: billing() })
      .mockResolvedValueOnce({ billing: billing() })
      .mockResolvedValue({
        billing: billing({
          plan: 'pro',
          trialAvailable: false,
          subscription: {
            ...activePro,
            status: 'trialing',
            trialEndsAt: '2026-09-19T15:00:00.000Z',
          },
        }),
      });
    render(<PlanSettingsTab canManage pollIntervalMs={10} pollTimeoutMs={5000} />);

    expect(await screen.findByText('Ativando seu plano…')).toBeInTheDocument();
    expect(await screen.findByText('Plano ativado.')).toBeInTheDocument();
    expect(
      screen.getByText('Teste grátis até 19/09. A primeira cobrança é feita nesse dia.'),
    ).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/settings/plano', undefined, { shallow: true });
  });

  it('volta do Stripe paga, mas o aviso demora: diz para atualizar depois', async () => {
    jest.useFakeTimers();
    try {
      mockQuery = { checkout: 'done' };
      mockFetch.mockResolvedValue({ billing: billing() });
      render(<PlanSettingsTab canManage pollIntervalMs={2000} pollTimeoutMs={60000} />);

      await act(flushMicrotasks);
      expect(screen.getByText('Ativando seu plano…')).toBeInTheDocument();

      // Cada consulta termina numa promessa: avança o relógio aos poucos.
      for (let elapsed = 0; elapsed < 62000; elapsed += 2000) {
        await act(async () => {
          jest.advanceTimersByTime(2000);
          await flushMicrotasks();
        });
      }

      expect(
        screen.getByText('A confirmação está demorando — atualize a página em alguns minutos.'),
      ).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('falha ao carregar: mostra o erro com "Tentar de novo"', async () => {
    mockFetch.mockRejectedValueOnce(new Error('rede')).mockResolvedValue({ billing: billing() });
    render(<PlanSettingsTab canManage />);

    fireEvent.click(await screen.findByRole('button', { name: /Tentar de novo/ }));
    expect(await screen.findByText('Você está no Grátis.')).toBeInTheDocument();
  });
});
