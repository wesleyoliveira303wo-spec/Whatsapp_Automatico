/**
 * Erro de Domain para quando um CSV de importação de leads traz mais linhas
 * de dado do que o teto suportado — Fase L, Bloco L1b. Mapeado para `413` na
 * Presentation (mesmo código HTTP já usado para upload de mídia grande
 * demais, `AgentMediaTooLargeError`).
 */
export class TooManyImportRowsError extends Error {
  constructor(
    public readonly rowCount: number,
    public readonly maxRows: number,
  ) {
    super(`Import has ${rowCount} rows, exceeding the limit of ${maxRows}`);
    this.name = 'TooManyImportRowsError';
  }
}
