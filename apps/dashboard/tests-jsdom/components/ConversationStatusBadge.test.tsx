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
});
