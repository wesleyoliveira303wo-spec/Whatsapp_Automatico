import type { ReactNode } from 'react';
import SessionRail from '@/components/SessionRail';
import SessionHeader from '@/components/SessionHeader';

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
 */
export default function SessionLayout({ sessionName, children }: SessionLayoutProps): JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-background">
      <SessionHeader sessionName={sessionName} />
      <div className="flex flex-1 overflow-hidden">
        <SessionRail sessionName={sessionName} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
