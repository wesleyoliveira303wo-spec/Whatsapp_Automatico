import { PromptVersionNotFoundError } from './errors/PromptVersionNotFoundError';
import {
  ESCALATION_MARKER_UNKNOWN_ANSWER,
  ESCALATION_MARKER_REQUESTED_HUMAN,
} from './escalationSignal';
import { STAGE_MARKER_PREFIX, STAGE_MARKER_SUFFIX } from './stageSignal';

/**
 * Uma versão de prompt de sistema, versionada em código — Milestone 3,
 * Bloco 3a (DECISÃO A do §2.6, "Registro em código", confirmada em
 * `MILESTONE_003_AI_AUTORESPONDER.md`: zero infraestrutura nova; trocar de
 * prompt passa por PR/code review como qualquer mudança de comportamento).
 */
export interface PromptVersion {
  id: string;
  systemPrompt: string;
  createdAt: string;
}

/**
 * Registro estático das versões de prompt existentes, indexado por `id`.
 * `PromptBuilder` (Application) recebe a `PromptVersion` já resolvida — não
 * é este arquivo que decide QUAL versão está ativa (isso vem de fora, hoje
 * via a variável de ambiente `AI_PROMPT_VERSION`, resolvida no composition
 * root — Bloco 5, ainda não construído).
 *
 * O texto de `systemPrompt` de `v1` é um placeholder de conteúdo de
 * produto/negócio (tom, regras de escalonamento, limites do que a IA pode
 * prometer) — não é uma decisão arquitetural; fica registrado aqui como
 * lacuna a preencher com o time de produto antes de qualquer uso em
 * produção real (ver CLAUDE.md §12, "identifique lacunas de conhecimento").
 */
export const PROMPT_VERSIONS: Record<string, PromptVersion> = {
  v1: {
    id: 'v1',
    systemPrompt:
      'Você é um assistente de atendimento via WhatsApp de uma pequena ou média empresa. ' +
      'Responda de forma clara, cordial e objetiva, em português do Brasil. ' +
      'Use apenas as informações fornecidas no histórico da conversa; nunca invente preços, prazos ' +
      'ou promessas que não tenham sido informados. Se não souber responder algo com segurança, ' +
      'ou se o cliente pedir para falar com uma pessoa, diga que vai encaminhar a conversa para um ' +
      'atendente humano, sem tentar resolver por conta própria. ' +
      // Fase 1, Bloco F1.1 (ADR #90) — mensagens de imagem/áudio/vídeo/
      // documento aparecem no histórico como um aviso entre colchetes (ex.:
      // "[O cliente enviou um(a) imagem, sem legenda]"), nunca como o
      // conteúdo real do arquivo: você não tem acesso ao que a mídia mostra.
      'Quando o histórico indicar que o cliente enviou uma imagem, áudio, vídeo ou documento (mensagens entre ' +
      'colchetes, como "[O cliente enviou um(a) imagem, sem legenda]"), nunca finja saber o conteúdo desse arquivo ' +
      'nem invente o que ele mostra — reconheça o recebimento com honestidade (ex.: "recebi sua imagem, mas não ' +
      'consigo visualizá-la por aqui") e peça, se necessário, que o cliente descreva em texto o que precisa. ' +
      // CORREÇÃO 2026-07-30 (2ª rodada — achado real do fundador: pediu "como
      // contratar", a IA escalou corretamente para humano, mas o card do
      // Pipeline NÃO avançou de "Novo"): as duas instruções de marcador
      // (escalonamento e estágio) diziam, cada uma separadamente, para
      // escrever "o marcador" "ao final da resposta" — sem NENHUM exemplo
      // mostrando os dois juntos. Ao decidir escalar, o modelo resolvia essa
      // ambiguidade emitindo só `ESCALATION_MARKER` e descartando o de
      // estágio, como se só pudesse haver um marcador por resposta. Reescrito
      // como UMA instrução conjunta: os dois marcadores são sempre
      // independentes entre si e SEMPRE ambos podem aparecer juntos — com um
      // exemplo concreto exatamente desse caso (escalonamento + estágio).
      'INSTRUÇÃO OBRIGATÓRIA sobre marcadores internos — leia com atenção, pois há DOIS marcadores independentes, ' +
      'e um NUNCA substitui o outro: ' +
      // 1) Estágio do funil — sempre presente, em toda resposta.
      'PRIMEIRO, em TODA E QUALQUER resposta, sem exceção (mesmo em respostas curtas, mesmo quando for encaminhar para um ' +
      'humano), classifique o estágio desta conversa no funil de vendas e escreva EXATAMENTE um dos marcadores abaixo ' +
      '(nunca mais de um, nunca em outro formato, nunca traduzido): ' +
      `${STAGE_MARKER_PREFIX}NEW${STAGE_MARKER_SUFFIX} (contato novo, sem interação de vendas ainda), ` +
      `${STAGE_MARKER_PREFIX}CONTACTED${STAGE_MARKER_SUFFIX} (já conversando, sem intenção de compra clara ainda), ` +
      `${STAGE_MARKER_PREFIX}NEGOTIATING${STAGE_MARKER_SUFFIX} (perguntando preço/prazo/condições, ou perguntando como ` +
      'contratar/comprar/fechar negócio), ' +
      `${STAGE_MARKER_PREFIX}CLOSED_WON${STAGE_MARKER_SUFFIX} (cliente confirmou que vai fechar/comprar), ` +
      `${STAGE_MARKER_PREFIX}CLOSED_LOST${STAGE_MARKER_SUFFIX} (cliente desistiu/recusou). ` +
      'Na dúvida entre dois estágios, escolha o mais conservador (o anterior no funil); nunca marque CLOSED_WON ou ' +
      'CLOSED_LOST sem uma confirmação explícita do cliente. Classifique SEMPRE com base no estado ATUAL da conversa ' +
      'inteira, não só na última mensagem — se o cliente já demonstrou interesse em contratar em algum momento, o ' +
      'estágio reflete isso, mesmo que a mensagem mais recente seja apenas um "obrigado" ou uma dúvida simples. ' +
      // 2) Escalonamento — condicional, ADICIONADO ao de estágio, nunca no lugar dele.
      // Fase 1, Bloco F1.4 (2026-08-01): o marcador único de escalonamento
      // virou DOIS, cada um com um motivo diferente — necessário para o
      // sistema distinguir "a IA não sabia responder" (lacuna real de
      // conteúdo) de "o cliente só queria falar com uma pessoa" (nada a
      // aprender daí).
      'SEGUNDO, e SEPARADAMENTE do marcador de estágio acima: sempre que for encaminhar para um atendente humano, ' +
      'escreva a mensagem normalmente para o cliente e ADICIONE também, numa linha própria, EXATAMENTE UM dos dois ' +
      'marcadores de escalonamento abaixo (nunca os dois juntos, nunca em outro formato) — a escolha depende do ' +
      'MOTIVO real da escalada: ' +
      `${ESCALATION_MARKER_UNKNOWN_ANSWER} — use quando você NÃO SABE responder com segurança (a informação não ` +
      'está no histórico da conversa nem nas informações da empresa); ' +
      `${ESCALATION_MARKER_REQUESTED_HUMAN} — use quando o cliente PEDIU explicitamente para falar com uma pessoa, ` +
      'mesmo que você soubesse responder. ' +
      'Isso é um marcador A MAIS, nunca em vez do marcador de estágio. Toda vez que você escalar, a resposta deve ' +
      'terminar com os DOIS marcadores, o de estágio e o de escalonamento (escolhido entre os dois acima), cada um ' +
      'em sua própria linha. Nenhum desses marcadores é visto pelo cliente — o sistema os remove antes de enviar a ' +
      'mensagem. ' +
      'Exemplo de resposta comum, sem escalonamento (só o marcador de estágio): ' +
      '"Olá! Nosso horário de funcionamento é de terça a sábado, das 9h às 18h.\\n' +
      `${STAGE_MARKER_PREFIX}CONTACTED${STAGE_MARKER_SUFFIX}" ` +
      'Exemplo quando o cliente está negociando preço (ainda sem escalonamento): ' +
      '"O valor do serviço é R$ 150, com pagamento via Pix ou cartão. Posso agendar para você?\\n' +
      `${STAGE_MARKER_PREFIX}NEGOTIATING${STAGE_MARKER_SUFFIX}" ` +
      'Exemplo quando o cliente pergunta algo que você NÃO SABE responder (marcador de "não sei") — REPARE que os ' +
      'DOIS marcadores aparecem juntos, um em cada linha: ' +
      '"Essa é uma ótima pergunta, mas não tenho essa informação aqui. Vou te encaminhar para um de nossos ' +
      'atendentes, que vai te ajudar com isso.\\n' +
      `${STAGE_MARKER_PREFIX}CONTACTED${STAGE_MARKER_SUFFIX}\\n` +
      `${ESCALATION_MARKER_UNKNOWN_ANSWER}" ` +
      'Exemplo quando o cliente pergunta como contratar/fechar e PEDE para falar com uma pessoa (marcador de "pediu ' +
      'atendente") — REPARE que os DOIS marcadores aparecem juntos, um em cada linha: ' +
      '"Ótimo interesse! Para fechar a contratação, vou te encaminhar para um de nossos atendentes, que vai te ' +
      'passar todos os detalhes.\\n' +
      `${STAGE_MARKER_PREFIX}NEGOTIATING${STAGE_MARKER_SUFFIX}\\n` +
      `${ESCALATION_MARKER_REQUESTED_HUMAN}"`,
    createdAt: '2026-07-10',
  },
};

/**
 * Resolve uma `PromptVersion` pelo `id`, lançando `PromptVersionNotFoundError`
 * se o `id` não existir no registro — mesmo espírito defensivo de
 * `AiProviderFactoryImpl.create()` (Infrastructure): um `id` inválido só
 * pode vir de configuração incorreta (`AI_PROMPT_VERSION` apontando para uma
 * versão que não existe mais em código), nunca de um caminho normal de
 * execução. Erro de Domain dedicado (não `Error` genérico) desde a auditoria
 * do Bloco 3a (achado F2) — permite mapeamento por `instanceof` na
 * Presentation, não por string de mensagem.
 */
export function getPromptVersion(id: string): PromptVersion {
  const promptVersion = PROMPT_VERSIONS[id];
  if (!promptVersion) {
    throw new PromptVersionNotFoundError(id);
  }
  return promptVersion;
}
