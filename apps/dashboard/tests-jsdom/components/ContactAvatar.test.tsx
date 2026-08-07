/**
 * Milestone 6, Bloco M6H-2b — teste do `ContactAvatar` (foto de perfil ao
 * vivo, com fallback de iniciais). `fetchContactAvatar` é mockado (mesmo
 * padrão de `ConversationActions.test.tsx`): o componente não deve fazer
 * chamadas de rede reais em teste.
 */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContactAvatar from '../../components/ContactAvatar';
import * as clientApi from '../../lib/clientApi';
import { __resetContactAvatarCacheForTests } from '../../hooks/useContactAvatar';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchContactAvatar: jest.fn(),
}));

describe('ContactAvatar (Milestone 6, Bloco M6H-2b)', () => {
  beforeEach(() => {
    (clientApi.fetchContactAvatar as jest.Mock)
      .mockReset()
      .mockResolvedValue({ avatarUrl: undefined });
    // CORREÇÃO 2026-07-31: `useContactAvatar` cacheia resultados num `Map` a
    // nível de MÓDULO (deliberado — dedup entre remontagens reais, ver
    // docstring do hook), que sobrevive entre os `it()` deste arquivo. Sem
    // isolar, o teste "mostra as iniciais" (que roda antes e usa o MESMO
    // sessionName/contactJid) grava "sem foto" no cache; quando o teste
    // "renderiza a foto" roda em seguida, `hasFreshCacheEntry` encontra essa
    // entrada ainda dentro do TTL de 60s e nunca chama `fetchContactAvatar`
    // de novo — o mock com a URL nova fica sem efeito.
    __resetContactAvatarCacheForTests();
  });

  it('mostra as iniciais do contactName enquanto não há foto', async () => {
    render(
      <ContactAvatar
        sessionName="vendas"
        contactJid="5511999999999@s.whatsapp.net"
        contactName="Maria Silva"
      />,
    );

    expect(await screen.findByText('MS')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('cai para os últimos 2 dígitos do número quando não há contactName nem foto', async () => {
    render(<ContactAvatar sessionName="vendas" contactJid="5511999999999@s.whatsapp.net" />);
    expect(await screen.findByText('99')).toBeInTheDocument();
  });

  it('renderiza a foto quando fetchContactAvatar resolve com avatarUrl', async () => {
    (clientApi.fetchContactAvatar as jest.Mock).mockResolvedValue({
      avatarUrl: 'https://pps.whatsapp.net/fake-avatar.jpg',
    });

    render(
      <ContactAvatar
        sessionName="vendas"
        contactJid="5511999999999@s.whatsapp.net"
        contactName="Maria Silva"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('img')).toHaveAttribute(
        'src',
        'https://pps.whatsapp.net/fake-avatar.jpg',
      );
    });
    expect(screen.queryByText('MS')).not.toBeInTheDocument();
  });

  it('cai para as iniciais quando fetchContactAvatar rejeita (falha silenciosa)', async () => {
    (clientApi.fetchContactAvatar as jest.Mock).mockRejectedValue(new Error('falhou'));

    render(
      <ContactAvatar
        sessionName="vendas"
        contactJid="5511999999999@s.whatsapp.net"
        contactName="Maria Silva"
      />,
    );

    expect(await screen.findByText('MS')).toBeInTheDocument();
  });
});
