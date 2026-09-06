import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Search } from 'lucide-react';

import {
  searchPlatform,
  type PlatformSearchGroup,
  type PlatformSearchHit,
  type PlatformSearchKind,
} from '@/lib/platformClientApi';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<PlatformSearchKind, string> = {
  tenant: 'Tenants',
  user: 'Usuários',
  contact: 'Contatos',
  session: 'WhatsApps',
  campaign: 'Campanhas',
};

const DEBOUNCE_MS = 250;
const MIN_LEN = 2;

/**
 * Busca global do `/admin` — Fase 6 (`ADMIN_PLATFORM_MASTER_PLAN.md` §7).
 * Um campo, resultados agrupados por tipo, cada um leva ao detalhe do tenant.
 * Nunca mostra conteúdo de conversa — só a entidade e o caminho até ela.
 */
export default function AdminSearch(): JSX.Element {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<PlatformSearchGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const flat: PlatformSearchHit[] = useMemo(
    () => groups.flatMap((g) => g.hits),
    [groups],
  );

  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_LEN) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      let cancelled = false;
      searchPlatform(term)
        .then((res) => {
          if (!cancelled) {
            setGroups(res.groups);
            setActiveIndex(-1);
          }
        })
        .catch(() => {
          if (!cancelled) setGroups([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent): void {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  function go(hit: PlatformSearchHit): void {
    setOpen(false);
    setQ('');
    setGroups([]);
    void router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (flat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flat.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      go(flat[activeIndex]);
    }
  }

  const showDropdown = open && q.trim().length >= MIN_LEN;

  return (
    <div ref={boxRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar tenant, e-mail, telefone, campanha…"
          aria-label="Busca global"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="admin-search-results"
          className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {showDropdown && (
        <div
          id="admin-search-results"
          role="listbox"
          className="absolute z-50 mt-1 max-h-[70vh] w-[22rem] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {loading && groups.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Buscando…</p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Nada encontrado.</p>
          ) : (
            groups.map((group) => (
              <div key={group.kind} className="py-1">
                <p className="px-2 pb-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                  {KIND_LABEL[group.kind]}
                </p>
                {group.hits.map((hit) => {
                  const idx = flat.indexOf(hit);
                  return (
                    <Link
                      key={`${hit.kind}-${hit.id}`}
                      href={hit.href}
                      role="option"
                      aria-selected={idx === activeIndex}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        go(hit);
                      }}
                      className={cn(
                        'flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        idx === activeIndex ? 'bg-muted' : 'hover:bg-muted',
                      )}
                    >
                      <span className="truncate font-medium">{hit.label}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {hit.sublabel}
                      </span>
                    </Link>
                  );
                })}
                {group.hasMore && (
                  <p className="px-2 pt-0.5 text-xs text-muted-foreground">e mais…</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
