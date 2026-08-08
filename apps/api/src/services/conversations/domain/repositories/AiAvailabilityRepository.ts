/**
 * Fase 1 (2026-08-07) — Botão POWER: porta ESTREITA, definida DENTRO de
 * `services/conversations` (não em `services/ai`), para ler se a resposta
 * automática da IA está ligada para uma sessão — usada pelos DOIS pontos que
 * já decidem `shouldAutoRespond` (`MessageIngestionService`, ao ingerir uma
 * mensagem, e `AiReplyJobProcessor`, ao processar o job).
 *
 * POR QUE UMA PORTA PRÓPRIA, EM VEZ DE IMPORTAR
 * `AiBusinessProfileRepository` (`services/ai/domain`) DIRETO: o dado
 * (`aiEnabled`) hoje mora na mesma tabela do Cérebro da IA
 * (`ai_business_profiles`, reuso deliberado — ver ADR desta feature), mas
 * `services/conversations` não deveria depender do DOMÍNIO de `services/ai`
 * só para ler um booleano (o resto de `AiBusinessProfile` — `content`,
 * horário de atendimento — não interessa aqui, e importar o tipo inteiro
 * criaria uma dependência de ida-e-volta entre os dois bounded contexts,
 * já que `services/ai` também depende de `services/conversations` para os
 * tipos `Conversation`/`Message`). Este port devolve só o que
 * `shouldAutoRespond` precisa. A implementação real
 * (`PrismaAiAvailabilityRepository`) consulta a MESMA tabela — nenhuma
 * duplicação de dado, só de leitura.
 */
export interface AiAvailabilityRepository {
  /**
   * `true` = a IA pode responder automaticamente novas mensagens desta
   * sessão; `false` = Botão POWER desligado. Sessão sem nenhuma configuração
   * de Cérebro da IA ainda (nunca usou o Botão POWER nem salvou um perfil)
   * devolve `true` — o default é sempre "ligado".
   */
  isEnabled(tenantId: string, sessionName: string): Promise<boolean>;
}
