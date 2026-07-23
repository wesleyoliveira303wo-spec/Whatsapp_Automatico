module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  // `eslint.config.js` (raiz): stub legado do scaffold inicial (Milestone 0)
  // que reexporta este mesmo arquivo em formato "flat config" inválido —
  // sua mera presença faz o ESLint 8.57+ auto-detectar e preferir flat
  // config, ignorando `.eslintrc.js` e quebrando `eslint . --ext ...`
  // (ver `npm run lint`, forçado de volta ao modo legado via
  // `ESLINT_USE_FLAT_CONFIG=false` nos scripts `lint`). Ignorado aqui
  // também para não se autoerrar (`@typescript-eslint/no-var-requires`)
  // quando `.eslintrc.js` processa a árvore inteira a partir da raiz.
  ignorePatterns: ['dist/', '.next/', 'coverage/', 'node_modules/', 'eslint.config.js'],
  rules: {
    // Add project‑specific rule overrides here
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
    // Convenção já usada no código (ex.: middlewares de erro do Express,
    // que exigem 4 parâmetros por assinatura/aridade mesmo quando alguns
    // não são lidos no corpo — Express distingue error handlers de
    // middlewares normais pelo `fn.length === 4`): prefixo `_` sinaliza
    // "intencionalmente não usado" em vez de ser tratado como erro.
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
};
