/**
 * Os 7 "esqueletos" estruturais usados manualmente na primeira rodada de
 * prospecção (ver `leads-prospeccao-google-maps/rascunhos_mensagens_msg1.csv`,
 * gerado antes deste serviço existir) — cada um descreve uma ORDEM DE
 * IDEIAS e um TIPO DE FECHAMENTO diferente, nunca só um sinônimo do
 * anterior. `buildLeadMessagePrompt` (próxima peça do pipeline) traduz
 * cada valor numa instrução concreta para a IA.
 */
export const MESSAGE_SKELETONS = [
  'elogio_pergunta_curta',
  'observacao_reticencias',
  'pergunta_gancho_pergunta',
  'observacao_call_leve',
  'gancho_curto_pergunta_aberta',
  'dado_numerico_observacao_pergunta',
  'pergunta_leve_exploratoria',
] as const;

export type MessageSkeleton = (typeof MESSAGE_SKELETONS)[number];

export interface MessageVariation {
  skeleton: MessageSkeleton;
  hookIndex: number;
}

/**
 * Escolhe DETERMINISTICAMENTE (sem IA, sem aleatoriedade) o esqueleto e o
 * índice de gancho de abertura para o lead na posição `index` de um lote —
 * Seção 2 do playbook ("regra de ouro: variação estrutural, não só
 * lexical"). Determinístico de propósito: depender de um modelo de IA
 * "lembrar" de variar entre chamadas independentes (sem memória entre
 * elas) é frágil; a rotação em código GARANTE que o esqueleto nunca se
 * repete entre dois leads consecutivos do mesmo lote (`MESSAGE_SKELETONS.length`
 * é 7, sempre > 1).
 *
 * `hooksCount` é a quantidade de `Ganchos de Abertura` daquele lead
 * específico (`EnrichedLead.openingHooks.length`) — cicla dentro dela, não
 * dentro de um valor fixo, porque cada lead pode ter uma quantidade
 * diferente de ganchos na planilha. `0` (planilha sem ganchos para aquele
 * lead) devolve sempre `hookIndex: 0`, sem lançar — quem monta o prompt
 * decide o que fazer com uma lista de ganchos vazia (ver
 * `buildLeadMessagePrompt`).
 */
export function pickMessageVariation(index: number, hooksCount: number): MessageVariation {
  const skeleton = MESSAGE_SKELETONS[index % MESSAGE_SKELETONS.length];
  const hookIndex = hooksCount > 0 ? index % hooksCount : 0;
  return { skeleton, hookIndex };
}
