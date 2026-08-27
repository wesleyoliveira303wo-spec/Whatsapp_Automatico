/**
 * Cérebro da IA v3 (2026-08-25) — reestruturação em abas: "Visão geral"
 * (resumo real + Horário de atendimento, era sempre visível embaixo),
 * "Conhecimento" (era "Texto livre"), "Assistente Guiado" (quiz, ADR
 * #71/#85), "FAQ" (entidade estruturada própria, `AiFaqPanel` — substitui
 * o antigo diálogo "Cadastrar pergunta não respondida", ADR #86, removido)
 * e "Preferências" (v3, Fase 3, 2026-08-26 — `AiPreferencesPanel`).
 *
 * Teste do `AiProfilePanel`: carregamento, alternância entre as abas, e a
 * regra de ADIÇÃO do quiz (sempre anexa ao texto existente, nunca
 * substitui — correção 2026-07-30).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiProfilePanel from '../../components/AiProfilePanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchAiProfile: jest.fn(),
  saveAiProfile: jest.fn(),
  fetchAiFaqEntries: jest.fn(),
  fetchAiPreferences: jest.fn(),
  saveAiPreferences: jest.fn(),
}));

beforeEach(() => {
  (clientApi.fetchAiProfile as jest.Mock).mockReset();
  (clientApi.saveAiProfile as jest.Mock).mockReset();
  (clientApi.fetchAiFaqEntries as jest.Mock).mockReset().mockResolvedValue({ faqEntries: [] });
  (clientApi.fetchAiPreferences as jest.Mock).mockReset().mockResolvedValue({ preferences: null });
  (clientApi.saveAiPreferences as jest.Mock).mockReset();
});

describe('AiProfilePanel (Cérebro da IA v3 — 4 abas)', () => {
  it('abre na aba Visão geral por padrão, mostrando o resumo e o horário de atendimento', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({
      profile: {
        tenantId: 't1',
        sessionName: 'vendas',
        content: 'Perfil existente',
        updatedAt: '2026-07-30T09:00:00.000Z',
      },
    });

    render(<AiProfilePanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Visão geral/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
    // Cabeçalho padronizado (2026-08-26) — `TabSectionHeader` desenha um
    // `<h2>` "Visão geral" (mesmo texto do rótulo da aba, mas role distinta).
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByText('Horário de atendimento')).toBeInTheDocument();
    // Conteúdo carregado não fica visível na Visão geral (é a aba Conhecimento) —
    // mas o resumo reflete que a base NÃO está vazia.
    expect(screen.getByText('Preenchida')).toBeInTheDocument();
  });

  it('troca para a aba Conhecimento e mostra o texto carregado', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({
      profile: {
        tenantId: 't1',
        sessionName: 'vendas',
        content: 'Perfil existente',
        updatedAt: '2026-07-30T09:00:00.000Z',
      },
    });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Visão geral/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: 'Conhecimento' }));

    expect(screen.getByDisplayValue('Perfil existente')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Conhecimento' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('troca para a aba Assistente Guiado ao clicar', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);

    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Assistente Guiado/ }));

    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Assistente Guiado/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('troca para a aba FAQ e monta o AiFaqPanel', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: 'FAQ' }));

    expect(screen.getByRole('tab', { name: 'FAQ' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Pergunta que o cliente costuma fazer/)).toBeInTheDocument();
    });
  });

  it('troca para a aba Preferências e monta o AiPreferencesPanel (Cérebro da IA v3, Fase 3)', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: 'Preferências' }));

    expect(screen.getByRole('tab', { name: 'Preferências' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await waitFor(() => {
      expect(clientApi.fetchAiPreferences).toHaveBeenCalledWith('vendas');
    });
    expect(screen.getByRole('radiogroup', { name: 'Nível de autonomia' })).toBeInTheDocument();
  });

  it('ao gerar o texto pelo quiz, vai para a aba Conhecimento com o conteúdo preenchido e mostra o aviso de origem', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /Assistente Guiado/ }));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Loja X' } });
    // 9 passos no total: 8 perguntas essenciais + 1 seção "Avançado"
    // (Observações) — ver `STEPS` em `AiProfileQuizWizard.tsx`.
    //
    // `findByRole` (em vez de `getByRole`) força esperar o React commitar o
    // re-render do passo anterior antes do próximo clique — sem isso, 9
    // `fireEvent.click` síncronos correm o risco de "perder" um avanço de
    // `stepIndex` quando o scheduler do React 18 resolve microtasks num
    // timing ligeiramente diferente entre sistemas operacionais.
    for (let i = 0; i < 9; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sincronização deliberada passo a passo, ver comentário acima.
      const button = await screen.findByRole('button', { name: /Próxima|Gerar texto/ });
      fireEvent.click(button);
    }

    expect(screen.getByRole('tab', { name: 'Conhecimento' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByDisplayValue('- Nome: Loja X')).toBeInTheDocument();
    expect(screen.getByText(/foram adicionadas ao final do texto/)).toBeInTheDocument();
  });

  it('correção 2026-07-30 (ADR #87): gerar o texto pelo quiz NUNCA apaga o conteúdo já existente — só anexa ao final', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({
      profile: {
        tenantId: 't1',
        sessionName: 'vendas',
        content: '- Nome existente',
        updatedAt: '2026-07-30T09:00:00.000Z',
      },
    });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /Assistente Guiado/ }));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Loja X' } });
    for (let i = 0; i < 9; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sincronização deliberada passo a passo.
      const button = await screen.findByRole('button', { name: /Próxima|Gerar texto/ });
      fireEvent.click(button);
    }

    expect(
      screen.getByDisplayValue('- Nome existente\n\n- Nome: Loja X', {
        normalizer: (text) => text,
      }),
    ).toBeInTheDocument();
  });

  it('editar manualmente o texto some com o aviso de "acabou de adicionar" do quiz', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /Assistente Guiado/ }));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Loja X' } });
    for (let i = 0; i < 9; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sincronização deliberada passo a passo.
      const button = await screen.findByRole('button', { name: /Próxima|Gerar texto/ });
      fireEvent.click(button);
    }
    expect(screen.getByText(/foram adicionadas ao final do texto/)).toBeInTheDocument();

    const textarea = screen.getByDisplayValue('- Nome: Loja X');
    fireEvent.change(textarea, { target: { value: '- Nome: Loja X editado à mão' } });

    expect(screen.queryByText(/foram adicionadas ao final do texto/)).not.toBeInTheDocument();
  });

  it('salva o conteúdo da aba Conhecimento chamando saveAiProfile com o objeto completo (F1.8)', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    (clientApi.saveAiProfile as jest.Mock).mockResolvedValue({
      profile: {
        tenantId: 't1',
        sessionName: 'vendas',
        content: 'Texto novo',
        updatedAt: '2026-07-30T10:00:00.000Z',
        offHoursEnabled: false,
        offHoursMessage: null,
        workingHoursStart: null,
        workingHoursEnd: null,
        workingDays: 62,
        timezone: 'America/Sao_Paulo',
      },
    });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Conhecimento' }));

    const textarea = screen.getByPlaceholderText(/Descreva sua empresa/);
    fireEvent.change(textarea, { target: { value: 'Texto novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      // F1.8: saveAiProfile agora recebe um objeto, não só uma string
      expect(clientApi.saveAiProfile).toHaveBeenCalledWith(
        'vendas',
        expect.objectContaining({ content: 'Texto novo', offHoursEnabled: false, workingDays: 62 }),
      );
      expect(screen.getByText(/Salvo!/)).toBeInTheDocument();
    });
  });
});

describe('AiProfilePanel — Horário de atendimento (F1.8, agora na aba Visão geral)', () => {
  it('mostra a seção "Horário de atendimento" com o toggle desligado por padrão', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    expect(screen.getByText('Horário de atendimento')).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: /Enviar aviso automático/i });
    expect(toggle).not.toBeChecked();
    // Com toggle desligado, os campos de configuração não aparecem
    expect(screen.queryByLabelText('Das')).not.toBeInTheDocument();
  });

  it('ligar o toggle exibe os campos de configuração (dias, horários, fuso, mensagem)', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('switch', { name: /Enviar aviso automático/i }));

    expect(screen.getByLabelText('Das')).toBeInTheDocument();
    expect(screen.getByLabelText('Até')).toBeInTheDocument();
    expect(screen.getByLabelText('Fuso horário')).toBeInTheDocument();
    expect(screen.getByLabelText(/Mensagem fora do expediente/i)).toBeInTheDocument();
    // Dias da semana: botões de toggle por dia
    expect(screen.getByRole('button', { name: 'Seg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dom' })).toBeInTheDocument();
  });

  it('ligar o toggle habilita o Salvar de reserva (marca dirty) na aba Visão geral', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('switch', { name: /Enviar aviso automático/i }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  it('o resumo mostra "Ativo"/"Desativado" de acordo com o toggle', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    expect(screen.getByText('Desativado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: /Enviar aviso automático/i }));
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });
});
