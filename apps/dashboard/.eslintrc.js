/**
 * Config ESLint do dashboard (housekeeping pós-Milestone 4 — ADR #60).
 *
 * Existe para resolver o aviso do `next build`: "The Next.js plugin was not
 * detected in your ESLint configuration". Estende `next` (a configuração
 * oficial base do Next.js — `eslint-config-next`, versão fixada na MESMA do
 * `next` em package.json), que registra o plugin `@next/next` com as regras
 * recomendadas.
 *
 * NÃO tem `root: true`: o ESLint continua cascateando para o `.eslintrc.js`
 * da raiz do monorepo (que carrega `eslint:recommended` +
 * `@typescript-eslint` + `prettier` e as regras do projeto) — este arquivo
 * só ACRESCENTA a camada do Next por cima, sem alterar nem desabilitar
 * nenhuma regra existente.
 *
 * `settings.next.rootDir`: necessário em monorepo — informa ao plugin onde
 * vive a aplicação Next (sem isso, regras que inspecionam `pages/`
 * procurariam na raiz do repositório).
 */
module.exports = {
  extends: ['next'],
  settings: {
    next: {
      rootDir: __dirname,
    },
  },
};
