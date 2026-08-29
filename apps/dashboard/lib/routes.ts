/**
 * Landing page (2026-08-29) — a rota `/` passou a ser a landing page pública
 * (marketing/conversão). O Workspace, que antes vivia em `/`, mudou para
 * `/app`. Toda referência a "casa do app logado" usa esta constante para o
 * dia em que a rota mudar de novo ser um lugar só.
 *
 * NÃO confundir com destinos de auth: `/login` e `/register` continuam
 * hardcoded onde aparecem (são endpoints de fluxo, não "a casa do app").
 */
export const APP_HOME = '/app';
