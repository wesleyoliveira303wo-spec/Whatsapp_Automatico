/**
 * Um lead de prospecção fria já enriquecido — mesmo formato usado
 * manualmente em `leads-prospeccao-google-maps/leads_prospeccao_whatsapp_ia.json`
 * (ver `PLAYBOOK_IA_WHATSAPP.md` da mesma pasta, Seção 3 — "Estrutura de
 * dados por lead"). Curado por humano/scraper FORA do produto nesta
 * rodada (ver Global Constraints do plano) — este tipo só formaliza o
 * contrato de entrada de `GenerateLeadMessagesService`.
 *
 * Todo campo aqui precisa ter vindo de uma fonte real (planilha) — nenhuma
 * regra deste bounded context pode inventar um valor para um campo
 * ausente (ver `buildLeadMessagePrompt`, que trata `googleRating`/
 * `reviewCount` ausentes como "não citar prova social", nunca como um
 * valor a adivinhar).
 */
export type LeadSiteStatus = 'Sem Site' | 'Apenas Redes Sociais' | 'Com Site';

export interface EnrichedLead {
  companyName: string;
  category: string;
  neighborhood: string;
  siteStatus: LeadSiteStatus;
  /** `undefined` = sem nota ainda (ex.: negócio recém-listado, 0 avaliações) — nunca inventar um número. */
  googleRating?: number;
  reviewCount: number;
  mainPainPoint: string;
  /** `undefined` só é esperado quando `reviewCount === 0` (nada ainda para citar como prova social). */
  socialProofTrigger?: string;
  recommendedTone: string;
  /** 2 ou mais opções — `pickMessageVariation` escolhe UM índice por lead, nunca todas. */
  openingHooks: string[];
  recommendedCta: string;
  /** Telefone bruto, ainda não normalizado (mesmo formato de `RawPhoneRecipient.rawPhone`). */
  rawPhone: string;
}
