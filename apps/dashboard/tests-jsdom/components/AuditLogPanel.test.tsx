/**
 * Fase 1, Bloco F1.5 — teste do `AuditLogPanel`: painel só de leitura (lista
 * + filtro por ação + "Carregar mais"), mesma casca de `UserManagementPanel`
 * mas sem formulário de criação.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuditLogPanel from '../../components/AuditLogPanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchAuditLogs: jest.fn(),
}));

function entry(over: Partial<clientApi.AuditLogEntry> = {}): clientApi.AuditLogEntry {
  return {
    id: 'log-1',
    tenantId: 'tenant-1',
    action: 'auth.login.success',
    actorUserId: 'user-1',
    occurredAt: '2026-07-31T12:00:00.000Z',
    ...over,
  };
}

describe('AuditLogPanel (Fase 1, Bloco F1.5)', () => {
  beforeEach(() => {
    (clientApi.fetchAuditLogs as jest.Mock).mockReset();
  });

  it('carrega e lista os eventos ao montar', async () => {
    (clientApi.fetchAuditLogs as jest.Mock).mockResolvedValue({
      entries: [entry()],
      nextCursor: undefined,
    });

    render(<AuditLogPanel />);

    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
    expect(clientApi.fetchAuditLogs).toHaveBeenCalledWith({ limit: 50, action: undefined });
  });

  it('mostra mensagem de lista vazia quando não há eventos', async () => {
    (clientApi.fetchAuditLogs as jest.Mock).mockResolvedValue({
      entries: [],
      nextCursor: undefined,
    });

    render(<AuditLogPanel />);

    await waitFor(() => {
      expect(screen.getByText('Nenhum evento de auditoria ainda.')).toBeInTheDocument();
    });
  });

  it('traduz uma ação desconhecida (fora do catálogo) usando a própria string como fallback', async () => {
    (clientApi.fetchAuditLogs as jest.Mock).mockResolvedValue({
      entries: [entry({ action: 'algo.novo.ainda_nao_catalogado' })],
      nextCursor: undefined,
    });

    render(<AuditLogPanel />);

    await waitFor(() => {
      expect(screen.getByText('algo.novo.ainda_nao_catalogado')).toBeInTheDocument();
    });
  });

  it('mostra "Carregar mais" quando há nextCursor, e busca a próxima página ao clicar', async () => {
    (clientApi.fetchAuditLogs as jest.Mock)
      .mockResolvedValueOnce({ entries: [entry({ id: 'log-1' })], nextCursor: 'log-1' })
      .mockResolvedValueOnce({
        entries: [entry({ id: 'log-2', action: 'auth.logout' })],
        nextCursor: undefined,
      });

    render(<AuditLogPanel />);

    await waitFor(() => expect(screen.getByText('Carregar mais')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Carregar mais'));

    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });
    expect(clientApi.fetchAuditLogs).toHaveBeenLastCalledWith({
      limit: 50,
      cursor: 'log-1',
      action: undefined,
    });
  });

  it('filtra por ação assim que troca a seleção no dropdown (reskin 2026-08-07: sem botão "Filtrar" separado, igual ao mockup)', async () => {
    (clientApi.fetchAuditLogs as jest.Mock).mockResolvedValue({
      entries: [entry()],
      nextCursor: undefined,
    });

    render(<AuditLogPanel />);
    await waitFor(() => expect(clientApi.fetchAuditLogs).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Filtrar por ação'), {
      target: { value: 'auth.logout' },
    });

    await waitFor(() => {
      expect(clientApi.fetchAuditLogs).toHaveBeenLastCalledWith({
        limit: 50,
        action: 'auth.logout',
      });
    });
  });

  it('mostra mensagem de erro amigável em caso de 403 (sem permissão)', async () => {
    const { ClientApiError } = jest.requireActual('../../lib/clientApi');
    (clientApi.fetchAuditLogs as jest.Mock).mockRejectedValue(
      new ClientApiError(403, { error: 'forbidden' }),
    );

    render(<AuditLogPanel />);

    await waitFor(() => {
      expect(screen.getByText('Sem permissão para ver a auditoria.')).toBeInTheDocument();
    });
  });

  it('exibe o alvo (targetType + targetId) quando presente, e travessão quando ausente', async () => {
    (clientApi.fetchAuditLogs as jest.Mock).mockResolvedValue({
      entries: [entry({ targetType: 'user', targetId: 'user-42' })],
      nextCursor: undefined,
    });

    render(<AuditLogPanel />);

    await waitFor(() => {
      expect(screen.getByText('user · user-42')).toBeInTheDocument();
    });
  });
});
