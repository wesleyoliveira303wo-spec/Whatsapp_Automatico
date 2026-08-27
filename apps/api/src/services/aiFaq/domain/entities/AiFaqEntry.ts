/**
 * Uma pergunta frequente estruturada do "Cérebro da IA" — Cérebro da IA v3,
 * Fase 2 (2026-08-25). POR SESSÃO (mesmo padrão de `AiBusinessProfile`/
 * `QuickReply`): cada WhatsApp tem seu próprio conjunto de FAQs.
 *
 * Substitui o antigo botão "Cadastrar pergunta não respondida" que só
 * ANEXAVA texto cru ao blob de `AiBusinessProfile.content` — aqui pergunta e
 * resposta são campos de verdade, com categoria (livre, opcional) e um
 * `active` que desativa uma entrada sem apagar (ex.: promoção fora de
 * vigência), sem se misturar ao texto livre de "Conhecimento".
 */
export interface AiFaqEntry {
  id: string;
  tenantId: string;
  sessionName: string;
  question: string;
  answer: string;
  category: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
