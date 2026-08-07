/**
 * Resposta rápida (template) que um atendente humano insere com um clique
 * no `MessageComposer` — Fase 1, Bloco F1.9. POR SESSÃO (mesmo padrão de
 * `AiBusinessProfile`/M6H-3): cada WhatsApp pode ter seu próprio conjunto
 * de frases prontas. Sem categorização/atalho de teclado (YAGNI, conforme
 * `FASE_1_ANALISE_ESTRATEGICA.md` §9, F1.9) — lista simples, ordenada por
 * `createdAt` na leitura.
 */
export interface QuickReply {
  id: string;
  tenantId: string;
  sessionName: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}
