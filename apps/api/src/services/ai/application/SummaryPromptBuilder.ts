import { Message } from '../../conversations/domain/entities/Message';
import { AiGenerationRequest } from '../domain/providers/AiProvider';
import { describeMessageContent } from './PromptBuilder';

/**
 * System prompt do resumo de conversa (Redesign 2026-08-05, R5) — DELIBERADAMENTE
 * um prompt PRÓPRIO, não o `PromptVersion`/`PromptBuilder` do autoresponder:
 * aquele carrega regras de ATENDIMENTO (anti-alucinação de preço/prazo,
 * marcador de escalonamento, marcador de estágio do Pipeline) que não fazem
 * sentido aqui — este resumo é para CONSUMO INTERNO da equipe (o operador que
 * abre a conversa), não uma resposta ao cliente. Pedir um parágrafo curto,
 * factual, sem inventar informação que não esteja no histórico.
 */
const SUMMARY_SYSTEM_PROMPT = `Você é um assistente que resume conversas de atendimento ao cliente via WhatsApp para uso INTERNO da equipe de uma empresa — quem lê o resumo é o atendente, nunca o cliente.

Gere um resumo curto (3 a 5 frases, texto corrido, sem tópicos) cobrindo:
- O que o cliente quer ou precisa;
- O que já foi tratado/respondido até agora;
- O que ainda falta resolver ou decidir.

Regras:
- Seja objetivo e factual — nunca invente informação que não esteja no histórico.
- Nunca se dirija ao cliente; o resumo é uma nota interna para a equipe.
- Se o histórico for curto ou inconclusivo, diga isso em vez de especular.`;

/**
 * Transforma o histórico de uma conversa (`Message[]`, ordem cronológica —
 * mesmo contrato de `PromptBuilder.build()`) num `AiGenerationRequest` pronto
 * para qualquer `AiProvider`, mas com o system prompt de RESUMO acima em vez
 * do prompt de atendimento. Reusa `describeMessageContent` (exportada de
 * `PromptBuilder.ts`) para a mesma descrição factual de mídia sem legenda —
 * nenhuma duplicação de lógica entre os dois builders.
 *
 * Função pura solta (não uma classe, diferente de `PromptBuilder`) — não tem
 * nenhuma variação de configuração (sem `businessContext`/`offHoursContext`,
 * que só fazem sentido para o autoresponder), então não há estado nenhum a
 * carregar entre chamadas.
 */
export function buildSummaryPrompt(messages: Message[]): AiGenerationRequest {
  return {
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    messages: messages.map((message) => ({
      role: message.direction === 'inbound' ? 'user' : 'assistant',
      content: describeMessageContent(message),
    })),
  };
}
