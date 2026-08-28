/**
 * Reskin 2026-08-27 — grupo "horário + status" que vive DENTRO da bolha
 * (variante normal) ou como chip sobre a mídia (variante overlay).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageMeta from '../../components/MessageMeta';

describe('MessageMeta', () => {
  it('renderiza o horário no formato HH:MM', () => {
    render(<MessageMeta occurredAt="2026-07-24T12:31:00.000Z" />);
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('sem status: não renderiza nenhum indicador de entrega', () => {
    render(<MessageMeta occurredAt="2026-07-24T12:31:00.000Z" />);
    expect(screen.queryByLabelText('Enviado')).not.toBeInTheDocument();
  });

  it('com status: renderiza o indicador de entrega ao lado do horário', () => {
    render(<MessageMeta occurredAt="2026-07-24T12:31:00.000Z" status="sent" />);
    expect(screen.getByLabelText('Enviado')).toBeInTheDocument();
  });

  it('variante overlay: aplica o chip escuro translúcido usado sobre mídia', () => {
    const { container } = render(<MessageMeta occurredAt="2026-07-24T12:31:00.000Z" overlay />);
    expect(container.querySelector('.bg-black\\/45')).toBeInTheDocument();
  });

  it('variante normal: usa a cor de meta do chat, não o chip de overlay', () => {
    const { container } = render(<MessageMeta occurredAt="2026-07-24T12:31:00.000Z" />);
    expect(container.querySelector('.text-chat-meta')).toBeInTheDocument();
    expect(container.querySelector('.bg-black\\/45')).not.toBeInTheDocument();
  });
});
