/**
 * Reskin 2026-08-27 — primeiro teste dedicado do player de áudio (gap
 * pré-existente: só havia cobertura indireta via `MessageBubble.test.tsx`).
 * Cobre a waveform em barras da referência, os estados de reprodução e o
 * fato de o horário viver dentro da própria moldura.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageAudioPlayer from '../../components/MessageAudioPlayer';

describe('MessageAudioPlayer', () => {
  beforeAll(() => {
    // jsdom não implementa reprodução de mídia.
    window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = jest.fn();
  });

  it('renderiza a waveform como um conjunto de barras, não uma linha só', () => {
    const { container } = render(<MessageAudioPlayer src="/media/a.ogg" />);
    const bars = container.querySelectorAll('[data-waveform-bar]');
    expect(bars.length).toBeGreaterThan(10);
  });

  it('a waveform é estável para o mesmo src (não muda a cada render)', () => {
    const first = render(<MessageAudioPlayer src="/media/a.ogg" />);
    const firstHeights = Array.from(
      first.container.querySelectorAll('[data-waveform-bar]'),
    ).map((bar) => (bar as HTMLElement).style.height);
    first.unmount();

    const second = render(<MessageAudioPlayer src="/media/a.ogg" />);
    const secondHeights = Array.from(
      second.container.querySelectorAll('[data-waveform-bar]'),
    ).map((bar) => (bar as HTMLElement).style.height);

    expect(secondHeights).toEqual(firstHeights);
  });

  it('começa parado, mostrando o botão "Reproduzir áudio"', () => {
    render(<MessageAudioPlayer src="/media/a.ogg" />);
    expect(screen.getByRole('button', { name: 'Reproduzir áudio' })).toBeInTheDocument();
  });

  it('clicar em reproduzir troca o botão para "Pausar áudio"', () => {
    render(<MessageAudioPlayer src="/media/a.ogg" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
    expect(screen.getByRole('button', { name: 'Pausar áudio' })).toBeInTheDocument();
  });

  it('clicar em pausar volta ao estado parado', () => {
    render(<MessageAudioPlayer src="/media/a.ogg" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pausar áudio' }));
    expect(screen.getByRole('button', { name: 'Reproduzir áudio' })).toBeInTheDocument();
  });

  it('com occurredAt: mostra o horário dentro da própria moldura do áudio', () => {
    render(<MessageAudioPlayer src="/media/a.ogg" occurredAt="2026-07-24T12:31:00.000Z" />);
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('com status: mostra o indicador de entrega', () => {
    render(
      <MessageAudioPlayer
        src="/media/a.ogg"
        occurredAt="2026-07-24T12:31:00.000Z"
        status="sent"
      />,
    );
    expect(screen.getByLabelText('Enviado')).toBeInTheDocument();
  });
});
