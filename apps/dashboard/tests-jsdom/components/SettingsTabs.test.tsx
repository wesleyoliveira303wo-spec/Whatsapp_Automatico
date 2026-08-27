/**
 * REGRESSÃO (achado real do fundador, 6ª rodada, 2026-08-27): o avatar do
 * rail (WhatsApps) e a engrenagem (Perfil) levam para a MESMA página
 * (`/sessions/:s/settings`), só o `?tab=` muda. Navegação client-side entre
 * dois links da MESMA página NÃO remonta o componente — sem resincronizar o
 * estado, clicar no avatar e depois na engrenagem continuava mostrando
 * WhatsApps (o `initialTab` só valia na primeira montagem).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsTabs from '../../components/SettingsTabs';

jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/sessions/[sessionName]/settings', query: {}, replace: jest.fn() }),
}));
jest.mock('../../hooks/useMe', () => ({
  useMe: () => ({ user: { id: 'u1', email: 'a@b.com', role: 'owner', mustChangePassword: false } }),
}));
jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchTenant: jest.fn().mockResolvedValue({ tenant: { id: 't1', name: 'Empresa' } }),
}));
jest.mock('../../hooks/useSessionsList', () => ({
  useSessionsList: () => ({ sessions: [], loading: false, errorMessage: null, connected: true }),
}));

describe('SettingsTabs — sincronização de aba entre navegações da mesma página', () => {
  it('muda de aba quando `initialTab` muda em props, mesmo sem remontar (simula troca via <Link>)', () => {
    const { rerender: doRerender } = render(
      <SettingsTabs role="owner" hasUser initialTab="whatsapps" />,
    );
    expect(screen.getByRole('tab', { name: /whatsapps/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Simula a navegação avatar -> engrenagem: MESMO componente, prop nova.
    doRerender(<SettingsTabs role="owner" hasUser initialTab="profile" />);

    expect(screen.getByRole('tab', { name: /perfil/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /whatsapps/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
