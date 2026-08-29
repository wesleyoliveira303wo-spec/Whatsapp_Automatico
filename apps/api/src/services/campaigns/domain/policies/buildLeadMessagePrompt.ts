import { EnrichedLead } from '../entities/EnrichedLead';
import { MessageSkeleton, MessageVariation } from './pickMessageVariation';

/** Descrição, em português claro, de CADA esqueleto — a IA recebe isto como instrução de estrutura, nunca escolhe a estrutura sozinha. */
const SKELETON_INSTRUCTIONS: Record<MessageSkeleton, string> = {
  elogio_pergunta_curta:
    'Estrutura: comece com um elogio curto baseado no dado real do lead, feche com UMA pergunta direta. Duas linhas no máximo.',
  observacao_reticencias:
    'Estrutura: uma observação sobre o negócio do lead, terminando em reticências (sem ponto de interrogação) — um pensamento em aberto, não uma pergunta fechada.',
  pergunta_gancho_pergunta:
    'Estrutura: abra com uma pergunta leve, no meio cite o gancho/elogio, feche com outra pergunta. Três a quatro linhas.',
  observacao_call_leve:
    'Estrutura: uma observação sobre o negócio, seguida de uma frase que convida a continuar a conversa de forma leve (nunca um agendamento de call — isso só entra a partir da mensagem 3, nunca aqui).',
  gancho_curto_pergunta_aberta:
    'Estrutura: gancho bem curto (uma frase), seguido de uma pergunta objetiva e aberta. Duas linhas no máximo.',
  dado_numerico_observacao_pergunta:
    'Estrutura: comece citando o dado numérico (nota/avaliações) do lead, uma observação sobre o que esse dado significa, feche com uma pergunta.',
  pergunta_leve_exploratoria:
    'Estrutura: pergunta leve e exploratória logo no início (sobre planos/crescimento do negócio), sem nenhuma oferta — típica de lead de prioridade Baixa.',
};

/**
 * Monta o prompt (system + user) que `GenerateLeadMessagesService` manda
 * para `AiProvider.generateReply` — Fase de Prospecção IA (2026-08-29).
 * Traduz DIRETAMENTE as regras de
 * `leads-prospeccao-google-maps/PLAYBOOK_IA_WHATSAPP.md` (Seções 2, 5 e 6)
 * em instruções explícitas; nenhuma regra de negócio fica só "implícita"
 * na cabeça do modelo.
 *
 * `variation` já veio de `pickMessageVariation` — esta função só TRADUZ o
 * esqueleto/gancho escolhidos em texto, nunca escolhe sozinha (mantém a
 * variação determinística e testável fora do alcance da IA).
 */
export function buildLeadMessagePrompt(
  lead: EnrichedLead,
  variation: MessageVariation,
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = `Você escreve a PRIMEIRA mensagem de WhatsApp de uma prospecção fria B2B, seguindo estas regras obrigatórias:

1. ZERO OFERTA: esta é a mensagem 1 de uma sequência. Nunca ofereça produto, serviço, reunião ou qualquer solução. O objetivo é só abrir uma conversa genuína.
2. Termine SEMPRE em uma pergunta aberta OU em uma frase com reticências (um pensamento em aberto) — nunca em uma afirmação fechada, nunca em uma chamada para ação de venda.
3. Nunca escreva a frase "vocês não têm site" (ou qualquer variação literal disso, tipo "percebi que não tem site"/"vi que não tem página") — se o negócio não tem site, reformule sempre como curiosidade/oportunidade sobre COMO o cliente encontra o negócio hoje, nunca como uma crítica ou constatação de falha.
4. Nunca invente dado: use só nota, quantidade de avaliações, nome e bairro exatamente como informados abaixo. Se nota/quantidade de avaliações não forem informadas, NÃO cite nenhum número — não invente "boa reputação" nem aproxime um valor.
5. Tom da mensagem: ${lead.recommendedTone}
6. ${SKELETON_INSTRUCTIONS[variation.skeleton]}
7. Responda APENAS com o texto final da mensagem, sem aspas, sem comentário, sem prefixo como "Mensagem:".`;

  const chosenHook =
    lead.openingHooks.length > 0
      ? lead.openingHooks[variation.hookIndex % lead.openingHooks.length]
      : `Vi o ${lead.companyName} no Google Maps`;

  const hasSocialProof = lead.reviewCount > 0 && lead.googleRating !== undefined;

  const userMessageLines = [
    `Empresa: ${lead.companyName}`,
    `Categoria: ${lead.category}`,
    `Bairro: ${lead.neighborhood}`,
    `Situação digital: ${lead.siteStatus}`,
    hasSocialProof
      ? `Prova social real: ${lead.socialProofTrigger} (nota ${lead.googleRating}, ${lead.reviewCount} avaliações)`
      : 'Prova social: NENHUMA ainda (negócio sem histórico de resenhas no Google) — não cite números de classificação nem contagem de resenhas.',
    `Dor principal identificada: ${lead.mainPainPoint}`,
    `Estrutura da mensagem: ${SKELETON_INSTRUCTIONS[variation.skeleton]}`,
    `Gancho de abertura a usar (adapte a redação, mas mantenha a ideia): ${chosenHook}`,
  ];

  return { systemPrompt, userMessage: userMessageLines.join('\n') };
}
