import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

/**
 * Marca v2 (2026-08-07, pedido do fundador — substitui o balão+check v1 do
 * Bloco M6B-1): ícone raster fornecido pelo fundador, recortado e com fundo
 * removido em `public/logo-francis-icon-{light,dark}.png`. Duas variantes
 * (não uma só com `currentColor`) porque o brilho do ícone foi renderizado
 * pensando num fundo específico por tema — a variante "light" fica sólida
 * sobre o fundo claro do app, a "dark" preserva o brilho sobre fundo escuro;
 * usar uma só nos dois temas faz o anel do ícone desaparecer de um lado.
 *
 * Troca 100% via CSS (`dark:` do Tailwind, já pilotado pela classe `.dark` em
 * `<html>` aplicada sincronamente por `_document.tsx`) — nunca via JS/estado,
 * então não há risco de flash ou mismatch de hidratação (mesmo problema que
 * `ThemeToggle` resolve com um gate de `mounted`, evitado aqui de propósito).
 *
 * `size` controla largura/altura em px (default 32, mantém a assinatura
 * antiga — todo call-site continua funcionando sem mudança). `title` vira o
 * rótulo acessível (default: nome da marca) do `<span role="img">` que
 * envolve as duas imagens — as duas `<img>` em si são `aria-hidden`/`alt=""`
 * (decorativas), senão a árvore de acessibilidade exporia DOIS elementos
 * `role="img"` com o mesmo nome (ambíguo para `getByRole`/leitor de tela);
 * só a variante visível pelo tema deveria "existir" para quem usa, e a troca
 * é só visual (CSS), então o rótulo único no wrapper é o correto.
 */
export interface FrancisLogoProps {
  size?: number;
  className?: string;
  title?: string;
}

export default function FrancisLogo({
  size = 32,
  className,
  title,
}: FrancisLogoProps): JSX.Element {
  const alt = title ?? BRAND.name;
  return (
    <span
      role="img"
      aria-label={alt}
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ícone fixo de `public/`, trocado por classe `dark:`, não por conteúdo dinâmico do next/image */}
      <img
        src="/logo-francis-icon-light.png"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className="block h-full w-full dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- ver comentário acima */}
      <img
        src="/logo-francis-icon-dark.png"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className="hidden h-full w-full dark:block"
      />
    </span>
  );
}
