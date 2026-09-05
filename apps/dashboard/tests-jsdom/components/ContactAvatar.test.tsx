/**
 * `ContactAvatar` — foto de perfil com fallback de iniciais (Milestone 6,
 * Bloco M6H-2b), reescrito no Bloco B2 (issue #13): a busca deixou de ser
 * uma consulta ao vivo por avatar e passou a ser um LOTE servido do cache do
 * servidor (`fetchContactAvatars`), então é essa a função mockada aqui.
 */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContactAvatar from '../../components/ContactAvatar';
import * as clientApi from '../../lib/clientApi';
import { __resetContactAvatarCacheForTests } from '../../hooks/useContactAvatar';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchContactAvatars: jest.fn(),
}));

const JID = '5511999999999@s.whatsapp.net';

describe('ContactAvatar', () => {
  beforeEach(() => {
    (clientApi.fetchContactAvatars as jest.Mock)
      .mockReset()
      .mockResolvedValue({ avatars: [{ contactJid: JID }] });
    // O cache de `useContactAvatar` é a nível de MÓDULO (deliberado — dedup
    // entre remontagens reais, ver docstring do hook) e sobrevive entre os
    // `it()` deste arquivo. Sem isolar, o resultado "sem foto" de um teste
    // deixaria o mock do teste seguinte sem efeito.
    __resetContactAvatarCacheForTests();
  });

  it('mostra as iniciais do contactName enquanto não há foto', async () => {
    render(<ContactAvatar sessionName="vendas" contactJid={JID} contactName="Maria Silva" />);

    expect(await screen.findByText('MS')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('cai para os últimos 2 dígitos do número quando não há contactName nem foto', async () => {
    render(<ContactAvatar sessionName="vendas" contactJid={JID} />);
    expect(await screen.findByText('99')).toBeInTheDocument();
  });

  it('renderiza a foto que vem no lote', async () => {
    (clientApi.fetchContactAvatars as jest.Mock).mockResolvedValue({
      avatars: [{ contactJid: JID, avatarUrl: 'https://pps.whatsapp.net/fake-avatar.jpg' }],
    });

    render(<ContactAvatar sessionName="vendas" contactJid={JID} contactName="Maria Silva" />);

    await waitFor(() => {
      expect(screen.getByRole('img')).toHaveAttribute(
        'src',
        'https://pps.whatsapp.net/fake-avatar.jpg',
      );
    });
    expect(screen.queryByText('MS')).not.toBeInTheDocument();
  });

  it('cai para as iniciais quando a busca rejeita (falha silenciosa)', async () => {
    (clientApi.fetchContactAvatars as jest.Mock).mockRejectedValue(new Error('falhou'));

    render(<ContactAvatar sessionName="vendas" contactJid={JID} contactName="Maria Silva" />);

    expect(await screen.findByText('MS')).toBeInTheDocument();
  });

  it('SEM sessionName não pede nada (contato salvo que nunca conversou)', async () => {
    render(<ContactAvatar contactJid={JID} contactName="Maria Silva" />);

    expect(await screen.findByText('MS')).toBeInTheDocument();
    await waitFor(() => expect(clientApi.fetchContactAvatars).not.toHaveBeenCalled());
  });

  it('vários avatares da mesma tela viram UMA requisição só (o ponto do bloco B2)', async () => {
    (clientApi.fetchContactAvatars as jest.Mock).mockResolvedValue({
      avatars: [
        { contactJid: 'a@s.whatsapp.net', avatarUrl: 'https://cdn/a.jpg' },
        { contactJid: 'b@s.whatsapp.net' },
        { contactJid: 'c@s.whatsapp.net' },
      ],
    });

    render(
      <div>
        <ContactAvatar sessionName="vendas" contactJid="a@s.whatsapp.net" contactName="Ana" />
        <ContactAvatar sessionName="vendas" contactJid="b@s.whatsapp.net" contactName="Bruno" />
        <ContactAvatar sessionName="vendas" contactJid="c@s.whatsapp.net" contactName="Carla" />
      </div>,
    );

    await waitFor(() => expect(clientApi.fetchContactAvatars).toHaveBeenCalledTimes(1));
    expect(clientApi.fetchContactAvatars).toHaveBeenCalledWith('vendas', [
      'a@s.whatsapp.net',
      'b@s.whatsapp.net',
      'c@s.whatsapp.net',
    ]);
    // E quem tem foto mostra a foto; os outros dois seguem nas iniciais
    // (uma única <img> em três avatares).
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1));
  });
});
