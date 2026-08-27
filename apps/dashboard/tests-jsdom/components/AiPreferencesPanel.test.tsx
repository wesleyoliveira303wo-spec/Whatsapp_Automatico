/**
 * Cérebro da IA v3, Fase 3 (2026-08-26) — teste do `AiPreferencesPanel`:
 * carregamento, edição de cada controle, salvar (upsert parcial) e o
 * dirty-check/desabilitação de "Salvar" fora dos limites (0-100%, 1-20
 * tentativas).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiPreferencesPanel from '../../components/AiPreferencesPanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchAiPreferences: jest.fn(),
  saveAiPreferences: jest.fn(),
}));

function preferences(overrides: Partial<clientApi.AiPreferences> = {}): clientApi.AiPreferences {
  return {
    tenantId: 'tenant-1',
    sessionName: 'vendas',
    updatedAt: '2026-08-26T00:00:00.000Z',
    autonomyLevel: 'balanced',
    maxDiscountPercent: null,
    topicsToAvoid: null,
    escalateAfterAttempts: null,
    customHandoffMessage: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AiPreferencesPanel (Cérebro da IA v3, Fase 3)', () => {
  it('mostra os defaults quando a sessão nunca configurou preferências', async () => {
    (clientApi.fetchAiPreferences as jest.Mock).mockResolvedValue({ preferences: null });

    render(<AiPreferencesPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Equilibrado/ })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
    expect(screen.getByPlaceholderText('Sem limite configurado')).toHaveValue(null);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('carrega valores já salvos', async () => {
    (clientApi.fetchAiPreferences as jest.Mock).mockResolvedValue({
      preferences: preferences({
        autonomyLevel: 'autonomous',
        maxDiscountPercent: 15,
        topicsToAvoid: 'assuntos jurídicos',
        escalateAfterAttempts: 3,
        customHandoffMessage: 'Já te chamo um humano!',
      }),
    });

    render(<AiPreferencesPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Autônomo/ })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
    expect(screen.getByLabelText('Desconto máximo autônomo')).toHaveValue(15);
    expect(screen.getByLabelText('Assuntos a evitar ou redirecionar')).toHaveValue(
      'assuntos jurídicos',
    );
    expect(screen.getByLabelText('Escalar após N tentativas sem sucesso')).toHaveValue(3);
    expect(screen.getByLabelText('Mensagem de encaminhamento personalizada')).toHaveValue(
      'Já te chamo um humano!',
    );
  });

  it('trocar o nível de autonomia habilita Salvar e persiste ao submeter', async () => {
    (clientApi.fetchAiPreferences as jest.Mock).mockResolvedValue({ preferences: null });
    (clientApi.saveAiPreferences as jest.Mock).mockResolvedValue({
      preferences: preferences({ autonomyLevel: 'autonomous' }),
    });
    render(<AiPreferencesPanel sessionName="vendas" />);
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Autônomo/ })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('radio', { name: /Autônomo/ }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(clientApi.saveAiPreferences).toHaveBeenCalledWith('vendas', {
        autonomyLevel: 'autonomous',
        maxDiscountPercent: null,
        topicsToAvoid: null,
        escalateAfterAttempts: null,
        customHandoffMessage: null,
      });
    });
    expect(await screen.findByText(/Salvo!/)).toBeInTheDocument();
  });

  it('desconto acima de 100% desabilita Salvar e mostra o aviso', async () => {
    (clientApi.fetchAiPreferences as jest.Mock).mockResolvedValue({ preferences: null });
    render(<AiPreferencesPanel sessionName="vendas" />);
    await waitFor(() =>
      expect(screen.getByLabelText('Desconto máximo autônomo')).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('Desconto máximo autônomo'), {
      target: { value: '150' },
    });

    expect(screen.getByText('Informe um valor entre 0 e 100.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('tentativas fora de 1-20 desabilita Salvar e mostra o aviso', async () => {
    (clientApi.fetchAiPreferences as jest.Mock).mockResolvedValue({ preferences: null });
    render(<AiPreferencesPanel sessionName="vendas" />);
    await waitFor(() =>
      expect(screen.getByLabelText('Escalar após N tentativas sem sucesso')).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('Escalar após N tentativas sem sucesso'), {
      target: { value: '0' },
    });

    expect(screen.getByText('Informe um valor entre 1 e 20.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('campo de texto vazio envia null (limpa um valor já salvo)', async () => {
    (clientApi.fetchAiPreferences as jest.Mock).mockResolvedValue({
      preferences: preferences({ topicsToAvoid: 'assuntos jurídicos' }),
    });
    (clientApi.saveAiPreferences as jest.Mock).mockResolvedValue({
      preferences: preferences({ topicsToAvoid: null }),
    });
    render(<AiPreferencesPanel sessionName="vendas" />);
    await waitFor(() =>
      expect(screen.getByLabelText('Assuntos a evitar ou redirecionar')).toHaveValue(
        'assuntos jurídicos',
      ),
    );

    fireEvent.change(screen.getByLabelText('Assuntos a evitar ou redirecionar'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(clientApi.saveAiPreferences).toHaveBeenCalledWith(
        'vendas',
        expect.objectContaining({ topicsToAvoid: null }),
      );
    });
  });

  it('erro 403 ao salvar mostra mensagem amigável', async () => {
    const { ClientApiError } = jest.requireActual('../../lib/clientApi');
    (clientApi.fetchAiPreferences as jest.Mock).mockResolvedValue({ preferences: null });
    (clientApi.saveAiPreferences as jest.Mock).mockRejectedValue(new ClientApiError(403, {}));
    render(<AiPreferencesPanel sessionName="vendas" />);
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Autônomo/ })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('radio', { name: /Autônomo/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Seu cargo não permite editar as preferências da IA (apenas administrador ou dono).',
        ),
      ).toBeInTheDocument();
    });
  });

  it('BUGFIX 2026-08-26: salva normalmente mesmo renderizado DENTRO de outro <form> (AiProfilePanel) — nunca usa <form>/onSubmit próprio, só onClick', async () => {
    (clientApi.fetchAiPreferences as jest.Mock).mockResolvedValue({ preferences: null });
    (clientApi.saveAiPreferences as jest.Mock).mockResolvedValue({
      preferences: preferences({ autonomyLevel: 'autonomous' }),
    });
    // Reproduz exatamente a estrutura real: AiProfilePanel envolve a aba
    // Preferências num <form> próprio. Um <form> aninhado aqui dentro seria
    // HTML inválido e o clique em "Salvar" acabava disparando uma navegação
    // de página inteira em vez do submit — bug real medido ao vivo.
    render(
      <form>
        <AiPreferencesPanel sessionName="vendas" />
      </form>,
    );
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Autônomo/ })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('radio', { name: /Autônomo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(clientApi.saveAiPreferences).toHaveBeenCalledWith(
        'vendas',
        expect.objectContaining({ autonomyLevel: 'autonomous' }),
      );
    });
    expect(await screen.findByText(/Salvo!/)).toBeInTheDocument();
  });

  it('erro no carregamento mostra ErrorState com retry', async () => {
    (clientApi.fetchAiPreferences as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ preferences: null });
    render(<AiPreferencesPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível concluir a ação. Tente novamente.'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => {
      expect(screen.getByRole('radiogroup', { name: 'Nível de autonomia' })).toBeInTheDocument();
    });
  });
});
