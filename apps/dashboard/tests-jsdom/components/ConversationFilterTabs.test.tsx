/**
 * Redesign 2026-08-05 (R3) — primeiro teste de `ConversationFilterTabs`
 * (gap pré-existente: nunca teve teste dedicado). Cresceu de 3 para 5
 * opções (Todas/Não lidas/Aguardando/IA/Humano) — este arquivo cobre a
 * emissão do `value` escolhido; a resolução server-side vs. client-side de
 * cada opção é responsabilidade de `ConversationInbox`, não deste componente.
 *
 * Correção 2026-08-26 — layout reapertado (padding/gap/fonte menores) para
 * as 5 pílulas caberem inteiras na coluna sem cortar nem precisar rolar;
 * nenhuma opção foi removida (uma tentativa inicial de remover "Humano" foi
 * revertida no mesmo dia — o pedido real era só o enquadramento).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationFilterTabs from '../../components/ConversationFilterTabs';

describe('ConversationFilterTabs (Redesign 2026-08-05, R3)', () => {
  it('renderiza as 5 opções', () => {
    render(<ConversationFilterTabs value="all" onChange={jest.fn()} />);
    expect(screen.getByText('Todas')).toBeInTheDocument();
    expect(screen.getByText('Não lidas')).toBeInTheDocument();
    expect(screen.getByText('Aguardando')).toBeInTheDocument();
    expect(screen.getByText('IA')).toBeInTheDocument();
    expect(screen.getByText('Humano')).toBeInTheDocument();
  });

  it('marca aria-pressed=true só na opção ativa', () => {
    render(<ConversationFilterTabs value="waiting" onChange={jest.fn()} />);
    expect(screen.getByText('Aguardando')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Todas')).toHaveAttribute('aria-pressed', 'false');
  });

  it('chama onChange com o value da opção clicada', () => {
    const onChange = jest.fn();
    render(<ConversationFilterTabs value="all" onChange={onChange} />);
    fireEvent.click(screen.getByText('Não lidas'));
    expect(onChange).toHaveBeenCalledWith('unread');
  });
});
