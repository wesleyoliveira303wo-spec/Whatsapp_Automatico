/**
 * Milestone 6, Bloco M6E-3 — teste do `MessageComposer` (retrofit M6E-2):
 * erro de envio migrado de banner inline para `Toast`.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageComposer from '../../components/MessageComposer';
import * as clientApi from '../../lib/clientApi';
import { toast } from '../../components/ui/use-toast';

jest.mock('../../lib/clientApi', () => ({
  ...jest.requireActual('../../lib/clientApi'),
  sendConversationMessage: jest.fn(),
  sendConversationMedia: jest.fn(),
  fetchQuickReplies: jest.fn(),
  createQuickReply: jest.fn(),
  updateQuickReply: jest.fn(),
  deleteQuickReply: jest.fn(),
}));

jest.mock('../../components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

describe('MessageComposer (Milestone 6, Bloco M6E-2)', () => {
  const onSent = jest.fn();

  beforeEach(() => {
    onSent.mockClear();
    (toast as jest.Mock).mockClear();
    (clientApi.sendConversationMessage as jest.Mock).mockReset();
    (clientApi.sendConversationMedia as jest.Mock).mockReset();
    (clientApi.fetchQuickReplies as jest.Mock).mockReset().mockResolvedValue({ quickReplies: [] });
  });

  it('envia a mensagem ao clicar em "Enviar" e chama onSent', async () => {
    (clientApi.sendConversationMessage as jest.Mock).mockResolvedValue({ status: 'queued' });

    render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
    fireEvent.change(screen.getByPlaceholderText(/Escreva sua resposta/), {
      target: { value: 'Olá!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(clientApi.sendConversationMessage).toHaveBeenCalledWith('c1', 'Olá!');
      expect(onSent).toHaveBeenCalledTimes(1);
    });
  });

  it('envia com Enter (sem Shift) e limpa o campo', async () => {
    (clientApi.sendConversationMessage as jest.Mock).mockResolvedValue({ status: 'queued' });

    render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
    const textarea = screen.getByPlaceholderText(/Escreva sua resposta/);
    fireEvent.change(textarea, { target: { value: 'Olá!' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(clientApi.sendConversationMessage).toHaveBeenCalledWith('c1', 'Olá!');
    });
  });

  it('Fase 1, Bloco F1.7: mostra toast de confirmação "Mensagem enviada" quando o envio de texto tem sucesso', async () => {
    (clientApi.sendConversationMessage as jest.Mock).mockResolvedValue({ status: 'queued' });

    render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
    fireEvent.change(screen.getByPlaceholderText(/Escreva sua resposta/), {
      target: { value: 'Olá!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith({ title: 'Mensagem enviada' });
    });
  });

  it('mostra toast de erro (destructive) quando o envio falha', async () => {
    (clientApi.sendConversationMessage as jest.Mock).mockRejectedValue(new Error('falhou'));

    render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
    fireEvent.change(screen.getByPlaceholderText(/Escreva sua resposta/), {
      target: { value: 'Olá!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
    expect(onSent).not.toHaveBeenCalled();
  });

  describe('anexo de mídia (Fase 1, Bloco F1.3)', () => {
    function buildFile(name: string, type: string): File {
      return new File(['conteudo-fake'], name, { type });
    }

    it('seleciona um arquivo, mostra o preview com o nome e permite remover', async () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);

      const input = screen.getByLabelText('Anexar arquivo', { selector: 'input' });
      fireEvent.change(input, { target: { files: [buildFile('foto.jpg', 'image/jpeg')] } });

      expect(await screen.findByText('foto.jpg')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Remover anexo' }));
      await waitFor(() => {
        expect(screen.queryByText('foto.jpg')).not.toBeInTheDocument();
      });
    });

    it('envia o arquivo selecionado (com legenda) via sendConversationMedia, não sendConversationMessage', async () => {
      (clientApi.sendConversationMedia as jest.Mock).mockResolvedValue({ id: 'm1' });

      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      const input = screen.getByLabelText('Anexar arquivo', { selector: 'input' });
      fireEvent.change(input, { target: { files: [buildFile('foto.jpg', 'image/jpeg')] } });
      await screen.findByText('foto.jpg');

      fireEvent.change(screen.getByPlaceholderText(/Legenda/), {
        target: { value: 'Segue a foto' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

      await waitFor(() => {
        expect(clientApi.sendConversationMedia).toHaveBeenCalledWith('c1', expect.any(File), {
          contentType: 'image',
          caption: 'Segue a foto',
        });
        expect(clientApi.sendConversationMessage).not.toHaveBeenCalled();
        expect(onSent).toHaveBeenCalledTimes(1);
      });
    });

    it('limpa o anexo e a legenda após o envio bem-sucedido', async () => {
      (clientApi.sendConversationMedia as jest.Mock).mockResolvedValue({ id: 'm1' });

      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      const input = screen.getByLabelText('Anexar arquivo', { selector: 'input' });
      fireEvent.change(input, { target: { files: [buildFile('audio.ogg', 'audio/ogg')] } });
      await screen.findByText('audio.ogg');
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

      await waitFor(() => {
        expect(screen.queryByText('audio.ogg')).not.toBeInTheDocument();
      });
    });

    it('mostra toast de erro (destructive) quando o envio de mídia falha, sem chamar onSent', async () => {
      (clientApi.sendConversationMedia as jest.Mock).mockRejectedValue(new Error('falhou'));

      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      const input = screen.getByLabelText('Anexar arquivo', { selector: 'input' });
      fireEvent.change(input, { target: { files: [buildFile('doc.pdf', 'application/pdf')] } });
      await screen.findByText('doc.pdf');
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
      });
      expect(onSent).not.toHaveBeenCalled();
    });

    it('Fase 1, Bloco F1.7: mostra toast de confirmação "Arquivo enviado" quando o envio de mídia tem sucesso', async () => {
      (clientApi.sendConversationMedia as jest.Mock).mockResolvedValue({ id: 'm1' });

      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      const input = screen.getByLabelText('Anexar arquivo', { selector: 'input' });
      fireEvent.change(input, { target: { files: [buildFile('foto.jpg', 'image/jpeg')] } });
      await screen.findByText('foto.jpg');
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith({ title: 'Arquivo enviado' });
      });
    });

    it('deriva a categoria "document" para um mimeType que não é image/audio/video', async () => {
      (clientApi.sendConversationMedia as jest.Mock).mockResolvedValue({ id: 'm1' });

      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      const input = screen.getByLabelText('Anexar arquivo', { selector: 'input' });
      fireEvent.change(input, {
        target: { files: [buildFile('contrato.pdf', 'application/pdf')] },
      });
      await screen.findByText('contrato.pdf');
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

      await waitFor(() => {
        expect(clientApi.sendConversationMedia).toHaveBeenCalledWith(
          'c1',
          expect.any(File),
          expect.objectContaining({ contentType: 'document' }),
        );
      });
    });
  });

  describe('Respostas rápidas (Fase 1, Bloco F1.9)', () => {
    it('busca as respostas da sessão informada', async () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);

      await waitFor(() => {
        expect(clientApi.fetchQuickReplies).toHaveBeenCalledWith('vendas');
      });
    });

    it('mostra "Nenhuma resposta rápida cadastrada." quando a sessão não tem nenhuma', async () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      await waitFor(() => expect(clientApi.fetchQuickReplies).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('button', { name: 'Respostas rápidas' }));

      expect(await screen.findByText('Nenhuma resposta rápida cadastrada.')).toBeInTheDocument();
    });

    it('lista as respostas cadastradas e insere o texto escolhido no campo (campo vazio)', async () => {
      (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValue({
        quickReplies: [
          {
            id: 'qr-1',
            tenantId: 't1',
            sessionName: 'vendas',
            content: 'Bom dia!',
            createdAt: '2026-08-05T00:00:00.000Z',
            updatedAt: '2026-08-05T00:00:00.000Z',
          },
        ],
      });

      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      fireEvent.click(screen.getByRole('button', { name: 'Respostas rápidas' }));

      fireEvent.click(await screen.findByRole('button', { name: 'Bom dia!' }));

      expect(screen.getByPlaceholderText(/Escreva sua resposta/)).toHaveValue('Bom dia!');
      // Dropdown fecha após a escolha.
      expect(screen.queryByText('Bom dia!', { selector: 'button' })).not.toBeInTheDocument();
    });

    it('acrescenta a resposta escolhida ao texto já digitado (com espaço)', async () => {
      (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValue({
        quickReplies: [
          {
            id: 'qr-1',
            tenantId: 't1',
            sessionName: 'vendas',
            content: 'Qualquer dúvida, estou à disposição.',
            createdAt: '2026-08-05T00:00:00.000Z',
            updatedAt: '2026-08-05T00:00:00.000Z',
          },
        ],
      });

      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      fireEvent.change(screen.getByPlaceholderText(/Escreva sua resposta/), {
        target: { value: 'Olá,' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Respostas rápidas' }));

      fireEvent.click(
        await screen.findByRole('button', { name: 'Qualquer dúvida, estou à disposição.' }),
      );

      expect(screen.getByPlaceholderText(/Escreva sua resposta/)).toHaveValue(
        'Olá, Qualquer dúvida, estou à disposição.',
      );
    });

    it('clicar fora do dropdown fecha a lista sem alterar o campo', async () => {
      (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValue({
        quickReplies: [
          {
            id: 'qr-1',
            tenantId: 't1',
            sessionName: 'vendas',
            content: 'Bom dia!',
            createdAt: '2026-08-05T00:00:00.000Z',
            updatedAt: '2026-08-05T00:00:00.000Z',
          },
        ],
      });

      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      fireEvent.click(screen.getByRole('button', { name: 'Respostas rápidas' }));
      await screen.findByRole('button', { name: 'Bom dia!' });

      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Bom dia!' })).not.toBeInTheDocument();
      });
      expect(screen.getByPlaceholderText(/Escreva sua resposta/)).toHaveValue('');
    });

    /**
     * Redesign 2026-08-25 — "Respostas Rápidas" saiu de dentro do Cérebro
     * da IA e virou um modo "Gerenciar" dentro deste mesmo dropdown
     * (reaproveita `QuickRepliesPanel` inteiro, sem duplicar CRUD).
     */
    describe('modo Gerenciar (Redesign 2026-08-25)', () => {
      it('mostra o botão "Cadastrar / gerenciar respostas rápidas" na lista de inserção', async () => {
        render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
        fireEvent.click(screen.getByRole('button', { name: 'Respostas rápidas' }));

        expect(
          await screen.findByRole('button', { name: /Cadastrar \/ gerenciar respostas rápidas/ }),
        ).toBeInTheDocument();
      });

      it('clicar em "Cadastrar / gerenciar" troca para o QuickRepliesPanel completo, com botão Voltar', async () => {
        render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
        fireEvent.click(screen.getByRole('button', { name: 'Respostas rápidas' }));
        fireEvent.click(
          await screen.findByRole('button', { name: /Cadastrar \/ gerenciar respostas rápidas/ }),
        );

        expect(screen.getByText('Gerenciar respostas rápidas')).toBeInTheDocument();
        expect(screen.getByLabelText('Nova resposta rápida')).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Voltar para a lista de respostas rápidas' }),
        ).toBeInTheDocument();
      });

      it('cadastrar uma nova resposta no modo Gerenciar chama createQuickReply e ela aparece na lista de inserção ao voltar', async () => {
        const novaResposta = {
          id: 'qr-novo',
          tenantId: 't1',
          sessionName: 'vendas',
          content: 'Obrigado pelo contato!',
          createdAt: '2026-08-25T00:00:00.000Z',
          updatedAt: '2026-08-25T00:00:00.000Z',
        };
        (clientApi.createQuickReply as jest.Mock).mockResolvedValue({ quickReply: novaResposta });
        // "Voltar" reexecuta `fetchQuickReplies` na lista de INSERÇÃO (hook
        // separado do `QuickRepliesPanel` embutido) — a 2ª chamada em diante
        // já reflete o que acabou de ser criado.
        (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValueOnce({ quickReplies: [] });
        (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValue({
          quickReplies: [novaResposta],
        });

        render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
        fireEvent.click(screen.getByRole('button', { name: 'Respostas rápidas' }));
        fireEvent.click(
          await screen.findByRole('button', { name: /Cadastrar \/ gerenciar respostas rápidas/ }),
        );

        fireEvent.change(screen.getByLabelText('Nova resposta rápida'), {
          target: { value: 'Obrigado pelo contato!' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

        await waitFor(() => {
          expect(clientApi.createQuickReply).toHaveBeenCalledWith(
            'vendas',
            'Obrigado pelo contato!',
          );
        });

        fireEvent.click(
          screen.getByRole('button', { name: 'Voltar para a lista de respostas rápidas' }),
        );

        expect(
          await screen.findByRole('button', { name: 'Obrigado pelo contato!' }),
        ).toBeInTheDocument();
      });

      it('voltar da tela de Gerenciar sem cadastrar nada preserva a lista de inserção intacta', async () => {
        (clientApi.fetchQuickReplies as jest.Mock).mockResolvedValue({
          quickReplies: [
            {
              id: 'qr-1',
              tenantId: 't1',
              sessionName: 'vendas',
              content: 'Bom dia!',
              createdAt: '2026-08-05T00:00:00.000Z',
              updatedAt: '2026-08-05T00:00:00.000Z',
            },
          ],
        });

        render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
        fireEvent.click(screen.getByRole('button', { name: 'Respostas rápidas' }));
        await screen.findByRole('button', { name: 'Bom dia!' });

        fireEvent.click(
          screen.getByRole('button', { name: /Cadastrar \/ gerenciar respostas rápidas/ }),
        );
        fireEvent.click(
          screen.getByRole('button', { name: 'Voltar para a lista de respostas rápidas' }),
        );

        expect(screen.getByRole('button', { name: 'Bom dia!' })).toBeInTheDocument();
      });

      it('fechar o dropdown pelo ícone enquanto no modo Gerenciar e reabrir volta para a lista de inserção, não direto pra Gerenciar', async () => {
        render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
        fireEvent.click(screen.getByRole('button', { name: 'Respostas rápidas' }));
        fireEvent.click(
          await screen.findByRole('button', { name: /Cadastrar \/ gerenciar respostas rápidas/ }),
        );
        expect(screen.getByText('Gerenciar respostas rápidas')).toBeInTheDocument();

        // Fecha
        fireEvent.click(screen.getByRole('button', { name: 'Respostas rápidas' }));
        expect(screen.queryByText('Gerenciar respostas rápidas')).not.toBeInTheDocument();

        // Reabre
        fireEvent.click(screen.getByRole('button', { name: 'Respostas rápidas' }));
        expect(screen.queryByText('Gerenciar respostas rápidas')).not.toBeInTheDocument();
        expect(
          await screen.findByRole('button', { name: /Cadastrar \/ gerenciar respostas rápidas/ }),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Reskin 2026-08-27 — casca em pill', () => {
    it('o botão Enviar é FIXO: existe mesmo com o campo vazio (sem toggle de microfone)', () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /microfone|gravar/i })).not.toBeInTheDocument();
    });

    it('não existe botão de emoji (o app não tem seletor de emoji)', () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      expect(screen.queryByRole('button', { name: /emoji/i })).not.toBeInTheDocument();
    });

    it('Enviar fica desabilitado sem texto e sem anexo, e habilita ao digitar', () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      const send = screen.getByRole('button', { name: 'Enviar' });
      expect(send).toBeDisabled();
      fireEvent.change(screen.getByPlaceholderText(/Escreva sua resposta/), {
        target: { value: 'oi' },
      });
      expect(send).toBeEnabled();
    });

    it('a casca é uma cápsula (raio alto), não um retângulo', () => {
      const { container } = render(
        <MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />,
      );
      expect(container.querySelector('.rounded-\\[22px\\]')).toBeInTheDocument();
    });

    it('a textarea começa com uma linha e cresce até o teto (sem virar caixa quadrada)', () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      const textarea = screen.getByPlaceholderText(/Escreva sua resposta/) as HTMLTextAreaElement;
      expect(textarea).toHaveAttribute('rows', '1');
      expect(textarea.className).toContain('max-h-[132px]');
    });

    it('a dica "Enter envia" sai da UI e vira title da textarea', () => {
      render(<MessageComposer conversationId="c1" sessionName="vendas" onSent={onSent} />);
      expect(screen.queryByText(/Enter envia/)).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Escreva sua resposta/)).toHaveAttribute(
        'title',
        'Enter envia · Shift+Enter quebra linha',
      );
    });
  });
});
