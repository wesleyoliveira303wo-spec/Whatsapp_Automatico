/**
 * Mutex assíncrono por chave, em memória — Fase 1, Bloco F1.10 (concorrência
 * do worker de IA).
 *
 * CONTEXTO: o worker de `ai-reply` passou a rodar com `concurrency > 1`
 * (várias mensagens de tenants/conversas diferentes processadas em
 * paralelo). Isso é seguro ENTRE conversas (cada uma só toca a própria
 * linha no banco), mas não é seguro DENTRO da mesma conversa: duas
 * mensagens inbound próximas no tempo geram dois jobs distintos (o `jobId`
 * de idempotência do BullMQ é por `messageId`, não por `conversationId` —
 * ver `BullMqAiReplyScheduler`), e nada impedia dois jobs do MESMO
 * `conversationId` serem processados ao mesmo tempo por dois slots de
 * concorrência — duas chamadas concorrentes a `ConversationAiService.
 * generateReply()` leriam o MESMO histórico (a mensagem gerada pela
 * primeira ainda não persistida), gerando duas respostas conflitantes, dois
 * `updateStage` correndo por cima um do outro, etc.
 *
 * `KeyedMutex.run(key, fn)` serializa chamadas para a MESMA chave (uma
 * espera a anterior terminar, sucesso ou falha, antes de começar) e não
 * impõe NENHUMA espera entre chaves diferentes — é exatamente o "paralelo
 * entre conversas, serial dentro da mesma conversa" pedido.
 *
 * LIMITAÇÃO CONHECIDA (documentada de propósito, não escondida): este lock é
 * EM MEMÓRIA, válido só dentro de um único processo Node. O deploy atual do
 * worker é um processo único (`apps/api/src/worker.ts`, ver docstring desse
 * arquivo — "sobe como um processo separado", sem menção a múltiplas
 * réplicas). Se o worker algum dia escalar horizontalmente (mais de uma
 * réplica do mesmo processo), este mutex deixa de proteger jobs da mesma
 * conversa processados por réplicas DIFERENTES — nesse cenário seria
 * necessário um lock distribuído (ex.: `SET NX PX` no Redis, que o processo
 * já usa para o BullMQ). Não implementado agora porque não corresponde ao
 * modelo de deploy atual (YAGNI) — registrar como item de atenção antes de
 * qualquer escalonamento horizontal do worker.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  /**
   * Executa `fn` depois que qualquer execução anterior registrada para a
   * mesma `key` tiver terminado (com sucesso ou erro). Chamadas com chaves
   * diferentes nunca esperam uma pela outra.
   */
  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    // `previous` pode ter rejeitado — não deixamos essa rejeição vazar para
    // quem está atrás na fila, só usamos como "sinal de terminou".
    const started = previous.catch(() => undefined).then(fn);
    // O que fica registrado como "cauda" desta chave é a versão que nunca
    // rejeita (para o PRÓXIMO `run` da mesma chave não quebrar por causa de
    // uma falha desta execução) — quem CHAMOU este `run` ainda recebe o
    // erro real via `await started` abaixo.
    const tracked = started.catch(() => undefined);
    this.tails.set(key, tracked);
    try {
      return await started;
    } finally {
      // Libera memória: se ninguém mais entrou na fila desta chave enquanto
      // rodávamos, remove a entrada (evita o Map crescer para sempre com
      // conversas que só tiveram 1 mensagem).
      if (this.tails.get(key) === tracked) {
        this.tails.delete(key);
      }
    }
  }
}
