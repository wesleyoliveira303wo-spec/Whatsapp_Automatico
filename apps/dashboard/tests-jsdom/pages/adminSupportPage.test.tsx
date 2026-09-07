import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';

import AdminSupportPage from '@/pages/admin/support';
import type { PlatformAdmin } from '@/lib/platformClientApi';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('@/components/admin/AdminShell', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const fetchSupportRequests = jest.fn();
jest.mock('@/lib/platformClientApi', () => {
  const actual = jest.requireActual('@/lib/platformClientApi');
  return {
    ...actual,
    fetchSupportRequests: (...a: unknown[]) => fetchSupportRequests(...a),
    enterTenantAccount: jest.fn(),
    endSupportAccess: jest.fn(),
  };
});

const admin: PlatformAdmin = { id: 'admin-1', email: 'dono@francis.app', name: 'Dono' };

beforeEach(() => jest.clearAllMocks());

describe('AdminSupportPage', () => {
  it('falha na PRIMEIRA carga → mostra o card de erro, não fica preso no skeleton', async () => {
    fetchSupportRequests.mockRejectedValueOnce(new Error('502'));
    render(<AdminSupportPage admin={admin} />);

    expect(
      await screen.findByText('Não foi possível carregar os pedidos de acesso.'),
    ).toBeInTheDocument();
  });

  it('carga OK → renderiza as seções sem card de erro', async () => {
    fetchSupportRequests.mockResolvedValueOnce({ requests: [] });
    render(<AdminSupportPage admin={admin} />);

    await waitFor(() => expect(screen.getByText('Ativos agora')).toBeInTheDocument());
    expect(
      screen.queryByText('Não foi possível carregar os pedidos de acesso.'),
    ).not.toBeInTheDocument();
  });
});
