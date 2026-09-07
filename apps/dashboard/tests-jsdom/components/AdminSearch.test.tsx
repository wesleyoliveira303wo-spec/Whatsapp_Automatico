import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AdminSearch from '@/components/admin/AdminSearch';
import type { PlatformSearchResults } from '@/lib/platformClientApi';

const push = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push }) }));

const search = jest.fn();
jest.mock('@/lib/platformClientApi', () => {
  const actual = jest.requireActual('@/lib/platformClientApi');
  return { ...actual, searchPlatform: (...a: unknown[]) => search(...a) };
});

const RESULTS: PlatformSearchResults = {
  query: 'cli',
  groups: [
    {
      kind: 'tenant',
      hasMore: false,
      hits: [
        {
          kind: 'tenant',
          id: 't1',
          label: 'Cliente Um',
          sublabel: 't1',
          tenantId: 't1',
          href: '/admin/tenants/t1',
        },
      ],
    },
    {
      kind: 'contact',
      hasMore: true,
      hits: [
        {
          kind: 'contact',
          id: 'c9',
          label: '+5521999998888',
          sublabel: 'Contato · no tenant Cliente Um',
          tenantId: 't1',
          href: '/admin/tenants/t1',
        },
      ],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('AdminSearch (Fase 6 — §7)', () => {
  it('digitar ≥ 2 chars dispara a busca (com debounce) e mostra grupos', async () => {
    search.mockResolvedValue(RESULTS);
    render(<AdminSearch />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cli' } });
    jest.advanceTimersByTime(300);

    await waitFor(() => expect(search).toHaveBeenCalledWith('cli'));
    expect(await screen.findByText('Tenants')).toBeInTheDocument();
    expect(screen.getByText('Cliente Um')).toBeInTheDocument();
    expect(screen.getByText('Contatos')).toBeInTheDocument();
    expect(screen.getByText('e mais…')).toBeInTheDocument();
  });

  it('1 char não busca', async () => {
    render(<AdminSearch />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c' } });
    jest.advanceTimersByTime(500);
    expect(search).not.toHaveBeenCalled();
  });

  it('clicar num resultado navega para o href e fecha', async () => {
    search.mockResolvedValue(RESULTS);
    render(<AdminSearch />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cli' } });
    jest.advanceTimersByTime(300);

    const option = await screen.findByText('Cliente Um');
    fireEvent.click(option);

    expect(push).toHaveBeenCalledWith('/admin/tenants/t1');
  });

  it('nada encontrado → mensagem', async () => {
    search.mockResolvedValue({ query: 'zzz', groups: [] });
    render(<AdminSearch />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } });
    jest.advanceTimersByTime(300);
    expect(await screen.findByText('Nada encontrado.')).toBeInTheDocument();
  });
});
