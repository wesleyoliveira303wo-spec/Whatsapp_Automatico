import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Milestone 6, Bloco M6C-3 (ADR #62) — primitivo `Table` (compound
 * component), padrão shadcn/ui "new-york". Sem Radix — é HTML semântico
 * (`<table>`) + Tailwind; acessibilidade vem da semântica nativa.
 *
 * ONDA 1 DO REDESIGN (2026-08-22) — reescrito para unificar as 3 tecnologias
 * de tabela que conviviam no produto (este primitivo, um `<table>` cru em
 * `CampaignsPanel`, `<div>`s flex em `CampaignDetailPanel`) e, mais
 * importante, para CORRIGIR um bug real e ao vivo encontrado ao comparar
 * esta fonte contra o registry oficial do shadcn/ui via MCP: o wrapper
 * oficial embute `overflow-x-auto`, e ESTE primitivo (herdado de uma versão
 * anterior do shadcn) embutia `overflow-auto` (os dois eixos) — medido em
 * produção (`/sessions/:s/settings`, aba Equipe): o menu "..." de
 * `UserManagementPanel` (`RowActionsMenu`, `absolute top-full`) estourava o
 * wrapper por baixo e ficava CORTADO (`wrapperBottom: 498, menuBottom: 524`
 * — 26px do menu invisíveis). Mesma classe de bug já documentada e corrigida
 * duas vezes neste projeto (`CampaignsPanel`, 2026-08-18/21): `overflow-x`
 * diferente de `visible` força `overflow-y` a virar `auto` também — não há
 * meio-termo de "só rolagem horizontal" quando existe um menu `absolute`
 * dentro. A correção estrutural é a mesma das outras duas vezes: o wrapper
 * NUNCA declara `overflow` nenhum. Uma tabela realmente mais larga que a
 * tela rola a página inteira (raro neste produto) em vez de cortar menus.
 *
 * Defaults de `TableHead`/`TableRow`/`TableCell` também deixaram de ser o
 * genérico do shadcn e passaram a ser os valores que `UserManagementPanel`/
 * `AuditLogPanel` já repetiam à mão em toda linha (Design System §6:
 * "cabeçalho 11px uppercase/600/#5C6B64... só divisória horizontal 1px entre
 * linhas") — reduz duplicação E garante que qualquer tabela NOVA nasça no
 * padrão certo sem que o autor precise lembrar de todas as classes.
 */
const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full">
      <table
        ref={ref}
        className={cn('w-full border-collapse text-left text-sm', className)}
        {...props}
      />
    </div>
  ),
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  // `[&_tr]:hover:bg-transparent` — o cabeçalho nunca deve reagir a hover
  // como se fosse uma linha de dado; antes disso, cada consumidor repetia
  // `<TableRow className="hover:bg-transparent">` na própria linha do
  // cabeçalho para conseguir o mesmo efeito.
  <thead
    ref={ref}
    className={cn('[&_tr]:border-b [&_tr]:hover:bg-transparent', className)}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      // SEM hover por padrão (diferente do shadcn oficial, que traz
      // `hover:bg-muted/50` de fábrica) — os dois consumidores reais deste
      // primitivo até aqui (Usuários/Auditoria, linhas não-clicáveis)
      // desligavam esse hover à mão. Uma tabela cujas linhas SÃO clicáveis
      // (ex.: abrir uma campanha) adiciona `hover:bg-muted/50` via
      // `className` — decisão de conteúdo, não algo que o primitivo deveria
      // impor a quem não precisa.
      className={cn('border-b transition-colors data-[state=selected]:bg-muted', className)}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-9 whitespace-nowrap px-2 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&:has([role=checkbox])]:pr-0',
      className,
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'px-2 py-[11px] align-middle text-[12.5px] [&:has([role=checkbox])]:pr-0',
      className,
    )}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
));
TableCaption.displayName = 'TableCaption';

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
