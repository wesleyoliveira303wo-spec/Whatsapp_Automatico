/**
 * Cérebro da IA (Nível 1 + v2 "Assistente Guiado", ADR #71/#85/#87). Teste
 * do `AiProfilePanel`: carregamento, alternância entre as abas Assistente
 * Guiado / Texto livre, e a regra de ADIÇÃO (o quiz e a FAQ manual sempre
 * anexam ao texto existente, nunca substituem — correção 2026-07-30).
 *
 * CORREÇÃO 2026-07-31 (bug pré-existente do teste, sem relação com o
 * Pipeline): os loops que percorrem o wizard clicavam "Próxima/Gerar texto"
 * só 8 vezes, contando apenas as perguntas ESSENCIAIS — mas
 * `AiProfileQuizWizard.STEPS` tem 9 passos (8 essenciais + 1 seção
 * "Avançado"/Observações). Com 8 cliques o wizard parava um passo antes do
 * fim ("Observações"), nunca chamava `onGenerate`, e as asserções seguintes
 * (que esperavam ter voltado para "Texto livre" com o texto gerado)
 * falhavam. Corrigido para 9 cliques nos 4 testes afetados.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiProfilePanel from '../../components/AiProfilePanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchAiProfile: jest.fn(),
  saveAiProfile: jest.fn(),
}));

beforeEach(() => {
  (clientApi.fetchAiProfile as jest.Mock).mockReset();
  (clientApi.saveAiProfile as jest.Mock).mockReset();
});

describe('AiProfilePanel (Cérebro da IA — abas Assistente Guiado / Texto livre)', () => {
  it('abre no modo Texto livre por padrão, com o conteúdo carregado', async () => {
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
      expect(screen.getByDisplayValue('Perfil existente')).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /Texto livre/ })).toHaveAttribute(
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

  it('ao gerar o texto pelo quiz, volta para Texto livre com o conteúdo preenchido e mostra o aviso de origem', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /Assistente Guiado/ }));
    // Sincroniza com o React antes de interagir com o primeiro campo do
    // wizard — mesmo racional do `findByRole` dentro do loop abaixo.
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Loja X' } });
    // 9 passos no total: 8 perguntas essenciais + 1 seção "Avançado"
    // (Observações) — ver `STEPS` em `AiProfileQuizWizard.tsx`.
    //
    // CORREÇÃO 2026-07-31 (flakiness Linux vs Windows): `findByRole` (em vez
    // de `getByRole`) força esperar o React commitar o re-render do passo
    // anterior antes do próximo clique — sem isso, 9 `fireEvent.click`
    // síncronos correm o risco de "perder" um avanço de `stepIndex` quando o
    // scheduler do React 18 (MessageChannel/setImmediate) resolve microtasks
    // num timing ligeiramente diferente entre sistemas operacionais,
    // deixando o wizard preso um passo antes do fim ("Observações") em vez
    // de chegar a "Gerar texto".
    for (let i = 0; i < 9; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sincronização deliberada passo a passo, ver comentário acima.
      const button = await screen.findByRole('button', { name: /Próxima|Gerar texto/ });
      fireEvent.click(button);
    }

    expect(screen.getByRole('tab', { name: /Texto livre/ })).toHaveAttribute(
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
        content: '**P:** Aceita Pix?\n**R:** Sim.',
        updatedAt: '2026-07-30T09:00:00.000Z',
      },
    });
    render(<AiProfilePanel sessionName="vendas" />);
    // Ver comentário de CORREÇÃO 2026-07-31 mais abaixo sobre `normalizer`
    // (o valor tem `\n` literal, que a comparação padrão colapsaria).
    await waitFor(() =>
      expect(
        screen.getByDisplayValue('**P:** Aceita Pix?\n**R:** Sim.', { normalizer: (text) => text }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('tab', { name: /Assistente Guiado/ }));
    // Sincroniza com o React antes de interagir com o primeiro campo do
    // wizard — mesmo racional do `findByRole` dentro do loop abaixo.
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Loja X' } });
    // 9 passos no total: 8 perguntas essenciais + 1 seção "Avançado"
    // (Observações) — ver `STEPS` em `AiProfileQuizWizard.tsx`.
    //
    // CORREÇÃO 2026-07-31 (flakiness Linux vs Windows): `findByRole` (em vez
    // de `getByRole`) força esperar o React commitar o re-render do passo
    // anterior antes do próximo clique — sem isso, 9 `fireEvent.click`
    // síncronos correm o risco de "perder" um avanço de `stepIndex` quando o
    // scheduler do React 18 (MessageChannel/setImmediate) resolve microtasks
    // num timing ligeiramente diferente entre sistemas operacionais,
    // deixando o wizard preso um passo antes do fim ("Observações") em vez
    // de chegar a "Gerar texto".
    for (let i = 0; i < 9; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sincronização deliberada passo a passo, ver comentário acima.
      const button = await screen.findByRole('button', { name: /Próxima|Gerar texto/ });
      fireEvent.click(button);
    }

    // CORREÇÃO 2026-07-31: `getByDisplayValue` com `exact: true` (padrão) só
    // normaliza (colapsa `\s+` num espaço) o valor LIDO do elemento, nunca o
    // valor esperado que passamos — comparar contra uma string com `\n`
    // literal nunca bate (ver @testing-library/dom `matches()` em
    // `matches.js`). `normalizer: (text) => text` desliga essa normalização
    // dos dois lados, preservando as quebras de linha na comparação.
    expect(
      screen.getByDisplayValue('**P:** Aceita Pix?\n**R:** Sim.\n\n- Nome: Loja X', {
        normalizer: (text) => text,
      }),
    ).toBeInTheDocument();
  });

  it('editar manualmente o texto some com o aviso de "acabou de adicionar" do quiz', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /Assistente Guiado/ }));
    // Sincroniza com o React antes de interagir com o primeiro campo do
    // wizard — mesmo racional do `findByRole` dentro do loop abaixo.
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Loja X' } });
    // 9 passos no total: 8 perguntas essenciais + 1 seção "Avançado"
    // (Observações) — ver `STEPS` em `AiProfileQuizWizard.tsx`.
    //
    // CORREÇÃO 2026-07-31 (flakiness Linux vs Windows): `findByRole` (em vez
    // de `getByRole`) força esperar o React commitar o re-render do passo
    // anterior antes do próximo clique — sem isso, 9 `fireEvent.click`
    // síncronos correm o risco de "perder" um avanço de `stepIndex` quando o
    // scheduler do React 18 (MessageChannel/setImmediate) resolve microtasks
    // num timing ligeiramente diferente entre sistemas operacionais,
    // deixando o wizard preso um passo antes do fim ("Observações") em vez
    // de chegar a "Gerar texto".
    for (let i = 0; i < 9; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sincronização deliberada passo a passo, ver comentário acima.
      const button = await screen.findByRole('button', { name: /Próxima|Gerar texto/ });
      fireEvent.click(button);
    }
    expect(screen.getByText(/foram adicionadas ao final do texto/)).toBeInTheDocument();

    const textarea = screen.getByDisplayValue('- Nome: Loja X');
    fireEvent.change(textarea, { target: { value: '- Nome: Loja X editado à mão' } });

    expect(screen.queryByText(/foram adicionadas ao final do texto/)).not.toBeInTheDocument();
  });

  it('reabrir o quiz depois de gerar um texto sempre começa em branco, e reabrir de novo ANEXA outra vez (nunca sobrescreve)', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /Assistente Guiado/ }));
    // Sincroniza com o React antes de interagir com o primeiro campo do
    // wizard — mesmo racional do `findByRole` dentro do loop abaixo.
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Loja X' } });
    // 9 passos no total: 8 perguntas essenciais + 1 seção "Avançado"
    // (Observações) — ver `STEPS` em `AiProfileQuizWizard.tsx`.
    //
    // CORREÇÃO 2026-07-31 (flakiness Linux vs Windows): `findByRole` (em vez
    // de `getByRole`) força esperar o React commitar o re-render do passo
    // anterior antes do próximo clique — sem isso, 9 `fireEvent.click`
    // síncronos correm o risco de "perder" um avanço de `stepIndex` quando o
    // scheduler do React 18 (MessageChannel/setImmediate) resolve microtasks
    // num timing ligeiramente diferente entre sistemas operacionais,
    // deixando o wizard preso um passo antes do fim ("Observações") em vez
    // de chegar a "Gerar texto".
    for (let i = 0; i < 9; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sincronização deliberada passo a passo, ver comentário acima.
      const button = await screen.findByRole('button', { name: /Próxima|Gerar texto/ });
      fireEvent.click(button);
    }

    fireEvent.click(screen.getByRole('tab', { name: /Assistente Guiado/ }));
    expect(screen.getByLabelText('Nome')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Loja Y' } });
    // 9 passos no total: 8 perguntas essenciais + 1 seção "Avançado"
    // (Observações) — ver `STEPS` em `AiProfileQuizWizard.tsx`.
    //
    // CORREÇÃO 2026-07-31 (flakiness Linux vs Windows): `findByRole` (em vez
    // de `getByRole`) força esperar o React commitar o re-render do passo
    // anterior antes do próximo clique — sem isso, 9 `fireEvent.click`
    // síncronos correm o risco de "perder" um avanço de `stepIndex` quando o
    // scheduler do React 18 (MessageChannel/setImmediate) resolve microtasks
    // num timing ligeiramente diferente entre sistemas operacionais,
    // deixando o wizard preso um passo antes do fim ("Observações") em vez
    // de chegar a "Gerar texto".
    for (let i = 0; i < 9; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sincronização deliberada passo a passo, ver comentário acima.
      const button = await screen.findByRole('button', { name: /Próxima|Gerar texto/ });
      fireEvent.click(button);
    }

    // Ver comentário de CORREÇÃO 2026-07-31 acima sobre `normalizer` — o
    // valor esperado tem `\n\n` literal, que a comparação padrão colapsaria.
    expect(
      screen.getByDisplayValue('- Nome: Loja X\n\n- Nome: Loja Y', { normalizer: (text) => text }),
    ).toBeInTheDocument();
  });

  it('salva o conteúdo do modo texto livre chamando saveAiProfile com o objeto completo (F1.8)', async () => {
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

describe('AiProfilePanel — "Cadastrar pergunta não respondida" (ADR #86)', () => {
  it('mostra o botão de cadastrar pergunta na aba Texto livre', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    expect(
      screen.getByRole('button', { name: /Cadastrar pergunta não respondida/ }),
    ).toBeInTheDocument();
  });

  it('não mostra o botão de cadastrar pergunta na aba Assistente Guiado', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /Assistente Guiado/ }));
    expect(
      screen.queryByRole('button', { name: /Cadastrar pergunta não respondida/ }),
    ).not.toBeInTheDocument();
  });

  it('ao confirmar uma pergunta/resposta no modal, anexa ao final do texto existente', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({
      profile: {
        tenantId: 't1',
        sessionName: 'vendas',
        content: '- Nome: Loja X',
        updatedAt: '2026-07-30T09:00:00.000Z',
      },
    });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByDisplayValue('- Nome: Loja X')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar pergunta não respondida/ }));
    fireEvent.change(screen.getByLabelText('Pergunta do cliente'), {
      target: { value: 'Vocês entregam aos domingos?' },
    });
    fireEvent.change(screen.getByLabelText('Resposta correta'), {
      target: { value: 'Não, só de terça a sábado.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao Cérebro da IA' }));

    // Ver comentário de CORREÇÃO 2026-07-31 acima sobre `normalizer`.
    expect(
      screen.getByDisplayValue(
        '- Nome: Loja X\n\n**P:** Vocês entregam aos domingos?\n**R:** Não, só de terça a sábado.',
        { normalizer: (text) => text },
      ),
    ).toBeInTheDocument();
  });

  it('anexar uma FAQ marca o formulário como "dirty" (habilita Salvar)', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({
      profile: {
        tenantId: 't1',
        sessionName: 'vendas',
        content: '- Nome: Loja X',
        updatedAt: '2026-07-30T09:00:00.000Z',
      },
    });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByDisplayValue('- Nome: Loja X')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar pergunta não respondida/ }));
    fireEvent.change(screen.getByLabelText('Pergunta do cliente'), {
      target: { value: 'Aceita Pix?' },
    });
    fireEvent.change(screen.getByLabelText('Resposta correta'), { target: { value: 'Sim.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao Cérebro da IA' }));

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });
});

describe('AiProfilePanel — Horário de atendimento (F1.8)', () => {
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

  it('ligar o toggle habilita o Salvar (marca dirty)', async () => {
    (clientApi.fetchAiProfile as jest.Mock).mockResolvedValue({ profile: null });
    render(<AiProfilePanel sessionName="vendas" />);
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('switch', { name: /Enviar aviso automático/i }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });
});
