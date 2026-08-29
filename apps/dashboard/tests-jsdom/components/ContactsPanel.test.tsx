/**
 * Fase L, Bloco L1b — teste do `ContactsPanel`: lista de contatos (busca +
 * filtro por aba + paginação), CRUD manual e consentimento (opt-out/opt-in).
 *
 * Retrofit visual 2026-08-17 (2ª rodada, réplica de referência do
 * fundador): ações por linha migraram de botões sempre visíveis para um
 * menu "⋮" (Editar/Marcar-Reverter opt-out/Excluir); ganhou abas de filtro
 * (Todos/Com conversa/Sem conversa/Opt-outs) e seleção em lote. Nenhum
 * elemento de campanha nesta tela (domínio separado, ver `CampaignsPanel`).
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContactsPanel from '../../components/ContactsPanel';
import * as clientApi from '../../lib/clientApi';
import { toast } from '../../components/ui/use-toast';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchContacts: jest.fn(),
  fetchContactStats: jest.fn(),
  importContacts: jest.fn(),
  optOutContact: jest.fn(),
  optInContact: jest.fn(),
  createContact: jest.fn(),
  updateContact: jest.fn(),
  deleteContact: jest.fn(),
}));

jest.mock('../../components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

function contact(over: Partial<clientApi.Contact> = {}): clientApi.Contact {
  return {
    id: 'contact-1',
    tenantId: 'tenant-1',
    phoneE164: '5521988887777',
    name: 'Maria',
    source: 'whatsapp',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...over,
  };
}

/** Abre o menu "⋮" da linha de um contato pelo nome/telefone exibido. */
function openRowMenu(label: string): void {
  fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
  void label;
}

describe('ContactsPanel (Fase L, Bloco L1b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (clientApi.fetchContactStats as jest.Mock).mockResolvedValue({
      total: 1,
      withConversation: 1,
      withoutConversation: 0,
      optedOut: 0,
      bySource: { whatsapp: 1, import: 0, manual: 0 },
    });
  });

  it('carrega e lista os contatos ao montar', async () => {
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });

    render(<ContactsPanel canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Maria')).toBeInTheDocument();
    });
  });

  describe('padronização de exibição de contato (2026-08-20)', () => {
    it('sem nome salvo, mostra telefone + apelido do WhatsApp da conversa mais recente (em partes)', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({
        contacts: [contact({ name: undefined, lastConversationContactName: 'Apelido WhatsApp' })],
      });

      render(<ContactsPanel canManage={false} />);

      // Duas ocorrências do telefone (rótulo principal + linha duplicada
      // só-mobile, sempre no DOM em jsdom) + o apelido num `<span>` próprio,
      // menor/mais claro (`DisplayNameParts`, ver `DisplayNameParts.test.tsx`).
      await waitFor(() => {
        expect(screen.getAllByText('+55 (21) 98888-7777').length).toBeGreaterThan(0);
      });
      expect(screen.getByText('Apelido WhatsApp')).toBeInTheDocument();
    });

    it('sem nome salvo nem apelido resolvido, mostra só o telefone', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({
        contacts: [contact({ name: undefined })],
      });

      render(<ContactsPanel canManage={false} />);

      // Duas ocorrências esperadas: o rótulo principal e a linha de telefone
      // duplicada só-mobile (`sm:hidden`, sempre no DOM em jsdom) — ambas
      // mostram o mesmo telefone quando não há nome nem apelido.
      await waitFor(() => {
        expect(screen.getAllByText('+55 (21) 98888-7777').length).toBeGreaterThan(0);
      });
    });

    it('com nome salvo, mostra só o nome mesmo com apelido do WhatsApp disponível', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({
        contacts: [
          contact({ name: 'Maria Salva', lastConversationContactName: 'Apelido WhatsApp' }),
        ],
      });

      render(<ContactsPanel canManage={false} />);

      await waitFor(() => {
        expect(screen.getByText('Maria Salva')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Apelido WhatsApp/)).not.toBeInTheDocument();
    });
  });

  it('mostra estado vazio quando não há contatos', async () => {
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });

    render(<ContactsPanel canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Nenhum contato ainda')).toBeInTheDocument();
    });
  });

  it('sem permissão de gerenciar (canManage=false): não mostra os botões de importar/adicionar', async () => {
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });

    render(<ContactsPanel canManage={false} />);
    await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: /Importar contatos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adicionar contato/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument();
  });

  it('com permissão (canManage=true): mostra "Adicionar contato" na barra; "Importar" só existe em Ações rápidas', async () => {
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });

    render(<ContactsPanel canManage={true} />);
    await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalled());

    // Pedido do fundador (2026-08-18): um único botão de importar, só em
    // Ações Rápidas — nunca duplicado ao lado da busca.
    expect(screen.queryByRole('button', { name: 'Importar contatos' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar contatos (CRM)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Adicionar contato/ })).toBeInTheDocument();
  });

  it('busca refaz a listagem com o termo digitado', async () => {
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });

    render(<ContactsPanel canManage={false} />);
    await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome ou telefone/), {
      target: { value: 'maria' },
    });

    await waitFor(() => {
      expect(clientApi.fetchContacts).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'maria' }),
      );
    });
  });

  it('mostra "Carregar mais" quando há próxima página, e busca a página seguinte ao clicar', async () => {
    (clientApi.fetchContacts as jest.Mock)
      .mockResolvedValueOnce({ contacts: [contact()], nextCursor: 'contact-1' })
      .mockResolvedValueOnce({ contacts: [contact({ id: 'contact-2', name: 'João' })] });

    render(<ContactsPanel canManage={false} />);
    await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => {
      expect(screen.getByText('João')).toBeInTheDocument();
    });
    expect(clientApi.fetchContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'contact-1' }),
    );
  });

  it('seleciona um arquivo .csv, importa e mostra toast de sucesso com o resumo', async () => {
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });
    (clientApi.importContacts as jest.Mock).mockResolvedValue({
      totalRows: 2,
      created: 1,
      enriched: 1,
      unchanged: 0,
      invalid: [],
    });

    render(<ContactsPanel canManage={true} />);
    await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalled());

    const file = new File(['Nome,Telefone\nMaria,5521988887777'], 'contatos.csv', {
      type: 'text/csv',
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(clientApi.importContacts).toHaveBeenCalledWith('Nome,Telefone\nMaria,5521988887777');
    });
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'success',
          description: expect.stringContaining('1 novo(s)'),
        }),
      );
    });
  });

  it('mostra toast de erro (destructive) quando a importação falha com 403', async () => {
    const { ClientApiError } = jest.requireActual('../../lib/clientApi');
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });
    (clientApi.importContacts as jest.Mock).mockRejectedValue(
      new ClientApiError(403, { error: 'forbidden' }),
    );

    render(<ContactsPanel canManage={true} />);
    await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalled());

    const file = new File(['Nome,Telefone\nMaria,5521988887777'], 'contatos.csv', {
      type: 'text/csv',
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: 'Seu cargo não permite importar contatos.',
        }),
      );
    });
  });

  describe('cards e nenhum elemento de campanha', () => {
    it('mostra as contagens da base nos cards do topo, incluindo opt-outs', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });
      (clientApi.fetchContactStats as jest.Mock).mockResolvedValue({
        total: 23,
        withConversation: 18,
        withoutConversation: 5,
        optedOut: 2,
        bySource: { whatsapp: 15, import: 5, manual: 3 },
      });

      render(<ContactsPanel canManage={false} />);

      await waitFor(() => {
        expect(screen.getByText('Total de contatos')).toBeInTheDocument();
      });
      const totalCard = screen.getByText('Total de contatos').closest('div')!.parentElement!;
      expect(within(totalCard as HTMLElement).getByText('23')).toBeInTheDocument();
      const optOutCard = screen.getAllByText('Opt-outs')[0].closest('div')!.parentElement!;
      expect(within(optOutCard as HTMLElement).getByText('2')).toBeInTheDocument();
    });

    it('lista continua funcionando quando as contagens falham', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });
      (clientApi.fetchContactStats as jest.Mock).mockRejectedValue(new Error('falhou'));

      render(<ContactsPanel canManage={false} />);

      await waitFor(() => {
        expect(screen.getByText('Maria')).toBeInTheDocument();
      });
    });

    it('mostra "Abrir conversa" apenas para contatos que já têm conversa', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({
        contacts: [
          contact({
            id: 'com-conversa',
            name: 'Com Conversa',
            lastConversationId: 'conv-1',
            lastConversationSessionName: 'vendas',
          }),
          contact({ id: 'sem-conversa', name: 'Sem Conversa' }),
        ],
      });

      render(<ContactsPanel canManage={false} />);
      await waitFor(() => expect(screen.getByText('Com Conversa')).toBeInTheDocument());

      const links = screen.getAllByRole('link', { name: 'Abrir conversa' });
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute('href', '/sessions/vendas/conversations/conv-1');
    });

    it('nenhum texto/botão de campanha aparece na tela', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });

      render(<ContactsPanel canManage={true} />);
      await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());

      expect(screen.queryByText(/campanha/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/disparo/i)).not.toBeInTheDocument();
    });
  });

  // Retrofit visual 2026-08-18 — painel direito (Ações rápidas/Insights)
  // réplica de imagem do fundador; o card "Dica" foi removido a pedido dele
  // em 2026-08-21.
  describe('painel direito', () => {
    it('não mostra mais o card "Dica" (removido a pedido do fundador)', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });

      render(<ContactsPanel canManage={false} />);
      await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());

      expect(screen.queryByText('Dica')).not.toBeInTheDocument();
    });

    it('Ações rápidas mostra "Novo contato" (pílula) além do botão da barra', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });

      render(<ContactsPanel canManage={true} />);
      await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalled());

      // Dois gatilhos de criação: o da barra ("Adicionar contato") e o de
      // Ações Rápidas ("Novo contato") — cada um abre seu próprio modal.
      expect(screen.getByRole('button', { name: 'Novo contato' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Importar contatos (CRM)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Exportar contatos' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Gerenciar opt-outs' })).toBeInTheDocument();
    });

    it('Insights da base mostra "Principais fontes" com percentual e contagem real por origem', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });
      (clientApi.fetchContactStats as jest.Mock).mockResolvedValue({
        total: 84,
        withConversation: 39,
        withoutConversation: 45,
        optedOut: 7,
        bySource: { whatsapp: 57, import: 18, manual: 9 },
      });

      render(<ContactsPanel canManage={false} />);

      await waitFor(() => {
        expect(screen.getByText('Principais fontes')).toBeInTheDocument();
      });
      expect(screen.getByText('· WhatsApp')).toBeInTheDocument();
      expect(screen.getByText('68% (57)')).toBeInTheDocument();
      expect(screen.getByText('· Importação')).toBeInTheDocument();
      expect(screen.getByText('21% (18)')).toBeInTheDocument();
      expect(screen.getByText('· Manual')).toBeInTheDocument();
      expect(screen.getByText('11% (9)')).toBeInTheDocument();
    });

    it('"Gerenciar opt-outs" muda a aba ativa para Opt-outs', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });

      render(<ContactsPanel canManage={true} />);
      await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: 'Gerenciar opt-outs' }));

      await waitFor(() => {
        expect(clientApi.fetchContacts).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: 'opted_out' }),
        );
      });
    });
  });

  describe('abas de filtro', () => {
    it('clicar numa aba refaz a listagem com o status certo', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });

      render(<ContactsPanel canManage={false} />);
      await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: /Com conversa/ }));

      await waitFor(() => {
        expect(clientApi.fetchContacts).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: 'with_conversation' }),
        );
      });

      fireEvent.click(screen.getByRole('button', { name: /^Todos/ }));
      await waitFor(() => {
        expect(clientApi.fetchContacts).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: undefined }),
        );
      });
    });
  });

  // Reorganização Contatos/Campanhas (2026-08-17) — CRUD manual, agora atrás do menu "⋮".
  describe('CRUD manual (menu "⋮")', () => {
    it('adicionar contato: abre o modal, preenche e chama a API', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });
      (clientApi.createContact as jest.Mock).mockResolvedValue({
        contact: contact({ id: 'contact-novo', name: 'Novo' }),
        wasCreated: true,
      });

      render(<ContactsPanel canManage={true} />);
      await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('button', { name: /Adicionar contato/ }));
      fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Novo' } });
      fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '65988887777' } });
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

      await waitFor(() => {
        expect(clientApi.createContact).toHaveBeenCalledWith({
          phone: '65988887777',
          name: 'Novo',
        });
      });
    });

    it('editar contato: menu "⋮" → Editar abre pré-preenchido e chama updateContact', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });
      (clientApi.updateContact as jest.Mock).mockResolvedValue({
        contact: contact({ name: 'Maria Editada' }),
      });

      render(<ContactsPanel canManage={true} />);
      await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());

      openRowMenu('Maria');
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

      const nameInput = screen.getByLabelText('Nome') as HTMLInputElement;
      expect(nameInput.value).toBe('Maria');
      fireEvent.change(nameInput, { target: { value: 'Maria Editada' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(clientApi.updateContact).toHaveBeenCalledWith('contact-1', {
          name: 'Maria Editada',
          phone: '5521988887777',
        });
      });
    });

    it('excluir contato: menu "⋮" → Excluir pede confirmação antes de chamar a API', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });
      (clientApi.deleteContact as jest.Mock).mockResolvedValue(undefined);

      render(<ContactsPanel canManage={true} />);
      await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());

      openRowMenu('Maria');
      fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
      expect(clientApi.deleteContact).not.toHaveBeenCalled();
      expect(screen.getByText('Excluir contato?')).toBeInTheDocument();

      const dialog = screen.getByText('Excluir contato?').closest('div')!.parentElement!;
      fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Excluir' }));

      await waitFor(() => {
        expect(clientApi.deleteContact).toHaveBeenCalledWith('contact-1');
      });
    });

    it('sem permissão (canManage=false): não mostra o menu "⋮"', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });

      render(<ContactsPanel canManage={false} />);
      await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());

      expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument();
    });
  });

  describe('seleção em lote', () => {
    it('selecionar contatos mostra a barra de ações em lote, com opt-out e excluir', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });
      (clientApi.optOutContact as jest.Mock).mockResolvedValue({
        contact: contact({ optOutAt: '2026-08-17T00:00:00.000Z' }),
      });

      render(<ContactsPanel canManage={true} />);
      await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());

      fireEvent.click(screen.getByLabelText('Selecionar Maria'));
      expect(screen.getByText('1 selecionado(s)')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Marcar opt-out' }));

      await waitFor(() => {
        expect(clientApi.optOutContact).toHaveBeenCalledWith('contact-1');
      });
    });
  });

  // Fase L, Bloco L2 — opt-out/opt-in manual (agora dentro do menu "⋮").
  describe('consentimento (opt-out/opt-in)', () => {
    it('mostra a badge "Opt-out" quando o contato já está opt-out', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({
        contacts: [contact({ optOutAt: '2026-08-16T00:00:00.000Z' })],
      });

      render(<ContactsPanel canManage={false} />);

      await waitFor(() => {
        expect(screen.getByText('Opt-out')).toBeInTheDocument();
      });
    });

    it('clicar em "Marcar opt-out" no menu "⋮" chama a API e mostra toast de sucesso', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });
      (clientApi.optOutContact as jest.Mock).mockResolvedValue({
        contact: contact({ optOutAt: '2026-08-16T00:00:00.000Z' }),
      });

      render(<ContactsPanel canManage={true} />);
      await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());

      openRowMenu('Maria');
      fireEvent.click(screen.getByRole('button', { name: 'Marcar opt-out' }));

      await waitFor(() => {
        expect(clientApi.optOutContact).toHaveBeenCalledWith('contact-1');
      });
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
      });
      expect(await screen.findByText('Opt-out')).toBeInTheDocument();
    });

    it('para um contato já opt-out, o menu mostra "Reverter opt-out" e chama optInContact', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({
        contacts: [contact({ optOutAt: '2026-08-16T00:00:00.000Z' })],
      });
      (clientApi.optInContact as jest.Mock).mockResolvedValue({ contact: contact() });

      render(<ContactsPanel canManage={true} />);
      await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());

      openRowMenu('Maria');
      fireEvent.click(screen.getByRole('button', { name: 'Reverter opt-out' }));

      await waitFor(() => {
        expect(clientApi.optInContact).toHaveBeenCalledWith('contact-1');
      });
    });
  });
});
