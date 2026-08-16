/**
 * Parser de CSV puro — Fase L, Bloco L1b (importação de leads).
 *
 * Deliberadamente SEM biblioteca nova: mesma disciplina já usada neste
 * projeto quando um formato simples não justifica uma dependência
 * (`GeminiAiProvider` usa `fetch` cru em vez do SDK da Google). O formato de
 * entrada é uma planilha exportada do Excel/Google Sheets — texto,
 * delimitado por vírgula ou ponto e vírgula, com aspas opcionais — e cobrir
 * isso corretamente não exige um parser RFC 4180 completo.
 *
 * Cobre o que uma planilha real do Excel brasileiro produz:
 * - delimitador vírgula OU ponto e vírgula, detectado automaticamente (o
 *   Excel em `pt-BR` exporta CSV com `;`, porque `,` já é o separador
 *   decimal daquele locale — ignorar isso faria toda linha virar 1 coluna só);
 * - campos entre aspas, inclusive com vírgula/ponto-e-vírgula ou quebra de
 *   linha DENTRO do campo (comum em nomes com sobrenome composto ou endereço);
 * - aspas escapadas por duplicação (`""`), padrão universal de CSV;
 * - `\r\n` e `\n` como quebra de linha, sem exigir uma ou outra.
 */

/** Linhas já quebradas em campos — a primeira é o cabeçalho, por convenção de quem chama. */
export type CsvRows = string[][];

/**
 * Detecta o delimitador olhando a PRIMEIRA linha: quem tiver mais ocorrências
 * fora de aspas vence. Empate (ex.: nenhum dos dois aparece, planilha de uma
 * coluna só) resolve para vírgula, o padrão internacional.
 */
function detectDelimiter(firstLine: string): ',' | ';' {
  let commaCount = 0;
  let semicolonCount = 0;
  let insideQuotes = false;

  for (const char of firstLine) {
    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }
    if (insideQuotes) continue;
    if (char === ',') commaCount += 1;
    if (char === ';') semicolonCount += 1;
  }

  return semicolonCount > commaCount ? ';' : ',';
}

/**
 * Converte o texto bruto de um arquivo `.csv` em linhas de campos.
 *
 * Devolve array vazio para entrada vazia/só espaços — nunca lança por si só;
 * quem chama decide o que fazer com "nenhuma linha" (ver `ContactImportService`).
 */
export function parseCsv(text: string): CsvRows {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalized.trim().length === 0) {
    return [];
  }

  const firstLineEnd = normalized.indexOf('\n');
  const firstLine = firstLineEnd === -1 ? normalized : normalized.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;

  while (i < normalized.length) {
    const char = normalized[i];

    if (insideQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        insideQuotes = false;
        i += 1;
        continue;
      }
      currentField += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
      i += 1;
      continue;
    }
    if (char === delimiter) {
      currentRow.push(currentField);
      currentField = '';
      i += 1;
      continue;
    }
    if (char === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      i += 1;
      continue;
    }
    currentField += char;
    i += 1;
  }

  // Última linha sem quebra final — comum quando o arquivo não termina em \n.
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Linhas 100% vazias (planilha com linha em branco no fim) não viram registro.
  return rows.filter((row) => row.some((field) => field.trim().length > 0));
}
