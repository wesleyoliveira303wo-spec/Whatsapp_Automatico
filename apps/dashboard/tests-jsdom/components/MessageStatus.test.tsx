/**
 * Reskin 2026-08-27 — indicador de entrega dentro da bolha enviada.
 * O componente nasce com os 4 estados visuais da referência (WhatsApp);
 * hoje o backend só conhece "enviado" e `MessageBubble` sempre passa
 * `'sent'` — ver comentário no próprio componente.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageStatus from '../../components/MessageStatus';

describe('MessageStatus', () => {
  it('estado "sending": rótulo acessível "Enviando"', () => {
    render(<MessageStatus status="sending" />);
    expect(screen.getByLabelText('Enviando')).toBeInTheDocument();
  });

  it('estado "sent": rótulo acessível "Enviado"', () => {
    render(<MessageStatus status="sent" />);
    expect(screen.getByLabelText('Enviado')).toBeInTheDocument();
  });

  it('estado "delivered": rótulo acessível "Entregue"', () => {
    render(<MessageStatus status="delivered" />);
    expect(screen.getByLabelText('Entregue')).toBeInTheDocument();
  });

  it('estado "read": rótulo acessível "Lido" e cor azul da referência', () => {
    const { container } = render(<MessageStatus status="read" />);
    expect(screen.getByLabelText('Lido')).toBeInTheDocument();
    expect(container.querySelector('.text-\\[\\#53bdeb\\]')).toBeInTheDocument();
  });

  it('aceita className extra sem perder o rótulo', () => {
    const { container } = render(<MessageStatus status="sent" className="ml-1" />);
    expect(container.querySelector('.ml-1')).toBeInTheDocument();
  });
});
