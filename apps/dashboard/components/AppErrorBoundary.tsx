import { Component, type ErrorInfo, type ReactNode } from 'react';
import ErrorState from '@/components/states/ErrorState';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Onda 3 do redesign (2026-08-23) — captura QUALQUER erro de render de um
 * componente-filho e mostra uma tela de erro de verdade, em vez de deixar o
 * React desmontar a árvore inteira e o usuário ver uma tela em branco.
 *
 * Achado real que motivou este bloco: na auditoria original, um acesso sem
 * guarda (`stats.bySource[key]`) em `ContactsPanel` derrubava a tela INTEIRA
 * de Contatos — não só o card que tinha o bug — porque não existia NENHUM
 * Error Boundary no produto. Um card quebrado deveria custar um card, nunca
 * a tela inteira; um componente de página quebrado deveria custar a tela,
 * nunca o app inteiro virar branco. Por isso este componente é montado em
 * DOIS níveis (ver `_app.tsx` e `SessionLayout.tsx`): um por página/sessão
 * (raio de dano contido) e um na raiz (rede de segurança final).
 *
 * É INTENCIONALMENTE uma class component — `componentDidCatch`/
 * `getDerivedStateFromError` só existem nesse formato; não há hook
 * equivalente em React 18. Nenhuma dependência nova.
 *
 * `console.error` no `componentDidCatch` preserva o stack trace REAL no
 * console do navegador (para depuração), enquanto a TELA mostra só uma
 * mensagem em português — a mesma disciplina de `ErrorState` em todo o
 * produto: usuário nunca vê `error.message`/stack cru.
 */
export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console -- única saída de diagnóstico disponível no navegador do operador; a tela nunca mostra isto.
    console.error('[AppErrorBoundary] Erro não tratado em um componente:', error, info.componentStack);
  }

  private readonly handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[280px] items-center justify-center p-6">
          <ErrorState
            title="Algo quebrou nesta tela"
            description="Um componente parou de funcionar. Tentar de novo geralmente resolve; se persistir, recarregue a página."
            onRetry={this.handleRetry}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
