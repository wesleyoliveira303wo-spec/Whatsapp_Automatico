/**
 * Milestone 6, Bloco M6B-1 — fonte única da identidade de marca (v1).
 *
 * TODA string de marca do produto vive aqui: nenhum componente, página ou
 * documento deve conter o nome, a tagline ou a descrição hardcoded (decisão
 * do usuário no início do M6B). Quando a marca evoluir para v2 (marca ≠
 * Design System, ADR #63), muda-se só este arquivo — a UI inteira acompanha.
 *
 * `name` é a marca do produto/empresa; `assistantName` é o nome do atendente
 * de IA que o cliente final vê nas conversas ("respondido pelo Francis").
 * Hoje são iguais, mas ficam separados de propósito: se um dia o produto e o
 * personagem tiverem nomes distintos, o resto do código não precisa mudar.
 */
export const BRAND = {
  /** Nome do produto/marca. */
  name: 'Francis',
  /** Tagline oficial (v1). */
  tagline: 'Seu melhor atendente, no automático',
  /** Nome do atendente de IA exibido ao cliente final. */
  assistantName: 'Francis',
  /** Descrição curta, usada em meta tags e telas de marca. */
  description:
    'Atendimento no WhatsApp com IA — atende, responde e chama um humano quando precisa.',
} as const;

/** Separador padrão entre o título da página e o nome da marca. */
const TITLE_SEPARATOR = ' · ';

/**
 * Monta o título de uma aba do navegador no padrão "Página · Francis".
 * Sem argumento (ou vazio), devolve só o nome da marca — usado como título
 * padrão do app. Centralizado aqui para que o padrão de título seja único.
 */
export function pageTitle(page?: string): string {
  const trimmed = page?.trim();
  return trimmed ? `${trimmed}${TITLE_SEPARATOR}${BRAND.name}` : BRAND.name;
}
