/**
 * Correção 2026-08-07 (2ª rodada, pedido do fundador): a marca do
 * `SessionHeader` voltou a ser um link para "/" — "voltar a todos os
 * WhatsApps" migrou do ícone do topo do `SessionRail` (que virou a foto de
 * perfil do WhatsApp conectado, puramente visual) para cá. Primeiro teste
 * deste componente (gap pré-existente, fechado agora).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionHeader from '../../components/SessionHeader';
import * as useSessionDetailModule from '../../hooks/useSessionDetail';
import * as aiToggleContextModule from '../../contexts/AiToggleContext';

jest.mock('../../hooks/useSessionDetail');
jest.mock('../../contexts/AiToggleContext');

const mockUseSessionDetail = useSessionDetailModule.useSessionDetail as jest.Mock;
const mockUseAiToggleContext = aiToggleContextModule.useAiToggleContext as jest.Mock;

describe('SessionHeader (correção 2026-08-07)', () => {
  beforeEach(() => {
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

  it('a marca é um link para "/" (voltar para Todos os WhatsApps)', () => {
    render(<SessionHeader sessionName="vendas" />);
    const link = screen.getByRole('link', { name: /francis/i });
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveAttribute('title', 'Voltar para Todos os WhatsApps');
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
});
