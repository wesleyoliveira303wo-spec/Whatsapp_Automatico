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
 * ONDE ISSO SE ENCAIXA NO FLUXO (mudou em 2026-09-17): a ficha é consumida
 * dentro de `AiReplyJobProcessor`, depois de TODOS os portões que encerram
 * sem chamar o provider (`shouldAutoRespond`, `shouldGenerateReply`,
 * `detectAutomatedLoop`) e imediatamente antes de `generateReply` — uma
 * ficha por CHAMADA DE IA.
 *
 * Antes disso, a ficha era consumida em `MessageIngestionService`, uma por
 * MENSAGEM recebida. Desde o agrupamento de rajada (2026-08-14) isso passou
 * a medir a coisa errada: sete fragmentos de uma mesma frase geram sete
 * mensagens e UMA chamada de IA, e as seis fichas restantes eram gastas por
 * jobs que encerram de graça. Na prática, quem escrevia de forma mais
 * natural era quem mais se aproximava de cair em "Aguardando atendente",
 * sem nenhum custo extra ter sido gerado.
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
