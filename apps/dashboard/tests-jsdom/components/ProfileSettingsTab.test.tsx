/**
 * Reorganização Perfil/Configurações (2026-08-27) — aba "Perfil" (Minha
 * conta/Segurança). Item 13 da missão: prova que os dados exibidos
 * pertencem ao usuário LOGADO (via `useMe`), e que editar o próprio nome
 * chama a API certa. Upload de foto tem os próprios testes de orquestração
 * em `EditableAvatar.test.tsx` — aqui só confirma que a peça está montada e
 * ligada ao `updateMyProfile` certo (não reimplementa mock de canvas/Image).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfileSettingsTab from '../../components/ProfileSettingsTab';
import * as useMeModule from '../../hooks/useMe';
import * as clientApi from '../../lib/clientApi';
import * as imageResize from '../../lib/imageResize';

jest.mock('../../hooks/useMe');
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchTenant: jest.fn(),
  updateMyProfile: jest.fn(),
  updateTenantName: jest.fn(),
  logout: jest.fn(),
}));
jest.mock('../../lib/imageResize', () => ({
  ...jest.requireActual('../../lib/imageResize'),
  resizeImageToDataUrl: jest.fn(),
}));
// "Horário de atendimento"/"Sobre o negócio" (Auditoria do Perfil,
// 2026-08-28) buscam a lista de sessões via SSE (`useSessionsList` →
// `useEventSource` → `EventSource`, ausente no jsdom) — mockado vazio, mesmo
// padrão de `SettingsTabs.test.tsx`. As duas seções têm os próprios testes
// em `BusinessOverviewSections.test.tsx`.
jest.mock('../../hooks/useSessionsList', () => ({
  useSessionsList: () => ({ sessions: [], loading: false, errorMessage: null, connected: true }),
}));

const mockUseMe = useMeModule.useMe as jest.Mock;

describe('ProfileSettingsTab', () => {
  beforeEach(() => {
    (clientApi.fetchTenant as jest.Mock).mockResolvedValue({
      tenant: { id: 't1', name: 'Empresa Teste' },
    });
    (clientApi.updateMyProfile as jest.Mock).mockReset();
  });

  it('mostra e-mail, cargo e empresa do usuário LOGADO (useMe)', async () => {
    mockUseMe.mockReturnValue({
      user: {
        id: 'u1',
        email: 'wesley@empresa.com',
        role: 'owner',
        mustChangePassword: false,
      },
    });
    render(<ProfileSettingsTab />);
    // Aparece 2x: como título (sem nome, cai no e-mail) e no campo "E-mail".
    expect(screen.getAllByText('wesley@empresa.com').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Dono/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Empresa Teste/)).toBeInTheDocument();
    });
  });

  it('sessão de API key (user: null): não renderiza nada', () => {
    mockUseMe.mockReturnValue({ user: null });
    const { container } = render(<ProfileSettingsTab />);
    expect(container).toBeEmptyDOMElement();
  });

  it('edita o nome e salva via updateMyProfile', async () => {
    mockUseMe.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'operator', mustChangePassword: false },
    });
    (clientApi.updateMyProfile as jest.Mock).mockResolvedValue({
      tenantId: 't1',
      user: { id: 'u1', email: 'a@b.com', role: 'operator', mustChangePassword: false, name: 'Ana' },
    });
    render(<ProfileSettingsTab />);

    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      // Auditoria do Perfil (2026-08-28, Fase 4): o formulário de nome não
      // envia mais `avatarUrl` — a foto é upload próprio (`EditableAvatar`),
      // salva sozinha, sem passar pelo botão "Salvar" deste formulário.
      expect(clientApi.updateMyProfile).toHaveBeenCalledWith({ name: 'Ana' });
      expect(screen.getByText('Perfil atualizado.')).toBeInTheDocument();
    });

    // Regressão (achado ao testar manualmente nesta sessão): `useMe()` só
    // busca uma vez por montagem — sem sobrepor com o retorno da API, o
    // título continuaria mostrando "a@b.com" (o e-mail) mesmo depois de
    // salvar "Ana" como nome, até um F5.
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('a@b.com', { selector: 'p.font-semibold' })).not.toBeInTheDocument();
  });

  /**
   * Auditoria do Perfil (2026-08-28, pedido explícito do fundador): "Dados
   * da empresa" SAIU de Configurações e voltou para o Perfil (movimento
   * inverso da Fase 4 de 2026-08-27) — o nome comercial é a identidade da
   * empresa que a PESSOA representa, não administração técnica do
   * workspace. Continua sendo o MESMO campo (`Tenant.name`), só o lugar
   * que edita mudou de novo — nunca duas telas salvando o mesmo campo (ver
   * `SettingsSidebar`/`SettingsLayout`, que perderam a seção "empresa").
   */
  it('owner edita o nome da empresa aqui, via updateTenantName', async () => {
    mockUseMe.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'owner', mustChangePassword: false },
    });
    (clientApi.updateTenantName as jest.Mock).mockResolvedValue({
      tenant: { id: 't1', name: 'Empresa Nova' },
    });
    render(<ProfileSettingsTab canManageCompany />);

    // "Editar" aparece 2x (Minha conta e Informações da empresa) — a 2ª,
    // na ordem em que as seções aparecem na tela, é a da empresa.
    const editButtons = await screen.findAllByRole('button', { name: /editar/i });
    fireEvent.click(editButtons[1]);
    fireEvent.change(await screen.findByLabelText('Nome comercial'), {
      target: { value: 'Empresa Nova' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(clientApi.updateTenantName).toHaveBeenCalledWith('Empresa Nova');
      expect(screen.getByText('Nome da empresa atualizado.')).toBeInTheDocument();
    });
  });

  it('operator (sem canManageCompany): vê o nome da empresa, sem botão de editar', async () => {
    mockUseMe.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'operator', mustChangePassword: false },
    });
    render(<ProfileSettingsTab canManageCompany={false} />);
    await waitFor(() => expect(screen.getAllByText('Empresa Teste').length).toBeGreaterThan(0));
    expect(
      screen.getByText('Só o dono da conta pode alterar o nome da empresa.'),
    ).toBeInTheDocument();
  });

  it('as 5 seções do Perfil: conta, empresa, horário, negócio e segurança', async () => {
    mockUseMe.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'owner', mustChangePassword: false },
    });
    render(<ProfileSettingsTab />);
    await waitFor(() => expect(screen.getByText('Minha conta')).toBeInTheDocument());
    expect(screen.getByText('Informações da empresa')).toBeInTheDocument();
    expect(screen.getByText('Horário de atendimento')).toBeInTheDocument();
    expect(screen.getByText('Sobre o negócio')).toBeInTheDocument();
    expect(screen.getByText('Segurança')).toBeInTheDocument();
    // Nada de workspace aqui: equipe/auditoria/WhatsApps são Configurações.
    expect(screen.queryByText('Equipe')).not.toBeInTheDocument();
    expect(screen.queryByText('Auditoria')).not.toBeInTheDocument();
  });

  // Auditoria do Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fase 2/3) —
  // "Preferências" deixou de ser seção própria. "Status" (sempre "Ativo" —
  // quem está suspenso nunca chega a ver esta tela) virou "Membro desde"/
  // "Último acesso", que de fato agregam contexto.
  //
  // 2026-08-28 (pedido do fundador) — o controle de tema saiu do Perfil por
  // completo: já existe o mesmo botão na barra da esquerda, e dois controles
  // da mesma coisa confundem.
  it('não tem "Preferências" nem controle de tema (mora só na barra da esquerda)', async () => {
    mockUseMe.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'owner', mustChangePassword: false },
    });
    render(<ProfileSettingsTab />);
    await waitFor(() => expect(screen.getByText('Minha conta')).toBeInTheDocument());
    expect(screen.queryByText('Preferências')).not.toBeInTheDocument();
    expect(screen.queryByText('Tema escuro')).not.toBeInTheDocument();
  });

  it('mostra "Membro desde" e "Último acesso" no lugar do antigo "Status"', async () => {
    mockUseMe.mockReturnValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        role: 'owner',
        mustChangePassword: false,
        createdAt: '2026-01-15T12:00:00.000Z',
        lastLoginAt: '2026-08-27T09:30:00.000Z',
      },
    });
    render(<ProfileSettingsTab />);
    await waitFor(() => expect(screen.getByText('Membro desde')).toBeInTheDocument());
    expect(screen.getByText('15/01/2026')).toBeInTheDocument();
    expect(screen.getByText('Último acesso')).toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Ativo')).not.toBeInTheDocument();
  });

  it('sem createdAt/lastLoginAt (conta antiga), degrada para "—" em vez de quebrar', async () => {
    mockUseMe.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'owner', mustChangePassword: false },
    });
    render(<ProfileSettingsTab />);
    await waitFor(() => expect(screen.getByText('Membro desde')).toBeInTheDocument());
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  // Auditoria do Perfil (2026-08-28, Fase 4) — o campo de texto "URL da
  // foto" saiu; upload de arquivo é a única forma de trocar a foto agora.
  it('não existe mais o campo de texto "URL da foto"', async () => {
    mockUseMe.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'owner', mustChangePassword: false },
    });
    render(<ProfileSettingsTab />);
    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    expect(screen.queryByLabelText('URL da foto')).not.toBeInTheDocument();
  });

  it('upload de foto chama updateMyProfile só com avatarUrl (nome não muda junto)', async () => {
    mockUseMe.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'owner', mustChangePassword: false },
    });
    (imageResize.resizeImageToDataUrl as jest.Mock).mockResolvedValue(
      'data:image/jpeg;base64,AAAA',
    );
    (clientApi.updateMyProfile as jest.Mock).mockResolvedValue({
      tenantId: 't1',
      user: {
        id: 'u1',
        email: 'a@b.com',
        role: 'owner',
        mustChangePassword: false,
        avatarUrl: 'data:image/jpeg;base64,AAAA',
      },
    });
    render(<ProfileSettingsTab />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1])], 'foto.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(clientApi.updateMyProfile).toHaveBeenCalledWith({
        avatarUrl: 'data:image/jpeg;base64,AAAA',
      });
    });
  });

  it('senha provisória pendente aparece como aviso acionável (não mais em "Status")', async () => {
    mockUseMe.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'operator', mustChangePassword: true },
    });
    render(<ProfileSettingsTab />);
    await waitFor(() =>
      expect(
        screen.getByText('Senha provisória pendente — troque-a na seção Segurança abaixo.'),
      ).toBeInTheDocument(),
    );
  });
});
