/**
 * Onda 3 do redesign (2026-08-23) — teste do `AppErrorBoundary`.
 *
 * `console.error` é silenciado durante o teste: React chama `console.error`
 * duas vezes por erro capturado por um boundary (um do próprio React,
 * fora do nosso controle; outro do nosso `componentDidCatch`) — comportamento
 * documentado do React, não um sinal de teste quebrado.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AppErrorBoundary from '../../components/AppErrorBoundary';

function Bomb(): JSX.Element {
  throw new Error('Componente quebrou de propósito para o teste');
}

describe('AppErrorBoundary', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renderiza os filhos normalmente quando não há erro', () => {
    render(
      <AppErrorBoundary>
        <p>Conteúdo normal</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('Conteúdo normal')).toBeInTheDocument();
  });

  it('captura o erro de um filho e mostra a tela de erro em vez de deixar a árvore em branco', () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('Algo quebrou nesta tela')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo normal')).not.toBeInTheDocument();
  });

  it('nunca mostra a mensagem crua do erro (error.message) na tela', () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );

    expect(
      screen.queryByText('Componente quebrou de propósito para o teste'),
    ).not.toBeInTheDocument();
  });

  it('loga o erro real no console para depuração', () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[AppErrorBoundary] Erro não tratado em um componente:',
      expect.any(Error),
      expect.anything(),
    );
  });

  it('"Tentar de novo" tenta remontar os filhos (não reseta sozinho quando o erro persiste, mas a UI responde ao clique)', () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );

    const retryButton = screen.getByRole('button', { name: 'Tentar de novo' });
    // Não deve lançar ao clicar — o boundary tenta renderizar os filhos de
    // novo (que quebram outra vez, já que `Bomb` sempre lança) e volta a
    // mostrar a tela de erro, sem derrubar o teste.
    expect(() => fireEvent.click(retryButton)).not.toThrow();
    expect(screen.getByText('Algo quebrou nesta tela')).toBeInTheDocument();
  });
});
