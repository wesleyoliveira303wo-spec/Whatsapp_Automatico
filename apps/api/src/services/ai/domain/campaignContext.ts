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
    `sentido para ela e, se ela não tiver interesse, encerre com cordialidade e sem insistir.`
  );
}
