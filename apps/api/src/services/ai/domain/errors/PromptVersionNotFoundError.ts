/**
 * Erro de Domain para quando `getPromptVersion()` recebe um `id` que não
 * existe em `PROMPT_VERSIONS`. Substitui o uso de `Error` genérico (achado F2
 * da auditoria técnica do Bloco 3a) — mesmo motivo de
 * `AiProviderNotSupportedError`: permite mapeamento por `instanceof`, nunca
 * por comparação de string de mensagem.
 *
 * Só pode ocorrer com um `id` vindo de configuração (`AI_PROMPT_VERSION`,
 * resolvida no composition root do Bloco 5) apontando para uma versão que não
 * existe (ou não existe mais) em código — nunca de um caminho normal de
 * execução.
 */
export class PromptVersionNotFoundError extends Error {
  constructor(id: string) {
    super(`Versão de prompt desconhecida: "${id}"`);
    this.name = 'PromptVersionNotFoundError';
  }
}
