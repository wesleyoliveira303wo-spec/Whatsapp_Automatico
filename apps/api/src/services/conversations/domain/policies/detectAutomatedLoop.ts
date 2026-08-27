import { Message } from '../entities/Message';

/**
 * Quantas trocas (nossa resposta → resposta do outro lado) olhar para trás
 * ao avaliar os dois sinais — decisão do fundador (2026-08-27): 3 trocas.
 * Exportado para `AiReplyJobProcessor` usar o MESMO valor como default do
 * parâmetro de construtor correspondente, sem duplicar o número.
 */
export const DEFAULT_AUTOMATED_LOOP_EXCHANGES_TO_CHECK = 3;

/**
 * Abaixo deste intervalo entre o FIM da nossa resposta e o INÍCIO da
 * resposta seguinte, o ritmo é rápido demais para ser humano — decisão do
 * fundador: 3 segundos.
 */
export const DEFAULT_AUTOMATED_LOOP_MAX_REPLY_LATENCY_MS = 3_000;

/** Uma sequência de mensagens CONSECUTIVAS da mesma direção, tratada como um único "turno" da conversa. */
interface Turn {
  direction: Message['direction'];
  /** Texto concatenado do turno inteiro — uma resposta da IA vira várias `Message` outbound (uma por parágrafo, `splitReplyIntoParagraphs`); aqui elas contam como UM turno só. */
  text: string;
  /** Quando o turno começou (`occurredAt` da primeira mensagem). */
  startedAt: Date;
  /** Quando o turno terminou (`occurredAt` da última mensagem) — é a partir daqui que a latência da resposta seguinte é medida. */
  endedAt: Date;
}

/** Uma troca completa: nosso turno seguido do turno de resposta do outro lado. */
interface Exchange {
  ourText: string;
  theirText: string;
  latencyMs: number;
}

/**
 * Detecta um possível LOOP DE AUTOMAÇÃO no outro lado da conversa — o
 * cenário que motivou esta policy (pedido do fundador, 2026-08-27): um
 * disparo de campanha atinge um número que também é um robô/auto-resposta,
 * e as duas automações passam a se responder indefinidamente, cada rodada
 * consumindo uma chamada real ao provider de IA.
 *
 * DELIBERADAMENTE NÃO é um teto de quantidade/tempo (ex.: "no máximo N
 * respostas por hora") — um limite assim penaliza igualmente uma conversa
 * humana longa e animada, e não usa nenhum sinal real de que o outro lado
 * não é gente. Em vez disso, dois sinais de COMPORTAMENTO, avaliados juntos:
 *
 * 1. RITMO — as últimas `exchangesToCheck` trocas tiveram todas uma latência
 *    (fim da nossa resposta → início da resposta seguinte) menor que
 *    `maxReplyLatencyMs`. Um humano não sustenta esse ritmo em várias trocas
 *    seguidas (precisa ler e digitar); uma automação sim.
 * 2. CONTEÚDO — as respostas do outro lado nessas mesmas trocas se repetem
 *    entre si (quase palavra por palavra) OU ecoam quase literalmente a
 *    NOSSA própria resposta anterior (assinatura clássica de auto-resposta:
 *    "Recebemos sua mensagem, retornaremos em breve" batendo de volta).
 *
 * Só quando OS DOIS aparecem juntos na mesma janela recente é que a policy
 * devolve `true` — cada sinal sozinho tem falso-positivo razoável (alguém
 * digitando rápido, ou repetindo uma palavra), mas a combinação dos dois é
 * um padrão que uma conversa humana genuína praticamente não produz.
 *
 * NÃO decide o que fazer com a conversa (não sinaliza, não envia nada) — é
 * só a pergunta "isto parece um loop de automação?", respondida por uma
 * função pura, testável sem infraestrutura, mesmo padrão de
 * `shouldGenerateReply`/`shouldAiUpdateStage`. `AiReplyJobProcessor` decide
 * a ação (parar de responder e sinalizar para um humano, sem avisar o
 * "cliente" — não há ninguém do lado de lá para ler o aviso).
 *
 * DEGRADAÇÃO SEGURA: com menos de `exchangesToCheck` trocas completas no
 * histórico, não há dado suficiente para concluir nada — devolve `false`
 * (nunca bloqueia uma conversa nova/curta por falta de amostra).
 */
export function detectAutomatedLoop(
  messages: Message[],
  exchangesToCheck: number = DEFAULT_AUTOMATED_LOOP_EXCHANGES_TO_CHECK,
  maxReplyLatencyMs: number = DEFAULT_AUTOMATED_LOOP_MAX_REPLY_LATENCY_MS,
): boolean {
  const exchanges = buildRecentExchanges(messages, exchangesToCheck);
  if (exchanges.length < exchangesToCheck) {
    return false;
  }

  const fastReplies = exchanges.every(
    (exchange) => exchange.latencyMs >= 0 && exchange.latencyMs < maxReplyLatencyMs,
  );
  if (!fastReplies) {
    return false;
  }

  return hasRepeatedContent(exchanges);
}

/**
 * Agrupa `messages` (cronológico, mais antiga primeiro — mesma convenção já
 * usada por `PromptBuilder`/`shouldGenerateReply`) em turnos e devolve as
 * últimas `limit` trocas completas (nosso turno seguido do turno de resposta
 * do outro lado). Mensagens sem `content` (mídia sem legenda) entram como
 * string vazia — não impedem a medição de latência, só não contribuem para
 * a comparação de conteúdo.
 */
function buildRecentExchanges(messages: Message[], limit: number): Exchange[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    const previous = turns[turns.length - 1];
    if (previous && previous.direction === message.direction) {
      previous.text = `${previous.text} ${message.content}`.trim();
      previous.endedAt = message.occurredAt;
    } else {
      turns.push({
        direction: message.direction,
        text: message.content,
        startedAt: message.occurredAt,
        endedAt: message.occurredAt,
      });
    }
  }

  const exchanges: Exchange[] = [];
  for (let i = 1; i < turns.length; i += 1) {
    const ourTurn = turns[i - 1];
    const theirTurn = turns[i];
    if (ourTurn.direction === 'outbound' && theirTurn.direction === 'inbound') {
      exchanges.push({
        ourText: ourTurn.text,
        theirText: theirTurn.text,
        latencyMs: theirTurn.startedAt.getTime() - ourTurn.endedAt.getTime(),
      });
    }
  }

  return exchanges.slice(-limit);
}

/** Limiar de similaridade (Jaccard sobre palavras normalizadas) acima do qual dois textos contam como "a mesma mensagem, no fundo". */
const SIMILARITY_THRESHOLD = 0.8;

/**
 * As respostas do outro lado se repetem entre si, ou ecoam a nossa própria
 * resposta anterior — comparação barata (normalização de texto + Jaccard de
 * palavras), sem nenhuma chamada de IA/embeddings.
 */
function hasRepeatedContent(exchanges: Exchange[]): boolean {
  for (let i = 1; i < exchanges.length; i += 1) {
    if (isSimilar(exchanges[i].theirText, exchanges[i - 1].theirText)) {
      return true;
    }
  }
  return exchanges.some((exchange) => isSimilar(exchange.theirText, exchange.ourText));
}

function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // pontuação vira espaço
    .split(/\s+/)
    .filter(Boolean);
}

/** Similaridade de Jaccard sobre o CONJUNTO de palavras — barata, simétrica, e suficiente para detectar eco/repetição (não precisa de ordem nem de semântica). */
function isSimilar(a: string, b: string): boolean {
  const wordsA = new Set(normalizeText(a));
  const wordsB = new Set(normalizeText(b));
  if (wordsA.size === 0 || wordsB.size === 0) {
    return false;
  }

  let intersectionSize = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersectionSize += 1;
  }
  const unionSize = wordsA.size + wordsB.size - intersectionSize;

  return intersectionSize / unionSize >= SIMILARITY_THRESHOLD;
}
