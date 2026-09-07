/**
 * Fase 1, Bloco F1.10 (estabilidade para beta) — porta ESTREITA (mesmo
 * padrão de `AiAvailabilityRepository`) para conter rajadas de mensagens
 * antes de gerarem chamadas pagas ao provider de IA.
 *
 * CONTEXTO: a auditoria pré-beta encontrou zero contenção entre "mensagem
 * inbound chega" e "job de IA é enfileirado" — um contato (ou número
 * comprometido) mandando centenas de mensagens força centenas de chamadas
 * de IA, custo real em US$ para o dono do tenant, sem nenhum limite.
 *
 * ONDE ISSO SE ENCAIXA NO FLUXO: `MessageIngestionService.handle()` já
 * decide, com `shouldAutoRespond`, SE deveria agendar uma resposta de IA.
 * `AiRateLimiter` entra como um segundo portão, IMEDIATAMENTE ANTES do
 * `aiReplyScheduler.schedule(...)` — não substitui `shouldAutoRespond`
 * (aquele decide "a IA deveria responder esta conversa, em princípio";
 * este decide "não geramos custo demais numa janela curta de tempo").
 *
 * ESCOPO DO LIMITE (decisão de produto, ver ADR/CLAUDE.md desta rodada):
 * por CONVERSA (evita uma conversa isolada saturar a IA) e por SESSÃO/
 * tenant (evita uma rajada espalhada por várias conversas da mesma sessão
 * WhatsApp saturar o orçamento daquele número). `consume()` verifica os
 * dois limites numa única chamada.
 */
export interface AiRateLimiter {
  /**
   * Registra uma tentativa de gerar resposta de IA para esta conversa/sessão
   * e devolve se ela está DENTRO do limite (`true`, deve prosseguir) ou
   * ESTOUROU (`false`, não deve enfileirar desta vez). Chamar de novo depois
   * que a janela expirar (mensagem seguinte) volta a permitir normalmente —
   * não é um bloqueio permanente, é uma janela deslizante.
   *
   * ASSÍNCRONO desde o bloco B1: a contagem passou a viver num store
   * compartilhado (Redis), para o limite valer entre processos e sobreviver
   * a um restart — ver `RateLimitStore`. A implementação em memória continua
   * existindo como degradação quando não há Redis.
   */
  consume(tenantId: string, sessionName: string, conversationId: string): Promise<boolean>;
}
