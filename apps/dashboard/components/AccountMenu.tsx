import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { logout } from '@/lib/clientApi';
import { useMe } from '@/hooks/useMe';
import { cn } from '@/lib/utils';

interface AccountMenuProps {
  sessionName: string;
}

/** Rótulos amigáveis dos cargos — mesmo mapa de `Header.tsx` (M5G). */
const ROLE_LABELS: Record<string, string> = {
  owner: 'Dono',
  administrator: 'Administrador',
  manager: 'Gerente',
  operator: 'Operador',
  read_only: 'Somente leitura',
};

/**
 * Reskin 2026-08-06 — Design System §5/§7: "e-mail/cargo/trocar senha/sair
 * migraram para o menu de conta no rail". Antes vivia como texto+botões
 * soltos em `Header.tsx`; agora é um popover no ícone de engrenagem no
 * rodapé de `SessionRail`. Reaproveita `useMe`/`logout` — a MESMA lógica de
 * identidade que `Header.tsx` já usa (nenhum contrato de sessão muda,
 * `Header.tsx` continua intocado para Workspace/Login).
 *
 * Dropdown local (sem Radix novo) — mesmo padrão já usado no projeto para
 * popovers pequenos (`MessageComposer`, respostas rápidas): ref + listener de
 * `mousedown` fora do menu para fechar.
 */
export default function AccountMenu({ sessionName }: AccountMenuProps): JSX.Element {
  const router = useRouter();
  const { user } = useMe();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleLogout(): Promise<void> {
    await logout();
    await router.push('/login');
  }

  return (
    <div ref={menuRef} className="relative">
      {open && (
        <div className="absolute bottom-0 left-[52px] z-20 w-60 rounded-lg border border-border bg-card p-1.5 shadow-menu">
          {user && (
            <div className="mb-1 border-b border-border/70 px-2.5 py-2">
              <div className="truncate text-xs font-semibold text-foreground">{user.email}</div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                {ROLE_LABELS[user.role] ?? user.role}
              </div>
            </div>
          )}
          <Link
            href={`/sessions/${encodeURIComponent(sessionName)}/settings`}
            onClick={() => setOpen(false)}
            className="block h-[34px] rounded-md px-2.5 text-[12.5px] leading-[34px] text-foreground hover:bg-muted"
          >
            Configurações da sessão
          </Link>
          {user && (
            <Link
              href="/change-password"
              onClick={() => setOpen(false)}
              className="block h-[34px] rounded-md px-2.5 text-[12.5px] leading-[34px] text-foreground hover:bg-muted"
            >
              Trocar senha
            </Link>
          )}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="block h-[34px] w-full rounded-md px-2.5 text-left text-[12.5px] leading-[34px] text-foreground hover:bg-muted"
          >
            Sair
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        title="Configurações e conta"
        aria-label="Configurações e conta"
        className={cn(
          'flex h-[38px] w-[38px] items-center justify-center rounded-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          open && 'bg-muted text-foreground',
        )}
      >
        <Settings className="h-[19px] w-[19px]" aria-hidden="true" />
      </button>
    </div>
  );
}
