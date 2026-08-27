/** Reorganização Perfil/Configurações (2026-08-27) — aba "Empresa". */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CompanySettingsTab from '../../components/CompanySettingsTab';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchTenant: jest.fn(),
  updateTenantName: jest.fn(),
}));

describe('CompanySettingsTab', () => {
  beforeEach(() => {
    (clientApi.fetchTenant as jest.Mock).mockReset();
    (clientApi.updateTenantName as jest.Mock).mockReset();
  });

  it('carrega e mostra o nome da empresa', async () => {
    (clientApi.fetchTenant as jest.Mock).mockResolvedValue({
      tenant: { id: 't1', name: 'Empresa Original' },
    });
    render(<CompanySettingsTab canManage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Empresa Original')).toBeInTheDocument();
    });
  });

  it('canManage=false: campo desabilitado, sem botão salvar', async () => {
    (clientApi.fetchTenant as jest.Mock).mockResolvedValue({
      tenant: { id: 't1', name: 'Empresa Original' },
    });
    render(<CompanySettingsTab canManage={false} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Empresa Original')).toBeDisabled();
    });
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });

  it('canManage=true: salva e mostra mensagem de sucesso', async () => {
    (clientApi.fetchTenant as jest.Mock).mockResolvedValue({
      tenant: { id: 't1', name: 'Empresa Original' },
    });
    (clientApi.updateTenantName as jest.Mock).mockResolvedValue({
      tenant: { id: 't1', name: 'Novo Nome' },
    });
    render(<CompanySettingsTab canManage />);
    await waitFor(() => screen.getByDisplayValue('Empresa Original'));

    fireEvent.change(screen.getByLabelText('Nome da empresa'), {
      target: { value: 'Novo Nome' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(clientApi.updateTenantName).toHaveBeenCalledWith('Novo Nome');
      expect(screen.getByText('Nome da empresa atualizado.')).toBeInTheDocument();
    });
  });

  it('403 (sem tenant:manage): mostra mensagem de erro específica', async () => {
    (clientApi.fetchTenant as jest.Mock).mockResolvedValue({
      tenant: { id: 't1', name: 'Empresa Original' },
    });
    (clientApi.updateTenantName as jest.Mock).mockRejectedValue(
      new clientApi.ClientApiError(403, {}),
    );
    render(<CompanySettingsTab canManage />);
    await waitFor(() => screen.getByDisplayValue('Empresa Original'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(screen.getByText(/só o dono da conta pode alterar/i)).toBeInTheDocument();
    });
  });
});
