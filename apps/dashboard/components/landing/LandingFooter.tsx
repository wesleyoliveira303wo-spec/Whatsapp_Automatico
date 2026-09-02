import Link from 'next/link';
import FrancisLogo from '@/components/brand/FrancisLogo';
import { BRAND } from '@/lib/brand';

/**
 * Landing page (2026-08-29) — rodapé. Só links que existem de verdade:
 * âncoras da própria página, `/login`, `/register` e, desde o T6 do
 * Lançamento suave, `/termos` e `/privacidade`.
 */
const PRODUTO = [
  { href: '#recursos', label: 'Recursos' },
  { href: '#ia', label: 'IA' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#planos', label: 'Planos' },
];

export default function LandingFooter({ year }: { year: number }): JSX.Element {
  return (
    <footer className="border-t border-border bg-card/60">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <FrancisLogo size={24} />
              <span className="text-base font-semibold">{BRAND.name}</span>
            </div>
            <p className="mt-3.5 max-w-xs text-[13px] text-muted-foreground">{BRAND.description}</p>
          </div>

          <nav aria-label="Produto">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Produto</p>
            <ul className="mt-3.5 flex flex-col gap-2.5 text-sm text-muted-foreground">
              {PRODUTO.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="transition-colors hover:text-foreground">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Conta">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Conta</p>
            <ul className="mt-3.5 flex flex-col gap-2.5 text-sm text-muted-foreground">
              <li>
                <Link href="/login" className="transition-colors hover:text-foreground">
                  Entrar
                </Link>
              </li>
              <li>
                <Link href="/register" className="transition-colors hover:text-foreground">
                  Criar conta
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Legal">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Legal</p>
            <ul className="mt-3.5 flex flex-col gap-2.5 text-sm text-muted-foreground">
              <li>
                <Link href="/termos" className="transition-colors hover:text-foreground">
                  Termos de uso
                </Link>
              </li>
              <li>
                <Link href="/privacidade" className="transition-colors hover:text-foreground">
                  Privacidade
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <p className="mt-12 border-t border-border/60 pt-6 text-xs text-muted-foreground/70">
          © {year} {BRAND.name}. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
