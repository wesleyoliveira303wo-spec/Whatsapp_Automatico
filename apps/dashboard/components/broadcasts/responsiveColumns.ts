/**
 * Visibilidade de colunas das tabelas de listagem por tamanho de tela
 * (2026-09-17, varredura de dimensões pedida pelo fundador: "nunca barra de
 * rolagem horizontal, só vertical").
 *
 * As tabelas de Disparos tinham 7–8 colunas sempre visíveis. Num celular
 * (375px, menos o rail de 56px) sobram ~270px, e a tabela estourava a tela.
 * A regra: nome, status e ações ficam SEMPRE; o resto aparece conforme a tela
 * cresce. Nenhum dado some do produto — tudo continua na tela de detalhe.
 *
 * Compartilhado de propósito (regra 6 de `.claude/rules/ui-telas-de-listagem.md`):
 * as duas abas de Disparos precisam esconder colunas no MESMO ponto de corte,
 * senão divergem sozinhas de novo.
 */
export const COLUMN_FROM_SM = 'hidden sm:table-cell';
export const COLUMN_FROM_MD = 'hidden md:table-cell';
export const COLUMN_FROM_LG = 'hidden lg:table-cell';
