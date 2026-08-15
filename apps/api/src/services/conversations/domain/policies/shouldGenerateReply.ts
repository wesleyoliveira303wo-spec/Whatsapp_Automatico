import { Message } from '../entities/Message';

/**
 * Decide se um job `ai-reply` ainda tem trabalho a fazer, ou se a rajada de
 * mensagens que ele representa já vai ser (ou já foi) atendida por outro job
 * — agrupamento de mensagens em rajada (2026-08-14).
 *
 * O PROBLEMA: uma pessoa escreve no WhatsApp em fragmentos ("Dps foi mn" /
 * "Eu fui bloqueado" / "Mas eles pediram"). Cada fragmento agenda um job, e
 * antes desta policy cada job gerava uma chamada de IA própria — estourando
 * a cota do provider e produzindo respostas fragmento a fragmento, que
 * nenhum atendente humano faz (ele lê tudo e responde uma vez).
 *
 * A REGRA, deliberadamente simples: um job só gera resposta quando a mensagem
 * que o originou é a INBOUND MAIS RECENTE da conversa. Numa rajada de cinco
 * fragmentos, os jobs dos quatro primeiros encontram um fragmento mais novo
 * que o seu e encerram sem custo; o job do último vê que é o mais recente e
 * responde — lendo o histórico completo, portanto a rajada inteira.
 *
 * POR QUE ISSO, E NÃO DEDUPLICAÇÃO POR `jobId` NA FILA (desenho anterior,
 * substituído): usar um `jobId` por CONVERSA fazia o BullMQ descartar as
 * mensagens seguintes da rajada. Só que o descarte do BullMQ acontece
 * enquanto a chave do job EXISTIR em Redis — o que inclui os estados
 * `active` e `failed`, não só `delayed`. Duas consequências graves,
 * verificadas no script Lua do pacote (`addDelayedJob`, `EXISTS jobIdKey`):
 *
 * 1. Uma mensagem que chegasse enquanto o job estava sendo PROCESSADO era
 *    descartada em silêncio — sem erro, sem log, sem sinalização — e nunca
 *    recebia resposta. A janela era de dezenas de segundos (chamada da IA +
 *    retentativas + envio parágrafo a parágrafo).
 * 2. Um job que FALHASSE ficava retido (`removeOnFail`), mantendo a chave
 *    ocupada — e a conversa inteira parava de receber resposta da IA,
 *    permanentemente, por uma oscilação momentânea de Postgres ou Redis.
 *
 * Esta policy troca uma garantia frágil (mecânica de fila) por uma garantia
 * de ESTADO: cada mensagem continua tendo seu próprio job, nenhuma é
 * descartada em nenhum estado da fila, e quem decide é uma função pura,
 * testável sem Redis — mesmo padrão de `shouldAutoRespond`,
 * `shouldAiUpdateStage` e `shouldReactivateBot`, e mesma disciplina de
 * "re-checar no processamento, nunca confiar no enfileiramento".
 *
 * ORDEM TOTAL, PARA NUNCA HAVER SILÊNCIO NEM EMPATE: a comparação é por
 * `(occurredAt, id)`, não só por `occurredAt`. Os timestamps do WhatsApp têm
 * resolução de SEGUNDOS, então dois fragmentos rápidos podem chegar com o
 * mesmo instante; comparando só por data, ou os dois se considerariam "o
 * mais recente" (duas respostas) ou nenhum (silêncio — o defeito grave). O
 * desempate por `id` garante que exatamente UM job da rajada se reconheça
 * como o mais recente.
 *
 * DEGRADAÇÃO SEGURA: se `messageId` não estiver na lista (ex.: o histórico
 * lido é menor que a rajada, ou a mensagem já saiu da janela), a resposta é
 * `true` — gerar uma resposta a mais é sempre preferível a deixar um cliente
 * sem resposta nenhuma, que é a falha que este produto inteiro foi
 * construído para evitar (aviso antes de escalar, reativação após silêncio,
 * sinalização em qualquer falha de IA).
 *
 * NÃO substitui `shouldAutoRespond` (que decide se a IA pode responder
 * àquela conversa) — são perguntas diferentes, avaliadas em sequência no
 * `AiReplyJobProcessor`: primeiro "esta conversa aceita resposta da IA?",
 * depois "este job é o que deve gerá-la?".
 */
export function shouldGenerateReply(messages: Message[], messageId: string): boolean {
  const inbound = messages.filter((message) => message.direction === 'inbound');

  const current = inbound.find((message) => message.id === messageId);
  if (!current) {
    return true;
  }

  return !inbound.some((message) => isNewerThan(message, current));
}

/**
 * `a` é estritamente mais recente que `b` na ordem total `(occurredAt, id)`.
 * O desempate por `id` é comparação lexicográfica simples: o valor absoluto
 * não tem significado (são UUIDs), só precisa ser ESTÁVEL e total — é isso
 * que garante que exatamente um job da rajada se reconheça como o mais
 * recente quando os timestamps empatam.
 */
function isNewerThan(a: Message, b: Message): boolean {
  const aTime = a.occurredAt.getTime();
  const bTime = b.occurredAt.getTime();

  if (aTime !== bTime) {
    return aTime > bTime;
  }
  return a.id > b.id;
}
