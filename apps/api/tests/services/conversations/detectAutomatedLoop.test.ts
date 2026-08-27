import { detectAutomatedLoop } from '../../../src/services/conversations/domain/policies/detectAutomatedLoop';
import { Message } from '../../../src/services/conversations/domain/entities/Message';

const TENANT_ID = 'tenant-1';
const CONVERSATION_ID = 'conversation-1';

let nextId = 0;

function msg(
  direction: Message['direction'],
  content: string,
  occurredAtIso: string,
): Message {
  nextId += 1;
  return {
    id: `msg-${nextId}`,
    tenantId: TENANT_ID,
    conversationId: CONVERSATION_ID,
    direction,
    content,
    contentType: 'text',
    occurredAt: new Date(occurredAtIso),
  };
}

/**
 * Monta 3 trocas (nosso turno → resposta deles) com o MESMO intervalo entre
 * cada uma, começando em `2026-08-27T10:00:00Z` e avançando `stepSeconds` a
 * cada mensagem — helper para não repetir a montagem manual em cada teste.
 */
function buildExchanges(
  replies: string[],
  latencySeconds: number,
  ourText: (index: number) => string = () => 'Olá! Como posso ajudar?',
): Message[] {
  const messages: Message[] = [];
  let t = 0;
  for (let i = 0; i < replies.length; i += 1) {
    messages.push(msg('outbound', ourText(i), isoAt(t)));
    t += latencySeconds;
    messages.push(msg('inbound', replies[i], isoAt(t)));
    t += 5; // tempo "de pensar" antes da próxima rodada nossa, irrelevante para a policy
  }
  return messages;
}

function isoAt(offsetSeconds: number): string {
  return new Date(1_756_290_000_000 + offsetSeconds * 1000).toISOString();
}

describe('detectAutomatedLoop (válvula de segurança contra bot-vs-bot, 2026-08-27)', () => {
  it('devolve false com menos trocas do que o mínimo exigido (sem amostra suficiente)', () => {
    const messages = buildExchanges(['oi', 'oi'], 1);

    expect(detectAutomatedLoop(messages)).toBe(false);
  });

  it('devolve false quando o ritmo é rápido mas o conteúdo NÃO se repete (conversa real, só ágil)', () => {
    const messages = buildExchanges(
      ['Quero saber o preço', 'Vocês têm entrega?', 'Fecho o pedido então'],
      1,
    );

    expect(detectAutomatedLoop(messages)).toBe(false);
  });

  it('devolve false quando o conteúdo se repete mas o ritmo é humano (lento)', () => {
    const messages = buildExchanges(
      ['Recebemos sua mensagem, retornaremos em breve.', 'Recebemos sua mensagem, retornaremos em breve.', 'Recebemos sua mensagem, retornaremos em breve.'],
      120, // 2 minutos — humano lendo e respondendo devagar
    );

    expect(detectAutomatedLoop(messages)).toBe(false);
  });

  it('devolve true quando ritmo rápido (<3s) E conteúdo repetido aparecem juntos (bot-vs-bot)', () => {
    const messages = buildExchanges(
      [
        'Recebemos sua mensagem, retornaremos em breve.',
        'Recebemos sua mensagem, retornaremos em breve.',
        'Recebemos sua mensagem, retornaremos em breve.',
      ],
      1,
    );

    expect(detectAutomatedLoop(messages)).toBe(true);
  });

  it('devolve true quando a resposta do outro lado é um ECO quase literal da NOSSA última resposta', () => {
    const messages = buildExchanges(
      ['Obrigado pelo contato! Em breve retornaremos.', 'Novo assunto qualquer', 'Outro assunto'],
      1,
      () => 'Obrigado pelo contato! Em breve retornaremos.',
    );

    expect(detectAutomatedLoop(messages)).toBe(true);
  });

  it('devolve false quando uma das últimas trocas teve latência alta (só um humano lento no meio já quebra o padrão)', () => {
    const messages: Message[] = [
      msg('outbound', 'Recebemos sua mensagem, retornaremos em breve.', isoAt(0)),
      msg('inbound', 'Recebemos sua mensagem, retornaremos em breve.', isoAt(1)),
      msg('outbound', 'Recebemos sua mensagem, retornaremos em breve.', isoAt(10)),
      msg('inbound', 'Recebemos sua mensagem, retornaremos em breve.', isoAt(70)), // 60s — lento, quebra o ritmo
      msg('outbound', 'Recebemos sua mensagem, retornaremos em breve.', isoAt(80)),
      msg('inbound', 'Recebemos sua mensagem, retornaremos em breve.', isoAt(81)),
    ];

    expect(detectAutomatedLoop(messages)).toBe(false);
  });

  it('ignora nossos próprios parágrafos consecutivos como um ÚNICO turno (não confunde paragrafação com troca real)', () => {
    // Uma resposta da IA em 2 parágrafos (splitReplyIntoParagraphs) grava
    // DUAS Message outbound com timestamps próximos — não deveriam formar
    // uma "troca" entre si.
    const messages: Message[] = [
      msg('outbound', 'Recebemos sua mensagem,', isoAt(0)),
      msg('outbound', 'retornaremos em breve.', isoAt(1)),
      msg('inbound', 'Recebemos sua mensagem, retornaremos em breve.', isoAt(2)),
      msg('outbound', 'Recebemos sua mensagem,', isoAt(10)),
      msg('outbound', 'retornaremos em breve.', isoAt(11)),
      msg('inbound', 'Recebemos sua mensagem, retornaremos em breve.', isoAt(12)),
      msg('outbound', 'Recebemos sua mensagem,', isoAt(20)),
      msg('outbound', 'retornaremos em breve.', isoAt(21)),
      msg('inbound', 'Recebemos sua mensagem, retornaremos em breve.', isoAt(22)),
    ];

    // Ainda assim deve detectar (3 trocas reais, ritmo rápido e repetição),
    // provando que os parágrafos não atrapalham a contagem nem a medição.
    expect(detectAutomatedLoop(messages)).toBe(true);
  });

  it('aceita overrides de exchangesToCheck/maxReplyLatencyMs (calibração futura)', () => {
    const messages = buildExchanges(['msg igual', 'msg igual'], 1);

    expect(detectAutomatedLoop(messages, 3)).toBe(false); // exige 3, só há 2
    expect(detectAutomatedLoop(messages, 2)).toBe(true); // relaxado para 2
    expect(detectAutomatedLoop(messages, 2, 0)).toBe(false); // latência exigida impossível (0ms)
  });
});
