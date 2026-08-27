/**
 * Reorganização Perfil/Configurações (2026-08-27) — a marca deixou de ser
 * um link: "voltar a todos os WhatsApps" migrou para o avatar do usuário no
 * topo do `SessionRail` (ver DECISIONS.md #106).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionHeader from '../../components/SessionHeader';
import * as useSessionDetailModule from '../../hooks/useSessionDetail';
import * as aiToggleContextModule from '../../contexts/AiToggleContext';
import * as clientApi from '../../lib/clientApi';

const push = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push }) }));
jest.mock('../../hooks/useSessionDetail');
jest.mock('../../contexts/AiToggleContext');
jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  logout: jest.fn(),
}));

const mockUseSessionDetail = useSessionDetailModule.useSessionDetail as jest.Mock;
const mockUseAiToggleContext = aiToggleContextModule.useAiToggleContext as jest.Mock;

describe('SessionHeader (correção 2026-08-07)', () => {
  beforeEach(() => {
    push.mockClear();
    (clientApi.logout as jest.Mock).mockReset().mockResolvedValue(undefined);
    mockUseSessionDetail.mockReturnValue({
      session: null,
      loading: true,
      errorMessage: null,
      connected: true,
    });
    // Fase 1 (Botão POWER) — mockado aqui só para isolar este teste; ver
    // AiPowerToggle.test.tsx para a cobertura do próprio botão.
    mockUseAiToggleContext.mockReturnValue({
      aiEnabled: true,
      loading: false,
      errorMessage: null,
      toggle: jest.fn(),
    });
  });

  it('a marca NÃO é mais um link (o avatar do usuário no rail assumiu esse papel)', () => {
    render(<SessionHeader sessionName="vendas" />);
    expect(screen.queryByRole('link', { name: /francis/i })).not.toBeInTheDocument();
    expect(screen.getByText('Francis')).toBeInTheDocument();
  });

  it('mostra nome da sessão e status quando useSessionDetail já resolveu', () => {
    mockUseSessionDetail.mockReturnValue({
      session: {
        id: 's1',
        tenantId: 't1',
        sessionName: 'vendas',
        provider: 'baileys',
        status: 'connected',
      },
      loading: false,
      errorMessage: null,
      connected: true,
    });
    render(<SessionHeader sessionName="vendas" />);
    expect(screen.getByText('vendas')).toBeInTheDocument();
    expect(screen.getByText('Conectado')).toBeInTheDocument();
  });

  it('Fase 1 (Botão POWER): renderiza o AiPowerToggle no cabeçalho', () => {
    render(<SessionHeader sessionName="vendas" />);
    expect(
      screen.getByRole('button', { name: /IA aguardando novas mensagens/i }),
    ).toBeInTheDocument();
  });

  /**
   * CORREÇÃO 2026-08-27 (pedido do fundador): "Sair" só existia dentro de
   * Configurações → Perfil → Segurança, dificultando a usabilidade. Ícone
   * de porta adicionado ao cabeçalho, ao lado do status da sessão.
   */
  it('mostra o botão "Sair" (ícone de porta) no cabeçalho', () => {
    render(<SessionHeader sessionName="vendas" />);
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('ao clicar em "Sair": desloga e redireciona para /login', async () => {
    render(<SessionHeader sessionName="vendas" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => {
      expect(clientApi.logout).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith('/login');
    });
  });
});
