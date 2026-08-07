import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import FrancisLogo from './FrancisLogo';

/**
 * Milestone 6, Bloco M6B-1 — logo horizontal (símbolo + nome). É a marca
 * "completa" usada em cabeçalhos (Sidebar, tela de login). O nome vem SEMPRE
 * de `BRAND.name` — nunca hardcoded — para que a fonte única de marca
 * (`lib/brand.ts`) governe tudo.
 *
 * `size` controla o símbolo (px, default 32); o nome escala junto de forma
 * proporcional. `showTagline` (default false) mostra a tagline abaixo do
 * nome — útil na tela de login, dispensável na Sidebar.
 */
export interface FrancisWordmarkProps {
  size?: number;
  showTagline?: boolean;
  className?: string;
}

export default function FrancisWordmark({
  size = 32,
  showTagline = false,
  className,
}: FrancisWordmarkProps): JSX.Element {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <FrancisLogo size={size} />
      <div className="flex flex-col leading-tight">
        <span
          className="font-medium tracking-tight text-foreground"
          style={{ fontSize: size * 0.6 }}
        >
          {BRAND.name}
        </span>
        {showTagline && <span className="text-xs text-muted-foreground">{BRAND.tagline}</span>}
      </div>
    </div>
  );
}
