import { parseCsv } from '../../../contacts/domain/csvParsing';
import { EnrichedLead, LeadSiteStatus } from '../entities/EnrichedLead';

const VALID_SITE_STATUSES: LeadSiteStatus[] = ['Sem Site', 'Apenas Redes Sociais', 'Com Site'];

const REQUIRED_HEADERS = [
  'Nome da Empresa',
  'Categoria',
  'Bairro',
  'Status do Site',
  'Nota Google',
  'Qtd Avaliações',
  'Dor Principal Identificada',
  'Gatilho de Prova Social',
  'Tom Recomendado',
  'Ganchos de Abertura',
  'CTA Recomendado',
  'Telefone',
] as const;

export interface InvalidEnrichedLeadRow {
  rowNumber: number;
  reason:
    | 'colunas_insuficientes'
    | 'site_status_invalido'
    | 'nome_vazio'
    | 'telefone_vazio'
    | 'qtd_avaliacoes_invalida';
}

export interface ParseEnrichedLeadsCsvResult {
  totalRows: number;
  leads: EnrichedLead[];
  invalid: InvalidEnrichedLeadRow[];
  /**
   * Preenchido quando a linha de cabeçalho (primeira linha do CSV) não bate
   * com `REQUIRED_HEADERS` — nem em quantidade, nem nos nomes exatos, na
   * ordem exata. Diferente de `invalid` (que é por linha de dado), um
   * problema de cabeçalho invalida o arquivo inteiro: quando presente,
   * `leads` e `invalid` vêm vazios — nunca vale a pena tentar adivinhar
   * colunas a partir de um cabeçalho que não é o esperado.
   */
  headerError?: string;
}

/** Compara o cabeçalho lido com `REQUIRED_HEADERS`, célula a célula, na ordem exata. */
function validateHeaderRow(headerRow: string[] | undefined): string | undefined {
  if (!headerRow || headerRow.length === 0) {
    return 'Cabeçalho ausente — o CSV precisa começar com a linha de colunas esperada.';
  }
  if (headerRow.length !== REQUIRED_HEADERS.length) {
    return `Cabeçalho com número de colunas inesperado (esperado ${REQUIRED_HEADERS.length}, recebido ${headerRow.length}).`;
  }
  for (let i = 0; i < REQUIRED_HEADERS.length; i += 1) {
    if (headerRow[i]?.trim() !== REQUIRED_HEADERS[i]) {
      return `Cabeçalho inesperado na coluna ${i + 1}: esperado "${REQUIRED_HEADERS[i]}", recebido "${headerRow[i]?.trim() ?? ''}".`;
    }
  }
  return undefined;
}

/** `4,3` (Excel pt-BR) vira `4.3`; qualquer coisa fora do formato numérico é rejeitada (nunca truncada). */
const NUMERIC_PATTERN = /^\d+([.,]\d+)?$/;

/**
 * Parseia o CSV de leads enriquecidos (Fase de Prospecção IA, 2026-08-29) —
 * mesmo formato de `leads-prospeccao-google-maps/leads_prospeccao_whatsapp_ia.csv`
 * (ver `PLAYBOOK_IA_WHATSAPP.md` da mesma pasta). Reaproveita `parseCsv`
 * (tokenização pura, já usada por `parseRecipientsCsv`) — nenhuma
 * duplicação de lógica de CSV.
 *
 * Cabeçalho é POSICIONAL nesta primeira versão (colunas na ordem exata de
 * `REQUIRED_HEADERS`) — mesma simplificação já aceita em `mapImportRows`
 * para a planilha de contatos genérica; se o formato precisar de colunas
 * fora de ordem no futuro, isso é uma extensão localizada aqui, não uma
 * mudança de contrato para quem chama esta função.
 */
export function parseEnrichedLeadsCsv(csvText: string): ParseEnrichedLeadsCsvResult {
  const rows = parseCsv(csvText);

  const headerError = validateHeaderRow(rows[0]);
  if (headerError) {
    return { totalRows: 0, leads: [], invalid: [], headerError };
  }

  const dataRows = rows.slice(1); // primeira linha é cabeçalho
  const totalRows = dataRows.length;

  const leads: EnrichedLead[] = [];
  const invalid: InvalidEnrichedLeadRow[] = [];

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 (base 1) +1 (cabeçalho já consumido)
    if (row.length < REQUIRED_HEADERS.length) {
      invalid.push({ rowNumber, reason: 'colunas_insuficientes' });
      return;
    }

    const [
      companyName,
      category,
      neighborhood,
      siteStatusRaw,
      googleRatingRaw,
      reviewCountRaw,
      mainPainPoint,
      socialProofTrigger,
      recommendedTone,
      openingHooksRaw,
      recommendedCta,
      rawPhone,
    ] = row;

    if (companyName.trim().length === 0) {
      invalid.push({ rowNumber, reason: 'nome_vazio' });
      return;
    }
    if (rawPhone.trim().length === 0) {
      invalid.push({ rowNumber, reason: 'telefone_vazio' });
      return;
    }
    if (!VALID_SITE_STATUSES.includes(siteStatusRaw.trim() as LeadSiteStatus)) {
      invalid.push({ rowNumber, reason: 'site_status_invalido' });
      return;
    }

    // "" (vazio) significa legitimamente "0 avaliações ainda" — só texto
    // garantidamente NÃO numérico é rejeitado (nunca vira um 0 de confiança).
    const reviewCountTrimmed = reviewCountRaw.trim();
    let reviewCount = 0;
    if (reviewCountTrimmed.length > 0) {
      if (!NUMERIC_PATTERN.test(reviewCountTrimmed)) {
        invalid.push({ rowNumber, reason: 'qtd_avaliacoes_invalida' });
        return;
      }
      reviewCount = Number.parseInt(reviewCountTrimmed.replace(',', '.'), 10);
    }

    // Excel pt-BR exporta decimais com vírgula ("4,3") — normaliza antes de
    // parsear, mas só aceita o valor se o texto bruto bater 100% com o
    // formato numérico esperado; caso contrário descarta para `undefined`
    // em vez de inventar um número truncado (ex.: parseFloat('4,3') === 4).
    const googleRatingTrimmed = googleRatingRaw.trim();
    let googleRating: number | undefined;
    if (googleRatingTrimmed.length > 0 && NUMERIC_PATTERN.test(googleRatingTrimmed)) {
      const normalized = googleRatingTrimmed.replace(',', '.');
      const parsed = Number.parseFloat(normalized);
      googleRating = Number.isFinite(parsed) ? parsed : undefined;
    }

    leads.push({
      companyName: companyName.trim(),
      category: category.trim(),
      neighborhood: neighborhood.trim(),
      siteStatus: siteStatusRaw.trim() as LeadSiteStatus,
      googleRating,
      reviewCount,
      mainPainPoint: mainPainPoint.trim(),
      socialProofTrigger: socialProofTrigger.trim().length > 0 ? socialProofTrigger.trim() : undefined,
      recommendedTone: recommendedTone.trim(),
      openingHooks: openingHooksRaw
        .split('|')
        .map((hook) => hook.trim())
        .filter((hook) => hook.length > 0),
      recommendedCta: recommendedCta.trim(),
      rawPhone: rawPhone.trim(),
    });
  });

  return { totalRows, leads, invalid };
}
