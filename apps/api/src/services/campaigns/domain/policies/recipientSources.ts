import { normalizePhoneToE164 } from '../../../contacts/domain/phoneNumber';
import { parseCsv } from '../../../contacts/domain/csvParsing';
import { mapImportRows, InvalidImportRow } from '../../../contacts/domain/contactImport';

/**
 * Leitura pura de "fontes de destinatário" de uma campanha — Reorganização
 * Contatos/Campanhas (2026-08-17). Reaproveita `parseCsv`/`mapImportRows`
 * (`services/contacts/domain`, Bloco L1b) SEM DUPLICAR a lógica de
 * cabeçalho/normalização/dedup: ambas são funções puras, sem infraestrutura,
 * então importá-las aqui não cria acoplamento de infra entre bounded
 * contexts (diferente de um repositório/serviço, que exigiria uma porta).
 *
 * Uma campanha nunca FORÇA a criação de um `WhatsAppContact` — este módulo só
 * produz `{ rawPhone, name? }`; é `CampaignService.createCampaign` quem
 * decide, telefone a telefone, se ele já corresponde a um Contato existente
 * (via `ContactLookup`) ou vira um destinatário "solto".
 */

export interface RawPhoneRecipient {
  rawPhone: string;
  name?: string;
  /** Fase de Prospecção IA (2026-08-29) — ver `CampaignRecipient.personalizedMessage`. */
  personalizedMessage?: string;
}

export interface ParseRecipientsCsvResult {
  totalRows: number;
  recipients: RawPhoneRecipient[];
  invalid: InvalidImportRow[];
}

/** Mesma regra de `mapImportRows`: cabeçalho na primeira linha, coluna de telefone obrigatória (por nome), nome opcional. */
export function parseRecipientsCsv(csvText: string): ParseRecipientsCsvResult {
  const rows = parseCsv(csvText);
  const totalRows = Math.max(rows.length - 1, 0); // primeira linha é cabeçalho
  const { valid, invalid } = mapImportRows(rows);
  return {
    totalRows,
    recipients: valid.map((row) => ({ rawPhone: row.phoneE164, name: row.name })),
    invalid,
  };
}

export interface ParseManualPhoneListResult {
  recipients: RawPhoneRecipient[];
  invalidLines: string[];
}

/**
 * "Colar números" — um por linha, telefone opcional seguido de nome
 * separado por vírgula ou ponto-e-vírgula (`"11988887777, Maria"`), ou só o
 * telefone. Linhas em branco são ignoradas; linhas cujo telefone não
 * normaliza vão para `invalidLines` (texto original, para o operador
 * corrigir). Duplicatas dentro da própria lista são resolvidas mantendo a
 * PRIMEIRA ocorrência — mesma regra de `mapImportRows`.
 */
export function parseManualPhoneList(text: string): ParseManualPhoneListResult {
  const recipients: RawPhoneRecipient[] = [];
  const invalidLines: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const [phonePart, ...nameParts] = line.split(/[,;]/);
    const phoneE164 = normalizePhoneToE164(phonePart.trim());
    if (!phoneE164) {
      invalidLines.push(line);
      continue;
    }
    if (seen.has(phoneE164)) continue;
    seen.add(phoneE164);

    const name = nameParts.join(',').trim();
    recipients.push({ rawPhone: phoneE164, name: name.length > 0 ? name : undefined });
  }

  return { recipients, invalidLines };
}
