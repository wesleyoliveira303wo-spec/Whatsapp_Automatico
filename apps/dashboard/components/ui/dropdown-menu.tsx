import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

import { cn } from '@/lib/utils';

/**
 * `DropdownMenu` — padrão shadcn/ui "new-york" sobre
 * `@radix-ui/react-dropdown-menu` (mesmo racional de `ui/dialog.tsx`: o
 * Radix cuida de foco/ARIA/portal/posicionamento, este arquivo só estiliza).
 *
 * Adicionado (2026-08-29, achado real do fundador) pra substituir o menu "⋮"
 * feito à mão em `CampaignsPanel.tsx` — aquele era um `<div>` `absolute`
 * dentro do próprio `<td>` da tabela, sem portal e sem detecção de colisão
 * com a borda da tela. Em larguras de janela entre a tabela ficar larga o
 * suficiente e o layout virar duas colunas (~1280-1350px), a coluna "Ações"
 * vazava visualmente por cima do painel lateral — E não dava pra simplesmente
 * conter isso com `overflow-x-auto` no container da tabela, porque (regra do
 * CSS) declarar `overflow-x` diferente de `visible` força `overflow-y` a virar
 * `auto` também, cortando verticalmente esse mesmo menu (bug JÁ catalogado
 * antes, comentário em `CampaignsPanel.tsx`). Os dois bugs eram a mesma causa
 * raiz mal resolvida — um dropdown que não é portal não tem como conviver com
 * QUALQUER contenção de overflow no ancestral.
 *
 * `DropdownMenuPrimitive.Portal` (usado em `DropdownMenuContent` abaixo)
 * resolve os dois de vez: o conteúdo do menu renderiza fora da árvore da
 * tabela (imune a qualquer overflow do ancestral) e o Radix já detecta
 * colisão com a borda da viewport sozinho (nunca mais vaza pra fora da tela,
 * pra nenhum lado, em nenhuma largura).
 */
const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-md px-2.5 py-1.5 text-[13px] outline-none transition-colors focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
