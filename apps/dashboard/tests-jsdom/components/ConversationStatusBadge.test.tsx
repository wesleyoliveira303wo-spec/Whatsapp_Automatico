/**
 * Reforma do escalonamento (2026-07-25) — primeiro teste dedicado deste
 * componente (antes só coberto indiretamente). `escalatedAt` sobrepõe o
 * rótulo/cor normais por "Aguardando atendente", independente de `status`
 * (a IA continua respondendo mesmo com a conversa sinalizada).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationStatusBadge from '../../components/ConversationStatusBadge';

describe('ConversationStatusBadge (reforma do escalonamento, 2026-07-25)', () => {
  it('mostra "Bot respondendo" quando status=bot e sem escalatedAt', () => {
    render(<ConversationStatusBadge status="bot" />);
    expect(screen.getByText('Bot respondendo')).toBeInTheDocument();
  });

  it('mostra "Atendimento humano" quando status=human e sem escalatedAt', () => {
    render(<ConversationStatusBadge status="human" />);
    expect(screen.getByText('Atendimento humano')).toBeInTheDocument();
  });

  it('mostra "Aguardando atendente" quando escalatedAt está definido, mesmo com status=bot', () => {
    render(<ConversationStatusBadge status="bot" escalatedAt="2026-07-25T10:00:00.000Z" />);
    expect(screen.getByText('Aguardando atendente')).toBeInTheDocument();
    expect(screen.queryByText('Bot respondendo')).not.toBeInTheDocument();
  });

  // Fase 1 (2026-08-07) — Botão POWER.
  describe('aiEnabled=false (Botão POWER desligado)', () => {
    it('sobrepõe "Bot respondendo" por "IA desativada"', () => {
      render(<ConversationStatusBadge status="bot" aiEnabled={false} />);
      expect(screen.getByText('IA desativada')).toBeInTheDocument();
      expect(screen.queryByText('Bot respondendo')).not.toBeInTheDocument();
    });

    it('sobrepõe "Atendimento humano" por "IA desativada" também (decisão do fundador)', () => {
      render(<ConversationStatusBadge status="human" aiEnabled={false} />);
      expect(screen.getByText('IA desativada')).toBeInTheDocument();
      expect(screen.queryByText('Atendimento humano')).not.toBeInTheDocument();
    });

    it('sobrepõe "Aguardando atendente" por "IA desativada" também', () => {
      render(
        <ConversationStatusBadge
          status="bot"
          escalatedAt="2026-07-25T10:00:00.000Z"
          aiEnabled={false}
        />,
      );
      expect(screen.getByText('IA desativada')).toBeInTheDocument();
      expect(screen.queryByText('Aguardando atendente')).not.toBeInTheDocument();
    });

    it('aiEnabled omitido (default true) preserva o comportamento de sempre', () => {
      render(<ConversationStatusBadge status="bot" />);
      expect(screen.getByText('Bot respondendo')).toBeInTheDocument();
    });
  });
});
