module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  // `eslint.config.js` (raiz): stub legado do scaffold inicial (Milestone 0)
  // que reexporta este mesmo arquivo em formato "flat config" inválido —
  // sua mera presença faz o ESLint 8.57+ auto-detectar e preferir flat
  // config, ignorando `.eslintrc.js` e quebrando `eslint . --ext ...`
  // (ver `npm run lint`, forçado de volta ao modo legado via
  // `ESLINT_USE_FLAT_CONFIG=false` nos scripts `lint`). Ignorado aqui
  // também para não se autoerrar (`@typescript-eslint/no-var-requires`)
  // quando `.eslintrc.js` processa a árvore inteira a partir da raiz.
  ignorePatterns: [
    'dist/',
    '.next/',
    'coverage/',
    'node_modules/',
    'eslint.config.js',
    // Ferramenta de design — ver .gitignore para o racional completo. Sem
    // node_modules próprio, `design/uploads/` quebra `eslint .` ao referenciar
    // plugins que não consegue resolver; `support.js` é runtime GERADO.
    'design/uploads/',
    'design/support.js',
  ],
  rules: {
    // Add project‑specific rule overrides here
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
    // Convenção já usada no código (ex.: middlewares de erro do Express,
    // que exigem 4 parâmetros por assinatura/aridade mesmo quando alguns
    // não são lidos no corpo — Express distingue error handlers de
    // middlewares normais pelo `fn.length === 4`): prefixo `_` sinaliza
    // "intencionalmente não usado" em vez de ser tratado como erro.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  // Achado na validação real do Bloco M6A-6 (2026-07-23): `next.config.js`
  // (Milestone 5, `require('dotenv')`) e `tailwind.config.js` (Milestone 6,
  // `require('tailwindcss/defaultTheme')`) são CommonJS por convenção do
  // próprio Next.js/Tailwind (carregados via `require()` do Node antes de
  // qualquer bundler existir) — não é código de aplicação, então
  // `@typescript-eslint/no-var-requires` não se aplica. Rodavam sem erro
  // antes por não estarem cobertos por um `npm install`/lockfile que
  // resolvesse a árvore completa de `@typescript-eslint`; a reinstalação
  // deste bloco expôs a regra. Override restrito a arquivos de config na
  // raiz de cada workspace — nenhuma outra regra é afetada, código de
  // aplicação (`.ts`/`.tsx`) continua proibido de usar `require()`.
  overrides: [
    {
      files: ['**/next.config.js', '**/tailwind.config.js', '**/postcss.config.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};
