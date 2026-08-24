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
    // Reforço explícito (2026-08-24, junto com o prompt `v7`): este é o CASO 2
    // descrito no prompt de sistema — a postura de descoberta ("qual é o seu
    // nome? com o que você trabalha?"), que é o PADRÃO correto quando o
    // cliente procura a empresa, seria errada aqui: a pessoa está respondendo
    // a uma abordagem comercial nossa e já sabe do que se trata. Segurar a
    // apresentação para "conhecer o cliente primeiro" faz ela perder o fio.
    `Como esta é uma abordagem nossa, você JÁ deve dizer a que veio na primeira resposta: ` +
    `apresente-se pelo nome (o que consta nas informações da empresa), diga em uma frase curta o que a ` +
    `empresa faz e por que faz sentido para o negócio dela — e só então faça UMA pergunta. Não fique ` +
    `perguntando o nome e o ramo dela antes de explicar quem é você e o motivo do contato. ` +
    `Mesmo aqui, continue valendo a regra de um tópico por mensagem: nunca despeje serviço, preço e ` +
    `prazo de uma vez só.`
  );
}
