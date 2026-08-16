/**
 * Fase L, Bloco L1b — teste do `ContactsPanel`: lista de contatos (busca +
 * paginação) e, para quem gerencia, importação de planilha `.csv`.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContactsPanel from '../../components/ContactsPanel';
import * as clientApi from '../../lib/clientApi';
import { toast } from '../../components/ui/use-toast';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  fetchContacts: jest.fn(),
  importContacts: jest.fn(),
  optOutContact: jest.fn(),
  optInContact: jest.fn(),
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

describe('ContactsPanel (Fase L, Bloco L1b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carrega e lista os contatos ao montar', async () => {
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });

    render(<ContactsPanel canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Maria')).toBeInTheDocument();
    });
  });

  it('mostra o telefone formatado quando o contato não tem nome', async () => {
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({
      contacts: [contact({ name: undefined })],
    });

    render(<ContactsPanel canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('+55 21 98888-7777')).toBeInTheDocument();
    });
  });

  it('mostra estado vazio quando não há contatos', async () => {
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });

    render(<ContactsPanel canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Nenhum contato ainda')).toBeInTheDocument();
    });
  });

  it('sem permissão de gerenciar (canManage=false): não mostra o botão de importar', async () => {
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });

    render(<ContactsPanel canManage={false} />);
    await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: /Importar planilha/ })).not.toBeInTheDocument();
  });

  it('com permissão (canManage=true): mostra o botão de importar', async () => {
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });

    render(<ContactsPanel canManage={true} />);
    await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /Importar planilha/ })).toBeInTheDocument();
  });

  it('busca refaz a listagem com o termo digitado', async () => {
    (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [] });

    render(<ContactsPanel canManage={false} />);
    await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome ou telefone'), {
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

  // Fase L, Bloco L2 — opt-out/opt-in manual.
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

    it('sem permissão (canManage=false): não mostra o botão de opt-out/opt-in', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });

      render(<ContactsPanel canManage={false} />);
      await waitFor(() => expect(clientApi.fetchContacts).toHaveBeenCalled());

      expect(screen.queryByRole('button', { name: /opt-out/i })).not.toBeInTheDocument();
    });

    it('clicar em "Marcar opt-out" chama a API e mostra toast de sucesso', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });
      (clientApi.optOutContact as jest.Mock).mockResolvedValue({
        contact: contact({ optOutAt: '2026-08-16T00:00:00.000Z' }),
      });

      render(<ContactsPanel canManage={true} />);
      await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Marcar opt-out' }));

      await waitFor(() => {
        expect(clientApi.optOutContact).toHaveBeenCalledWith('contact-1');
      });
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
      });
      // A linha atualiza sozinha, sem precisar recarregar a lista inteira.
      expect(await screen.findByText('Opt-out')).toBeInTheDocument();
    });

    it('para um contato já opt-out, o botão vira "Reverter opt-out" e chama optInContact', async () => {
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({
        contacts: [contact({ optOutAt: '2026-08-16T00:00:00.000Z' })],
      });
      (clientApi.optInContact as jest.Mock).mockResolvedValue({ contact: contact() });

      render(<ContactsPanel canManage={true} />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Reverter opt-out' })).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Reverter opt-out' }));

      await waitFor(() => {
        expect(clientApi.optInContact).toHaveBeenCalledWith('contact-1');
      });
      await waitFor(() => {
        expect(screen.queryByText('Opt-out')).not.toBeInTheDocument();
      });
    });

    it('mostra toast de erro (destructive) quando a ação falha', async () => {
      const { ClientApiError } = jest.requireActual('../../lib/clientApi');
      (clientApi.fetchContacts as jest.Mock).mockResolvedValue({ contacts: [contact()] });
      (clientApi.optOutContact as jest.Mock).mockRejectedValue(
        new ClientApiError(403, { error: 'forbidden' }),
      );

      render(<ContactsPanel canManage={true} />);
      await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Marcar opt-out' }));

      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: 'destructive',
            description: 'Seu cargo não permite alterar o consentimento deste contato.',
          }),
        );
      });
    });
  });
});
