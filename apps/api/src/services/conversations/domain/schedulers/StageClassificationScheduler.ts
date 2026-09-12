/**
 * Porta de agendamento da classificação de estágio do Pipeline (2026-09-11).
 *
 * Usada quando a IA NÃO vai responder a conversa (Botão POWER desligado, ou
 * um humano atendendo): sem isso, o estágio só mudava como efeito colateral da
 * resposta da IA (marcador `[[ESTAGIO:...]]`), e uma conversa atendida por
 * gente ficava parada em "Novo".
 *
 * Nunca deve lançar para quem chama — agendar é auxiliar, a mensagem já foi
 * gravada. A implementação real (`BullMqStageClassificationScheduler`) agenda
 * com atraso longo; quem decide se vale gastar uma chamada de IA é o
 * processador, no momento de rodar (só a mensagem mais recente da conversa
 * segue adiante — ver `isLatestMessage`).
 */
export interface StageClassificationScheduler {
  schedule(tenantId: string, conversationId: string, messageId: string): Promise<void>;
}
