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
  reason: 'colunas_insuficientes' | 'site_status_invalido' | 'nome_vazio' | 'telefone_vazio';
}

export interface ParseEnrichedLeadsCsvResult {
  totalRows: number;
  leads: EnrichedLead[];
  invalid: InvalidEnrichedLeadRow[];
}

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

    const reviewCount = Number.parseInt(reviewCountRaw.trim(), 10) || 0;
    const googleRatingTrimmed = googleRatingRaw.trim();
    const googleRating =
      googleRatingTrimmed.length > 0 ? Number.parseFloat(googleRatingTrimmed) : undefined;

    leads.push({
      companyName: companyName.trim(),
      category: category.trim(),
      neighborhood: neighborhood.trim(),
      siteStatus: siteStatusRaw.trim() as LeadSiteStatus,
      googleRating: Number.isFinite(googleRating) ? googleRating : undefined,
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
