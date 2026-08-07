import { Html, Head, Main, NextScript } from 'next/document';

/**
 * Redesign 2026-08-05 (R1 — dark mode): script síncrono, injetado ANTES de
 * `<Main/>`, que aplica a classe `.dark` em `<html>` no MESMO tick do
 * primeiro paint — sem isso, a página sempre renderizaria clara por um
 * instante antes do React hidratar e ler a preferência salva (flash de tema
 * claro, o mesmo problema que `next-themes` resolve; aqui é feito à mão,
 * mesmo racional de preferir solução nativa já usado no projeto —
 * `GeminiAiProvider` sem SDK, drag-and-drop do Pipeline sem lib). Chave de
 * `localStorage` compartilhada com `components/ThemeToggle.tsx`
 * (`francis-theme`). Sem preferência salva, respeita `prefers-color-scheme`
 * do sistema operacional. `try/catch` porque `localStorage` pode lançar em
 * navegadores com armazenamento bloqueado — nesse caso, cai no tema claro
 * (comportamento anterior a este bloco).
 */
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('francis-theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

/**
 * Milestone 6, Bloco M6B-2 — documento HTML base do Next (Pages Router).
 * Criado só para fixar `lang="pt-BR"` (idioma oficial do projeto,
 * `CLAUDE.md`) — acessibilidade e SEO interno. Favicon e demais assets de
 * marca foram DELIBERADAMENTE adiados para um bloco futuro (decisão do
 * usuário: marca v1 iterável, começar só com SVG). Quando os assets
 * existirem, os `<link rel="icon">` entram aqui.
 */
export default function Document(): JSX.Element {
  return (
    <Html lang="pt-BR">
      <Head />
      <body>
        {/* eslint-disable-next-line @next/next/next-script-for-ga -- script inline deliberado (não é analytics), precisa rodar síncrono antes do paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
