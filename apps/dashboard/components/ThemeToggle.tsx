import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ThemeToggleProps {
  /** Override de tamanho/raio — usado pelo `SessionRail` (38px/11px, Design System §5); sem isso, mantém o tamanho `icon` padrão do `Button` (usado por `Header.tsx`). */
  className?: string;
}

const STORAGE_KEY = 'francis-theme';

/**
 * Redesign 2026-08-05 (R1 — dark mode). Sem `next-themes`: ~30 linhas
 * resolvem o problema inteiro (mesmo racional de preferir solução nativa já
 * usado no projeto). O estado "de verdade" é a classe `.dark` em
 * `<html>` (aplicada de antemão pelo script síncrono em `_document.tsx`,
 * para nunca "piscar" claro) — este componente só LÊ essa classe no mount
 * (evita divergência entre o que o script escolheu e o que o React acha que
 * escolheu) e a alterna no clique, persistindo a escolha explícita em
 * `localStorage` (chave compartilhada com o script).
 *
 * `mounted` evita mismatch de hidratação: no servidor não há `document`,
 * então o ícone renderiza só depois do 1º efeito no cliente — o botão fica
 * oculto por 1 tick, imperceptível.
 */
export default function ThemeToggle({ className }: ThemeToggleProps = {}): JSX.Element | null {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    setMounted(true);
  }, []);

  function toggle(): void {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      // Armazenamento bloqueado (modo privado restrito etc.) — a escolha só
      // não sobrevive a um reload; não impede o toggle de funcionar agora.
    }
  }

  if (!mounted) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggle}
      aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
    >
      {isDark ? (
        <Sun className="h-[18px] w-[18px]" aria-hidden="true" />
      ) : (
        <Moon className="h-[18px] w-[18px]" aria-hidden="true" />
      )}
    </Button>
  );
}
