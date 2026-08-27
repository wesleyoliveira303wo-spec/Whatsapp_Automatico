/**
 * Bloco de contexto anexado ao prompt quando a conversa nasceu de uma
 * campanha — Fase L, Bloco L6 (`FASE_L_MOTOR_DE_LEADS.md` §9.6). Corrige a
 * premissa do `v2` (conversa sempre iniciada pelo cliente) sem reescrever
 * nenhum prompt existente — mesmo padrão de `businessContext`/
 * `offHoursContext`: um bloco anexo, opcional, que só existe quando aplicável.
 *
 * Texto quase idêntico ao sugerido na análise aprovada — orienta a IA a
 * reconhecer que foi ELA (a empresa) quem procurou o lead, nunca o
 * contrário, evitando perguntas como "em que posso ajudar?" para alguém que
 * não pediu nada.
 */
export function buildCampaignContext(messageSent: string): string {
  return (
    `# Origem desta conversa\n` +
    `Esta conversa começou com uma mensagem que NÓS enviamos: "${messageSent}". ` +
    `A pessoa não procurou a empresa — nós a procuramos. Não pergunte por que ela está entrando ` +
    `em contato. Reconheça o contato inicial, apresente-se com clareza, confirme se o assunto faz ` +
    `sentido para ela e, se ela não tiver interesse, encerre com cordialidade e sem insistir.\n` +
    // CORREÇÃO 2026-08-25 (achado real, medido numa conversa de campanha):
    // a versão anterior deste texto mandava "diga em uma frase curta o que a
    // empresa faz e POR QUE FAZ SENTIDO PARA O NEGÓCIO DELA" já na primeira
    // resposta — isso é exatamente o que produziu o pitch agressivo
    // observado (nome + o que a empresa faz + benefício + pergunta comercial,
    // tudo de uma vez). O ritmo certo (mínimo na primeira resposta, nunca se
    // reapresentar depois) já vive no `systemPrompt` (CASO 2, condicionado ao
    // `stage` — mesmo sinal que já governa o FORMATO) — este bloco só precisa
    // confirmar o FATO de que fomos nós que procuramos, sem ditar o CONTEÚDO
    // do pitch, para não duplicar/contradizer aquela regra.
    `Como esta é uma abordagem nossa, siga a regra do CASO 2 do seu prompt de sistema — o quanto você já se ` +
    `apresentou depende do estágio desta conversa (ainda NEW = primeira resposta, mínima; já ` +
    `CONTACTED/NEGOTIATING = você já se apresentou, nunca repita). Continua valendo a regra de um tópico por ` +
    `mensagem: nunca despeje serviço, preço e prazo de uma vez só, e nunca repita o mesmo argumento em ` +
    `mensagens seguidas.`
  );
}
