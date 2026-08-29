import FrancisLogo from '@/components/brand/FrancisLogo';
import { AUTH_BADGE } from '@/components/brand/AuthMarketingPanel';
import { BRAND } from '@/lib/brand';

/**
 * Rodapé das telas de autenticação (login/registro) — extraído junto com
 * `AuthMarketingPanel` (2026-08-28) pelo mesmo motivo: as duas páginas nunca
 * devem divergir. `currentYear` vem do servidor (`getServerSideProps` de
 * cada página, não `new Date()` aqui) — evita mismatch de hidratação bem no
 * instante da virada do ano.
 */
export default function AuthFooter({ currentYear }: { currentYear: number }): JSX.Element {
  return (
    <footer className="flex flex-col items-center gap-1.5 border-t border-border py-5">
      <div className="flex items-center gap-2">
        <FrancisLogo size={20} />
        <span className="text-[13.5px] font-bold text-foreground">{BRAND.name}</span>
        <span className="text-[13px] text-muted-foreground">&nbsp;•&nbsp;{AUTH_BADGE}</span>
      </div>
      <p className="text-xs text-muted-foreground/80">
        © {currentYear} {BRAND.name}. Todos os direitos reservados.
      </p>
    </footer>
  );
}
