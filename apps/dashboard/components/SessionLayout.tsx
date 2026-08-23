import type { ReactNode } from 'react';
import SessionRail from '@/components/SessionRail';
import SessionHeader from '@/components/SessionHeader';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import { AiToggleProvider } from '@/contexts/AiToggleContext';

interface SessionLayoutProps {
  tenantId: string;
  sessionName: string;
  children: ReactNode;
}

/**
 * Milestone 6, Bloco M6H-1 — moldura de UMA sessão de WhatsApp: `SessionHeader`
 * (topo, igual em todo o produto) + `SessionRail` (nível 2 de navegação, ADR
 * #74) + conteúdo. Nível 1 (`pages/index.tsx`, o Workspace) NÃO usa este
 * layout — propositalmente sem rail nenhum.
 *
 * Reskin 2026-08-06: `Header` (genérico, com identidade do usuário/logout)
 * trocado por `SessionHeader` (enxuto — marca + nome da sessão + status),
 * conforme Design System §5/§7 — identidade/logout migraram para
 * `AccountMenu`, dentro de `SessionRail`. `tenantId` deixou de ser necessário
 * aqui (mantido no prop só por retrocompatibilidade de quem já chama este
 * componente) — `Header.tsx` continua existindo, intocado, para
 * Workspace/Login.
 *
 * Correção 2026-08-07 (pedido do fundador): o cabeçalho estava ANINHADO ao
 * lado do rail (mesma altura, começando só depois dos 56px do rail) — o
 * mockup (`Francis Pipeline.dc.html` linhas 28-42) empilha um `<header>` de
 * ponta a ponta no topo e SÓ ABAIXO dele abre a linha com `<nav>` (rail) +
 * `<section>` (conteúdo). Estrutura corrigida para bater com isso: o rail
 * agora começa "um slot mais abaixo", à esquerda do conteúdo, nunca por
 * baixo do cabeçalho.
 *
 * Correção 2026-08-07 (Botão POWER, achado real do fundador: o selo das
 * conversas só atualizava depois de F5) — `AiToggleProvider` montado AQUI,
 * envolvendo cabeçalho E conteúdo: um único `useAiToggle` compartilhado por
 * toda a sessão, em vez de cada consumidor (`AiPowerToggle` no cabeçalho,
 * `ConversationInbox` no conteúdo) buscar/guardar sua própria cópia
 * desincronizada. Ver `contexts/AiToggleContext.tsx`.
 */
export default function SessionLayout({ sessionName, children }: SessionLayoutProps): JSX.Element {
  return (
    <AiToggleProvider sessionName={sessionName}>
      <div className="flex h-screen flex-col bg-background">
        <SessionHeader sessionName={sessionName} />
        <div className="flex flex-1 overflow-hidden">
          <SessionRail sessionName={sessionName} />
          {/*
            Onda 3 do redesign (2026-08-23) — raio de dano contido: se a
            TELA (Conversas, Pipeline, Analytics...) quebrar, cabeçalho e
            rail continuam de pé, e o operador ainda consegue navegar para
            outra tela sem precisar de F5. Ver docstring de
            `AppErrorBoundary` para o achado real que motivou isto.
          */}
          <main className="flex-1 overflow-y-auto">
            <AppErrorBoundary>{children}</AppErrorBoundary>
          </main>
        </div>
      </div>
    </AiToggleProvider>
  );
}
