/**
 * Redesign 2026-08-05 (R4) — teste do `TagsPanel`: painel de gestão do
 * catálogo de tags de uma sessão (lista + criar + editar inline + remover),
 * mesma casca de `QuickRepliesPanel`/`UserManagementPanel`/`AuditLogPanel`.
 *
 * Onda 1 do redesign (2026-08-22) — nasce já cobrindo o bug real corrigido
 * nesta rodada: uma falha no carregamento INICIAL deixava `loading=false`/
 * `tags=[]` ao mesmo tempo, e a tela mostrava CONTRADITORIAMENTE o banner de
 * erro e "Nenhuma tag cadastrada ainda." juntos. Ver casos abaixo.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TagsPanel from '../../components/TagsPanel';
import * as clientApi from '../../lib/clientApi';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchTags: jest.fn(),
  createTag: jest.fn(),
  updateTag: jest.fn(),
  deleteTag: jest.fn(),
}));

function tag(over: Partial<clientApi.Tag> = {}): clientApi.Tag {
  return {
    id: 'tag-1',
    tenantId: 'tenant-1',
    sessionName: 'vendas',
    name: 'VIP',
    color: 'green',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...over,
  };
}

describe('TagsPanel (Redesign 2026-08-05, R4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carrega e lista as tags ao montar', async () => {
    (clientApi.fetchTags as jest.Mock).mockResolvedValue({ tags: [tag()] });

    render(<TagsPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByText('VIP')).toBeInTheDocument();
    });
    expect(clientApi.fetchTags).toHaveBeenCalledWith('vendas');
  });

  it('mostra mensagem de lista vazia quando não há tags', async () => {
    (clientApi.fetchTags as jest.Mock).mockResolvedValue({ tags: [] });

    render(<TagsPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByText('Nenhuma tag cadastrada ainda.')).toBeInTheDocument();
    });
  });

  it('cria uma nova tag ao submeter o formulário', async () => {
    (clientApi.fetchTags as jest.Mock).mockResolvedValue({ tags: [] });
    (clientApi.createTag as jest.Mock).mockResolvedValue({
      tag: tag({ name: 'Fechado' }),
    });

    render(<TagsPanel sessionName="vendas" />);
    await waitFor(() => expect(clientApi.fetchTags).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Nome da tag'), {
      target: { value: 'Fechado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => {
      expect(clientApi.createTag).toHaveBeenCalledWith('vendas', 'Fechado', 'gray');
    });
    expect(await screen.findByText('Fechado')).toBeInTheDocument();
  });

  it('remove uma tag ao clicar em Excluir', async () => {
    (clientApi.fetchTags as jest.Mock).mockResolvedValue({ tags: [tag()] });
    (clientApi.deleteTag as jest.Mock).mockResolvedValue(undefined);

    render(<TagsPanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('VIP')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => {
      expect(clientApi.deleteTag).toHaveBeenCalledWith('vendas', 'tag-1');
    });
    await waitFor(() => {
      expect(screen.queryByText('VIP')).not.toBeInTheDocument();
    });
  });

  it('erro de carregamento inicial (sem nenhum dado) vira ErrorState com retry, nunca a mensagem de lista vazia', async () => {
    (clientApi.fetchTags as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    render(<TagsPanel sessionName="vendas" />);

    await waitFor(() => {
      expect(screen.getByText('Falha ao carregar as tags.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Nenhuma tag cadastrada ainda.')).not.toBeInTheDocument();

    (clientApi.fetchTags as jest.Mock).mockResolvedValueOnce({ tags: [tag()] });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('VIP')).toBeInTheDocument();
  });

  it('erro de uma AÇÃO sobre dados já carregados vira banner discreto — a lista continua visível', async () => {
    const { ClientApiError } = jest.requireActual('../../lib/clientApi');
    (clientApi.fetchTags as jest.Mock).mockResolvedValue({ tags: [tag()] });
    (clientApi.deleteTag as jest.Mock).mockRejectedValue(new ClientApiError(403, { error: 'forbidden' }));

    render(<TagsPanel sessionName="vendas" />);
    await waitFor(() => expect(screen.getByText('VIP')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => {
      expect(screen.getByText('Seu cargo não permite gerenciar tags.')).toBeInTheDocument();
    });
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });
});
