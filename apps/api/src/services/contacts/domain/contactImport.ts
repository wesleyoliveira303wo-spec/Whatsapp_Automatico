import { normalizePhoneToE164 } from './phoneNumber';
import { CsvRows } from './csvParsing';

/** Uma linha pronta para virar `WhatsAppContact`. */
export interface ValidImportRow {
  /** Linha original no arquivo (1 = primeira linha de dados, após o cabeçalho) — para o relatório. */
  rowNumber: number;
  phoneE164: string;
  name?: string;
}

/** Motivo pelo qual uma linha foi rejeitada — usado no relatório e, no futuro, em mensagens de erro na UI. */
export type InvalidImportRowReason = 'missing_phone' | 'invalid_phone' | 'duplicate_in_file';

export interface InvalidImportRow {
  rowNumber: number;
  reason: InvalidImportRowReason;
  /** O texto bruto do campo telefone, para o operador entender o que rejeitou (nunca o resto da linha — pode ter dado sensível). */
  rawPhone?: string;
}

export interface MapImportRowsResult {
  valid: ValidImportRow[];
  invalid: InvalidImportRow[];
}

/**
 * Nomes de cabeçalho aceitos para a coluna de telefone, normalizados (minúsculo,
 * sem acento) antes da comparação — cobre as variações mais comuns que uma
 * planilha brasileira de leads usa. Lista fechada e pequena de propósito: um
 * cabeçalho fora daqui é melhor pedir para o operador renomear do que tentar
 * adivinhar (adivinhar errado importa a coluna errada como telefone).
 */
const PHONE_HEADER_ALIASES = ['telefone', 'phone', 'celular', 'whatsapp', 'numero', 'número'];
const NAME_HEADER_ALIASES = ['nome', 'name', 'cliente', 'lead'];

function normalizeHeader(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      // NFD separa cada letra acentuada em (letra base + marca de acento); a
      // faixa Unicode U+0300–U+036F cobre as marcas de acento combinantes, que
      // esta linha descarta — "número" -> "numero", "Não" -> "nao".
      .replace(/[̀-ͯ]/g, '')
  );
}

function findColumnIndex(header: string[], aliases: string[]): number {
  const normalized = header.map(normalizeHeader);
  return normalized.findIndex((column) => aliases.includes(column));
}

/**
 * Transforma linhas de CSV já parseadas (`parseCsv`) em contatos válidos +
 * um relatório de rejeições — Fase L, Bloco L1b.
 *
 * REGRAS, em ordem:
 * 1. A PRIMEIRA linha é sempre cabeçalho (nunca dado) — planilha sem
 *    cabeçalho não é um formato suportado nesta rodada; pedir para o
 *    operador adicionar uma linha de título é mais simples e mais seguro
 *    que adivinhar se a primeira linha é dado ou título.
 * 2. Coluna de telefone é OBRIGATÓRIA (por nome, ver `PHONE_HEADER_ALIASES`).
 *    Sem ela, NENHUMA linha é processada — devolve tudo em `invalid` com
 *    `missing_phone`, porque sem telefone não há identidade nenhuma a criar
 *    (mesmo racional de `phoneFromWhatsAppJid`: preferível não importar a
 *    importar errado).
 * 3. Coluna de nome é OPCIONAL — sem ela, todo contato é criado sem nome
 *    (mesmo estado de hoje, sem regressão).
 * 4. Telefone é normalizado por `normalizePhoneToE164` — a MESMA função que
 *    identifica contatos vindos do WhatsApp, garantindo que uma pessoa
 *    importada hoje seja reconhecida se escrever amanhã (e vice-versa).
 * 5. Duplicata DENTRO do próprio arquivo: a PRIMEIRA ocorrência de um
 *    telefone vale, as seguintes são marcadas `duplicate_in_file` — evita
 *    que uma planilha com a mesma pessoa duas vezes gere um erro de
 *    constraint única no banco no meio da importação.
 */
export function mapImportRows(rows: CsvRows): MapImportRowsResult {
  const valid: ValidImportRow[] = [];
  const invalid: InvalidImportRow[] = [];

  if (rows.length === 0) {
    return { valid, invalid };
  }

  const [header, ...dataRows] = rows;
  const phoneIndex = findColumnIndex(header, PHONE_HEADER_ALIASES);
  const nameIndex = findColumnIndex(header, NAME_HEADER_ALIASES);

  if (phoneIndex === -1) {
    return {
      valid: [],
      invalid: dataRows.map((_row, index) => ({
        rowNumber: index + 1,
        reason: 'missing_phone',
      })),
    };
  }

  const seenPhones = new Set<string>();

  dataRows.forEach((row, index) => {
    const rowNumber = index + 1;
    const rawPhone = row[phoneIndex]?.trim() ?? '';

    if (!rawPhone) {
      invalid.push({ rowNumber, reason: 'missing_phone' });
      return;
    }

    const phoneE164 = normalizePhoneToE164(rawPhone);
    if (!phoneE164) {
      invalid.push({ rowNumber, reason: 'invalid_phone', rawPhone });
      return;
    }

    if (seenPhones.has(phoneE164)) {
      invalid.push({ rowNumber, reason: 'duplicate_in_file', rawPhone });
      return;
    }
    seenPhones.add(phoneE164);

    const rawName = nameIndex >= 0 ? row[nameIndex]?.trim() : undefined;
    valid.push({
      rowNumber,
      phoneE164,
      name: rawName && rawName.length > 0 ? rawName : undefined,
    });
  });

  return { valid, invalid };
}
