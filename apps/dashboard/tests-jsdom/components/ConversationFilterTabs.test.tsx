/**
 * `ConversationFilterTabs` — as pílulas de filtro da inbox.
 *
 * Reduzidas de 5 para 3 opções em 2026-09-05 (pedido do fundador): na coluna
 * de 344px as 5 ficavam cortadas mesmo depois de duas rodadas de aperto de
 * padding/fonte. "Humano" virou parte de "Aguardando" (a fila humana inteira:
 * esperando atendente OU já em atendimento) e "IA" saiu por ser praticamente
 * o complemento de "Todas". "Não lidas" saiu junto — era o único filtro
 * resolvido no cliente, e portanto o único que mentia sobre o resultado
 * quando a lista estava paginada.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationFilterTabs from '../../components/ConversationFilterTabs';

describe('ConversationFilterTabs', () => {
  it('renderiza exatamente as 3 opções', () => {
    render(<ConversationFilterTabs value="all" onChange={jest.fn()} />);

    expect(screen.getByText('Todas')).toBeInTheDocument();
    expect(screen.getByText('Aguardando')).toBeInTheDocument();
    expect(screen.getByText('Arquivadas')).toBeInTheDocument();
    // Trava de regressão: as opções removidas não devem voltar sem que este
    // teste quebre primeiro — foi o excesso delas que cortava a barra.
    expect(screen.queryByText('Não lidas')).not.toBeInTheDocument();
    expect(screen.queryByText('IA')).not.toBeInTheDocument();
    expect(screen.queryByText('Humano')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('marca aria-pressed=true só na opção ativa', () => {
    render(<ConversationFilterTabs value="waiting" onChange={jest.fn()} />);
    expect(screen.getByText('Aguardando')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Todas')).toHaveAttribute('aria-pressed', 'false');
  });

  it('chama onChange com o value da opção clicada', () => {
    const onChange = jest.fn();
    render(<ConversationFilterTabs value="all" onChange={onChange} />);

    fireEvent.click(screen.getByText('Aguardando'));

    expect(onChange).toHaveBeenCalledWith('waiting');
  });
});
