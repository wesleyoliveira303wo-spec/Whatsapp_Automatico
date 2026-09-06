import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import TenantControlPanel from '@/components/admin/TenantControlPanel';
import { PlatformApiError } from '@/lib/platformClientApi';

const changePlan = jest.fn();
const suspend = jest.fn();
const reactivate = jest.fn();
const toast = jest.fn();

jest.mock('@/lib/platformClientApi', () => {
  const actual = jest.requireActual('@/lib/platformClientApi');
  return {
    ...actual,
    changePlatformTenantPlan: (...a: unknown[]) => changePlan(...a),
    suspendPlatformTenant: (...a: unknown[]) => suspend(...a),
    reactivatePlatformTenant: (...a: unknown[]) => reactivate(...a),
  };
});

jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));

const ACTIVE = { id: 't1', name: 'Cliente Um', plan: 'free' as const, status: 'active' as const };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TenantControlPanel', () => {
  it('suspender abre um diálogo que NOMEIA a consequência antes de agir', async () => {
    suspend.mockResolvedValue({ ...ACTIVE, status: 'suspended' });
    const onChanged = jest.fn();
    render(<TenantControlPanel tenant={ACTIVE} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: 'Suspender acesso' }));

    // O diálogo nomeia o efeito, não é um "OK" genérico.
    expect(
      screen.getByText(/param de conseguir entrar imediatamente/i),
    ).toBeInTheDocument();
    expect(suspend).not.toHaveBeenCalled();

    // Com o diálogo aberto o botão da tela fica aria-hidden; sobra o do diálogo.
    fireEvent.click(screen.getByRole('button', { name: 'Suspender acesso' }));

    await waitFor(() => expect(suspend).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ ...ACTIVE, status: 'suspended' }));
  });

  it('mudar de plano confirma com o alvo e o plano no título', async () => {
    changePlan.mockResolvedValue({ ...ACTIVE, plan: 'pro' });
    render(<TenantControlPanel tenant={ACTIVE} onChanged={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pro' }));
    expect(screen.getByText(/Mudar o plano de Cliente Um para Pro\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mudar plano' }));
    await waitFor(() => expect(changePlan).toHaveBeenCalledWith('t1', 'pro'));
  });

  it('o plano atual fica desabilitado (não dá pra "mudar" para o mesmo)', () => {
    render(<TenantControlPanel tenant={ACTIVE} onChanged={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Grátis' })).toBeDisabled();
  });

  it('tenant suspenso mostra Reativar e o aviso de acesso bloqueado', () => {
    render(
      <TenantControlPanel tenant={{ ...ACTIVE, status: 'suspended' }} onChanged={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Reativar acesso' })).toBeInTheDocument();
    expect(screen.getByText(/nenhum usuário desta empresa consegue entrar/i)).toBeInTheDocument();
  });

  it('um 409 (no-op) vira toast informativo, não erro', async () => {
    suspend.mockRejectedValue(new PlatformApiError(409, { error: 'no_op' }));
    render(<TenantControlPanel tenant={ACTIVE} onChanged={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Suspender acesso' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suspender acesso' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nada a fazer' })),
    );
  });
});
