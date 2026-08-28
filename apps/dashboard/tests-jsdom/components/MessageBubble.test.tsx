/**
 * Fase 1, Bloco F1.1 (ADR #90) — primeiro teste dedicado de `MessageBubble`
 * (gap pré-existente: o componente nunca teve teste próprio antes deste
 * bloco, só cobertura indireta via `MessageTimeline.test.tsx`).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageBubble from '../../components/MessageBubble';
import type { ConversationMessage } from '../../lib/clientApi';

function buildMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: 'm1',
    tenantId: 't1',
    conversationId: 'c1',
    direction: 'inbound',
    content: 'Olá, tudo bem?',
    contentType: 'text',
    occurredAt: '2026-07-24T09:00:00.000Z',
    ...overrides,
  };
}

describe('MessageBubble (Fase 1, Bloco F1.1 — mídia)', () => {
  it('mensagem de texto: renderiza só o conteúdo (comportamento pré-F1.1 inalterado)', () => {
    render(<MessageBubble message={buildMessage()} />);
    expect(screen.getByText('Olá, tudo bem?')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('contentType ausente (dado antigo): trata como texto, sem quebrar', () => {
    const message = buildMessage();
    delete (message as Partial<ConversationMessage>).contentType;
    render(<MessageBubble message={message} />);
    expect(screen.getByText('Olá, tudo bem?')).toBeInTheDocument();
  });

  it('mensagem de imagem: renderiza <img> apontando para o proxy BFF de mídia, com a legenda abaixo', () => {
    const message = buildMessage({
      contentType: 'image',
      content: 'Legenda da foto',
      media: {
        mimeType: 'image/jpeg',
        url: 'https://mmg.whatsapp.net/x.enc',
        mediaKeyEncrypted: 'enc:abc',
      },
    });
    render(<MessageBubble message={message} />);

    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toContain('/api/conversations/c1/messages/m1/media');
    expect(screen.getByText('Legenda da foto')).toBeInTheDocument();
  });

  it('mensagem de imagem sem legenda: não renderiza parágrafo de texto vazio', () => {
    const message = buildMessage({
      contentType: 'image',
      content: '',
      media: {
        mimeType: 'image/jpeg',
        url: 'https://mmg.whatsapp.net/x.enc',
        mediaKeyEncrypted: 'enc:abc',
      },
    });
    const { container } = render(<MessageBubble message={message} />);
    expect(container.querySelector('p.whitespace-pre-wrap')).not.toBeInTheDocument();
  });

  it('mensagem de áudio: renderiza <audio controls> apontando para o proxy BFF', () => {
    const message = buildMessage({
      contentType: 'audio',
      content: '',
      media: {
        mimeType: 'audio/ogg',
        url: 'https://mmg.whatsapp.net/x.enc',
        mediaKeyEncrypted: 'enc:abc',
      },
    });
    const { container } = render(<MessageBubble message={message} />);
    const audio = container.querySelector('audio');
    expect(audio).toBeInTheDocument();
    expect(audio?.getAttribute('src')).toContain('/api/conversations/c1/messages/m1/media');
  });

  it('mensagem de vídeo: renderiza <video controls> apontando para o proxy BFF', () => {
    const message = buildMessage({
      contentType: 'video',
      content: '',
      media: {
        mimeType: 'video/mp4',
        url: 'https://mmg.whatsapp.net/x.enc',
        mediaKeyEncrypted: 'enc:abc',
      },
    });
    const { container } = render(<MessageBubble message={message} />);
    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video?.getAttribute('src')).toContain('/api/conversations/c1/messages/m1/media');
  });

  it('mensagem de documento: renderiza link com o nome do arquivo, apontando para o proxy BFF', () => {
    const message = buildMessage({
      contentType: 'document',
      content: '',
      media: {
        mimeType: 'application/pdf',
        url: 'https://mmg.whatsapp.net/x.enc',
        mediaKeyEncrypted: 'enc:abc',
        fileName: 'contrato.pdf',
      },
    });
    render(<MessageBubble message={message} />);

    const link = screen.getByRole('link') as HTMLAnchorElement;
    expect(link.href).toContain('/api/conversations/c1/messages/m1/media');
    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();
  });

  it('mensagem de documento sem fileName: usa rótulo genérico "Documento"', () => {
    const message = buildMessage({
      contentType: 'document',
      content: '',
      media: {
        mimeType: 'application/pdf',
        url: 'https://mmg.whatsapp.net/x.enc',
        mediaKeyEncrypted: 'enc:abc',
      },
    });
    render(<MessageBubble message={message} />);
    expect(screen.getByText('Documento')).toBeInTheDocument();
  });

  it('mensagem de figurinha: renderiza como imagem (mesmo tratamento de "image")', () => {
    const message = buildMessage({
      contentType: 'sticker',
      content: '',
      media: {
        mimeType: 'image/webp',
        url: 'https://mmg.whatsapp.net/x.enc',
        mediaKeyEncrypted: 'enc:abc',
      },
    });
    render(<MessageBubble message={message} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('contentType de mídia sem media (dado inconsistente): não quebra, não renderiza mídia', () => {
    const message = buildMessage({ contentType: 'image', content: 'só texto', media: undefined });
    render(<MessageBubble message={message} />);
    expect(screen.getByText('só texto')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  describe('Reskin 2026-08-27 — fidelidade à referência', () => {
    it('mensagem recebida: bolha clara à esquerda', () => {
      const { container } = render(<MessageBubble message={buildMessage()} />);
      expect(container.querySelector('li')).toHaveClass('items-start');
      expect(container.querySelector('.bg-chat-bubble-in')).toBeInTheDocument();
    });

    it('mensagem enviada: bolha verde-clara à direita', () => {
      const { container } = render(
        <MessageBubble message={buildMessage({ direction: 'outbound' })} />,
      );
      expect(container.querySelector('li')).toHaveClass('items-end');
      expect(container.querySelector('.bg-chat-bubble-out')).toBeInTheDocument();
    });

    it('horário aparece só como HH:MM (não a data completa)', () => {
      render(<MessageBubble message={buildMessage()} />);
      expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
      expect(screen.queryByText(/\d{2}\/\d{2}\/\d{4}/)).not.toBeInTheDocument();
    });

    it('mensagem enviada: mostra o indicador "Enviado"', () => {
      render(<MessageBubble message={buildMessage({ direction: 'outbound' })} />);
      expect(screen.getByLabelText('Enviado')).toBeInTheDocument();
    });

    it('mensagem recebida: NÃO mostra indicador de entrega', () => {
      render(<MessageBubble message={buildMessage()} />);
      expect(screen.queryByLabelText('Enviado')).not.toBeInTheDocument();
    });

    it('nunca mostra check duplo de "lido" (o backend não tem esse dado)', () => {
      render(<MessageBubble message={buildMessage({ direction: 'outbound' })} />);
      expect(screen.queryByLabelText('Lido')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Entregue')).not.toBeInTheDocument();
    });

    it('selo "Gerada por IA" fica ACIMA da bolha, não dentro dela', () => {
      const { container } = render(
        <MessageBubble
          message={buildMessage({ direction: 'outbound' })}
          aiInteraction={{
            id: 'i1',
            tenantId: 't1',
            conversationId: 'c1',
            provider: 'gemini',
            model: 'gemini-3.5-flash',
            promptVersion: 'v4',
            tokensInput: 1,
            tokensOutput: 1,
            costUsd: '0',
            latencyMs: 1,
            status: 'success',
          }}
        />,
      );
      const badge = screen.getByText(/Gerada por IA/);
      const bubble = container.querySelector('.bg-chat-bubble-out') as HTMLElement;
      expect(bubble).toBeInTheDocument();
      expect(bubble.contains(badge)).toBe(false);
    });

    it('documento: mostra a extensão real derivada do nome do arquivo', () => {
      render(
        <MessageBubble
          message={buildMessage({
            contentType: 'document',
            content: '',
            media: {
              mimeType: 'application/pdf',
              url: 'https://mmg.whatsapp.net/x.enc',
              mediaKeyEncrypted: 'enc:abc',
              fileName: 'contrato.pdf',
            },
          })}
        />,
      );
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });

    it('documento: NUNCA inventa tamanho nem número de páginas', () => {
      render(
        <MessageBubble
          message={buildMessage({
            contentType: 'document',
            content: '',
            media: {
              mimeType: 'application/pdf',
              url: 'https://mmg.whatsapp.net/x.enc',
              mediaKeyEncrypted: 'enc:abc',
              fileName: 'contrato.pdf',
            },
          })}
        />,
      );
      expect(screen.queryByText(/página/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/KB|MB/)).not.toBeInTheDocument();
    });

    it('imagem: horário aparece como chip sobreposto à mídia', () => {
      const { container } = render(
        <MessageBubble
          message={buildMessage({
            contentType: 'image',
            content: '',
            media: {
              mimeType: 'image/jpeg',
              url: 'https://mmg.whatsapp.net/x.enc',
              mediaKeyEncrypted: 'enc:abc',
            },
          })}
        />,
      );
      expect(container.querySelector('.bg-black\\/45')).toBeInTheDocument();
    });
  });
});
