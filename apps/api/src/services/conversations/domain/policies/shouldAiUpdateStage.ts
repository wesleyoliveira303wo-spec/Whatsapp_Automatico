import { Conversation } from '../entities/Conversation';

/**
 * Ordem do funil de vendas, do começo ao fim — fonte única da noção de
 * "avançar" vs. "regredir" no Domain (o board Kanban tem a sua própria
 * constante de ORDEM DE EXIBIÇÃO em `formatters.ts`, no frontend; esta aqui
 * é a regra de negócio, não a de layout).
 *
 * `closed_won` e `closed_lost` compartilham o MESMO índice final: são dois
 * desfechos alternativos do mesmo ponto do funil, não um "depois" do outro.
 * Isso significa que a IA pode corrigir um desfecho para o outro (de
 * "Perdido" para "Fechado", por exemplo, se o cliente voltar atrás e
 * confirmar a compra) sem que isso conte como regressão.
 */
const STAGE_ORDER: Record<Conversation['stage'], number> = {
  new: 0,
  contacted: 1,
  negotiating: 2,
  closed_won: 3,
  closed_lost: 3,
};

/**
 * Decide se a IA pode gravar o `stage` que sugeriu para esta conversa
 * (pipeline de CRM, Milestone 6, Bloco M6H-5).
 *
 * Extraída como função pura de Domain, mesmo padrão de `shouldAutoRespond`
 * (não um método na entidade `Conversation`, que permanece uma interface de
 * dados simples).
 *
 * REGRA ATUAL (2026-07-31, ADR #89 — decisão do fundador): a IA reclassifica
 * SEMPRE, a cada resposta, inclusive em conversas que um humano já corrigiu
 * manualmente — desde que o estágio sugerido NÃO seja uma regressão no
 * funil. Ou seja: pode avançar (ou manter), nunca voltar atrás.
 *
 * POR QUE MUDOU: a regra anterior era "humano corrige, IA nunca mais
 * sobrescreve aquela conversa" (`stageSetBy === 'ai'`). Na prática, um único
 * arrastar-e-soltar — inclusive um teste — congelava o card para sempre,
 * mesmo com o lead continuando a evoluir; o próprio fundador foi pego por
 * isso ao validar a feature (ver ADR #88). A trava protegia a correção
 * humana, mas ao custo de o Pipeline parar de refletir a realidade da
 * conversa, que é a razão de ele existir.
 *
 * POR QUE "SÓ PARA FRENTE" (e não reclassificação totalmente livre): sem
 * essa restrição, a IA desfaria correções humanas legítimas baseadas em
 * informação que ela não tem — o caso clássico é o operador marcar "Fechado"
 * porque fechou o negócio por telefone, e a IA devolver o card para
 * "Negociando" na próxima mensagem do cliente. Restringir a direção preserva
 * o julgamento humano sobre PROGRESSO sem congelar o card: a IA continua
 * livre para avançar conforme o lead evolui.
 *
 * `stageSetBy` continua sendo gravado (quem classificou por último), mas
 * deixou de BLOQUEAR — agora é só informação exibida no card.
 */
export function shouldAiUpdateStage(
  conversation: Conversation,
  suggestedStage: Conversation['stage'],
): boolean {
  return STAGE_ORDER[suggestedStage] >= STAGE_ORDER[conversation.stage];
}
