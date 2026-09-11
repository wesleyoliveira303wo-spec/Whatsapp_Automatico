import { Conversation } from '../../conversations/domain/entities/Conversation';
import { Message } from '../../conversations/domain/entities/Message';
import { AiGenerationRequest } from '../domain/providers/AiProvider';
import { describeMessageContent } from './PromptBuilder';

export const STAGE_CLASSIFIER_PROMPT_VERSION = 'stage-classifier-v1';

const STAGE_LABEL: Record<Conversation['stage'], string> = {
  new: 'NEW',
  contacted: 'CONTACTED',
  negotiating: 'NEGOTIATING',
  closed_won: 'CLOSED_WON',
  closed_lost: 'CLOSED_LOST',
};

/**
 * Prompt PRÓPRIO do classificador (2026-09-11), não o do autoresponder: aqui
 * a IA não conversa com ninguém, só lê a conversa e devolve um rótulo. As
 * definições dos estágios são as mesmas do marcador `[[ESTAGIO:...]]` que o
 * autoresponder usa, e a saída reaproveita esse formato para ser lida pela
 * MESMA função (`extractStage`) — um parser só no projeto.
 */
const STAGE_CLASSIFIER_SYSTEM_PROMPT = `Você classifica conversas de WhatsApp entre uma empresa e um cliente em um funil de vendas. Você NÃO responde ao cliente: só lê a conversa e devolve o estágio.

Estágios:
- NEW: ainda não houve troca real sobre o que o cliente quer (só cumprimento, mensagem solta, ou a empresa mandou a primeira mensagem e o cliente não respondeu nada relevante).
- CONTACTED: já se falou sobre o que o cliente precisa ou sobre o serviço, mas sem discutir preço, prazo, pagamento ou fechamento.
- NEGOTIATING: o cliente pediu ou está discutindo preço, orçamento, proposta, prazo, forma de pagamento, ou demonstrou intenção clara de comprar.
- CLOSED_WON: o cliente confirmou a compra/contratação, combinou o pagamento, mandou comprovante ou a empresa confirmou o fechamento.
- CLOSED_LOST: o cliente recusou de forma explícita, disse que não tem interesse, que fechou com outro, ou pediu para não ser mais contatado.

Regras:
- Classifique pelo estado da conversa INTEIRA até agora, não só pela última mensagem.
- Mensagens da empresa podem ter sido escritas por um atendente humano; elas contam do mesmo jeito.
- Na dúvida entre dois estágios, escolha o mais cedo no funil.
- Responda com UMA linha, exatamente neste formato e nada mais: [[ESTAGIO:NOME_DO_ESTAGIO]]`;

/**
 * Monta o pedido de classificação. A conversa vai como UMA mensagem de
 * usuário com a transcrição — não como turnos `user`/`assistant`, que
 * convidariam o modelo a CONTINUAR a conversa em vez de classificá-la.
 */
export function buildStageClassificationPrompt(
  messages: Message[],
  currentStage: Conversation['stage'],
): AiGenerationRequest {
  const transcript = messages
    .map((message) =>
      `${message.direction === 'inbound' ? 'Cliente' : 'Empresa'}: ${describeMessageContent(message)}`,
    )
    .join('\n');

  return {
    systemPrompt: STAGE_CLASSIFIER_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Estágio atual no funil: ${STAGE_LABEL[currentStage]}\n\nConversa:\n${transcript}`,
      },
    ],
  };
}
