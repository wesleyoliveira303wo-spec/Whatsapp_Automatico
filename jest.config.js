/**
 * Config multi-projeto (M2, Fase 3) — antes, um único config global
 * (`testMatch: ['**\/tests/**\/*.test.ts']`, transform fixo em
 * `apps/api/tsconfig.json`) bastava porque só `apps/api` tinha testes.
 * `apps/dashboard` (Next.js) precisa do PRÓPRIO `tsconfig.json` no
 * transform do `ts-jest` — tem `paths` (`@/*`, `@components/*`) e `lib`
 * (`dom`) diferentes de `apps/api` — então um único transform fixo não
 * serve mais aos dois pacotes ao mesmo tempo.
 *
 * O projeto "api" abaixo reproduz EXATAMENTE o comportamento do config
 * antigo (mesmo testMatch, mesmo tsconfig, mesmo transform) — zero
 * regressão para as suítes já existentes. O projeto "dashboard" é
 * inteiramente novo, isolado em `apps/dashboard/tests/`.
 *
 * Estabilização (M2 pós-Fase 4): removida a opção `isolatedModules: true`
 * do NÍVEL do `ts-jest` (que emitia `ts-jest[config] (WARN) ... deprecated`
 * em toda execução — visível no terminal do usuário após cada `npm test`).
 * `isolatedModules: true` já existe como `compilerOptions` em
 * `tsconfig.base.json`, herdado por `apps/api/tsconfig.json` e
 * `apps/dashboard/tsconfig.json` (nenhum dos dois sobrescreve essa chave) —
 * ou seja, o valor efetivo NUNCA mudou; só a duplicação (mesma flag
 * declarada em dois lugares, um deles na sintaxe legada que o próprio
 * ts-jest pede para não usar mais) foi removida. Zero mudança de
 * comportamento de teste; ver DECISIONS.md.
 */
module.exports = {
  projects: [
    {
      displayName: 'api',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/apps/api/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/apps/api/tsconfig.json' }],
      },
      moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    },
    {
      displayName: 'dashboard',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/apps/dashboard/tests/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/apps/dashboard/tsconfig.json' }],
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
    },
    /**
     * TERCEIRO projeto (Milestone 4, Bloco M4E — D49/ADR #59): primeira
     * infraestrutura de teste de COMPONENTE do projeto (jsdom + Testing
     * Library), deliberadamente ISOLADA num diretório próprio
     * (`tests-jsdom/`, só `.test.tsx`) para não alterar nada dos dois
     * projetos `node` acima — as suítes existentes continuam rodando
     * exatamente como antes (mesma decisão de isolamento registrada no
     * levantamento da M4: nunca trocar o `testEnvironment` global).
     *
     * `testEnvironment` resolvido por caminho a partir de `apps/dashboard`
     * (as dependências de teste vivem em `apps/dashboard/node_modules`) —
     * ver package.json do dashboard (devDependencies).
     */
    {
      displayName: 'dashboard-jsdom',
      testEnvironment: require.resolve('jest-environment-jsdom', {
        paths: [`${__dirname}/apps/dashboard`],
      }),
      testMatch: ['<rootDir>/apps/dashboard/tests-jsdom/**/*.test.tsx'],
      // Stub de `ResizeObserver` (exigido pelo ResponsiveContainer do
      // recharts, ausente no jsdom) — ver docstring de tests-jsdom/setup.ts.
      setupFiles: ['<rootDir>/apps/dashboard/tests-jsdom/setup.ts'],
      transform: {
        // `tsconfig.jest.json` estende o tsconfig do dashboard trocando SÓ
        // `jsx: 'preserve'` (padrão Next — quem transforma JSX em produção é
        // o SWC do Next) por `jsx: 'react-jsx'` (necessário para o ts-jest
        // não emitir JSX cru — "Unexpected token '<'", regressão real da
        // primeira execução na máquina do usuário, 2026-07-18). Um arquivo
        // que estende (não um objeto inline) preserva os `paths` (`@/*`) do
        // tsconfig base — a forma de objeto os descartava (segunda regressão
        // real, mesma rodada de validação).
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/apps/dashboard/tsconfig.jest.json' }],
      },
      // `paths` do tsconfig resolve só o TYPE-CHECK; o RUNTIME do Jest
      // precisa do mapper equivalente para os imports `@/...` dos
      // componentes (os projetos `node` nunca precisaram porque seus testes
      // só usam imports relativos e não carregam componentes).
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/apps/dashboard/$1',
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
    },
  ],
};
