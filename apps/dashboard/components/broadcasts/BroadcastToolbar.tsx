import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Filter, Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ToolbarOption<T extends string> {
  key: T;
  label: string;
}

interface BroadcastToolbarProps<F extends string, S extends string> {
  searchValue: string;
  onSearchChange: (value: string) => void;
  /** Ex.: "Buscar disparo por nome" — vira placeholder E rótulo acessível. */
  searchLabel: string;
  filterOptions: ToolbarOption<F>[];
  filterValue: F;
  onFilterChange: (value: F) => void;
  sortOptions: ToolbarOption<S>[];
  sortValue: S;
  onSortChange: (value: S) => void;
  actionLabel: string;
  onAction: () => void;
}

/** Menu suspenso simples (sem Radix): um botão, uma lista, fecha no clique fora. */
function Menu<T extends string>({
  icon,
  label,
  options,
  value,
  onChange,
  align,
}: {
  icon: JSX.Element;
  label: string;
  options: ToolbarOption<T>[];
  value: T;
  onChange: (value: T) => void;
  align: 'left' | 'right';
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocumentClick(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="outline"
        size="cta"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {label}
      </Button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full z-10 mt-1 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitemradio"
              aria-checked={option.key === value}
              onClick={() => {
                onChange(option.key);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-muted',
                option.key === value ? 'font-medium text-primary' : 'text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Barra de ferramentas de uma tela de disparos — Revisão de Disparos
 * (2026-09-12): busca, filtro, ordenação e a ação principal, sempre na mesma
 * ordem e no mesmo lugar nas duas abas.
 *
 * Antes disto, "Para contatos" tinha busca/filtro/ordenação e "Para grupos"
 * não tinha nada — as duas telas nasceram em épocas diferentes. Compartilhar a
 * barra é o que impede a próxima divergência: a aba nova herda o
 * comportamento em vez de reimplementá-lo pela metade.
 */
export default function BroadcastToolbar<F extends string, S extends string>({
  searchValue,
  onSearchChange,
  searchLabel,
  filterOptions,
  filterValue,
  onFilterChange,
  sortOptions,
  sortValue,
  onSortChange,
  actionLabel,
  onAction,
}: BroadcastToolbarProps<F, S>): JSX.Element {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[220px] flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
          className="h-[34px] rounded-[9px] border-border bg-panel pl-8 text-[13px]"
        />
      </div>

      <Menu
        icon={<Filter className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
        label={
          filterValue === filterOptions[0]?.key
            ? 'Filtros'
            : (filterOptions.find((option) => option.key === filterValue)?.label ?? 'Filtros')
        }
        options={filterOptions}
        value={filterValue}
        onChange={onFilterChange}
        align="left"
      />

      <Menu
        icon={<ArrowUpDown className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
        label={sortOptions.find((option) => option.key === sortValue)?.label ?? 'Ordenar'}
        options={sortOptions}
        value={sortValue}
        onChange={onSortChange}
        align="right"
      />

      <Button type="button" size="cta" className="shrink-0" onClick={onAction}>
        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {actionLabel}
      </Button>
    </div>
  );
}
