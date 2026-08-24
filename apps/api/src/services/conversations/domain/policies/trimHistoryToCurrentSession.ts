import { Message } from '../entities/Message';

/**
 * Janela de sessão padrão: 24h sem NENHUMA mensagem (inbound ou outbound)
 * encerra a sessão de contexto atual — pedido direto do fundador
 * (2026-08-24), depois de perceber que a IA "lembrava" de uma conversa de
 * dias atrás como se fosse a mesma continuação, quando o cliente pode estar
 * voltando para pedir algo TOTALMENTE diferente. Mesmo racional da janela de
 * atendimento de 24h já usada por outras plataformas de WhatsApp Business —
 * não é um valor arbitrário, é o período que a própria Meta trata como "a
 * mesma conversa" para fins de cobrança/janela de resposta.
 */
export const DEFAULT_SESSION_GAP_MS = 24 * 60 * 60 * 1000;

/**
 * Corta o histórico de uma conversa na última "sessão" ativa — a IA
 * continua vendo o contexto de quem já está conversando, mas PARA de
 * carregar conversas antigas como se fossem a mesma quando o cliente some e
 * volta dias depois.
 *
 * O PROBLEMA (achado real, 2026-08-24): a conversa nunca é apagada — é o
 * histórico mais valioso do produto (ver docstring de
 * `WhatsAppConversation.contactId`/ADR de retenção) — mas até esta rodada
 * TODO o histórico dentro de `historyLimit` (20 mensagens por padrão) virava
 * contexto da IA, não importa se a última mensagem foi há 2 minutos ou há 3
 * semanas. Um cliente que sumiu e voltou recebia uma IA que "já sabia" o que
 * ele tinha perguntado da última vez — inclusive quando ele estava
 * claramente ali para pedir algo diferente.
 *
 * A REGRA, deliberadamente simples e sem tabela nova: percorre o histórico
 * (cronológico, mais antigo primeiro — mesmo formato que
 * `AiReplyJobProcessor` já monta) procurando o ÚLTIMO ponto onde o intervalo
 * entre duas mensagens consecutivas foi >= `sessionGapMs`; devolve só o que
 * vem A PARTIR dali (a sessão atual). Sem gap nenhum >= o limite, devolve o
 * histórico inteiro sem cortar nada — comportamento pré-existente
 * preservado para o caso comum (conversa contínua).
 *
 * DELIBERADAMENTE NÃO APAGA NADA: `messages` aqui é só o array em memória
 * que vira contexto da chamada de IA — o banco continua com a conversa
 * inteira, para o operador ver na Dashboard. "Recomeçar a conversa" é sobre
 * o que a IA LÊ, não sobre o que fica GRAVADO.
 *
 * NÃO mexe em `stage`/`escalatedAt`/qualquer outro campo da `Conversation` —
 * escopo deliberadamente restrito ao contexto passado à IA (o pedido do
 * fundador foi especificamente sobre a IA "esquecer" o assunto anterior, não
 * sobre o funil de CRM voltar para "Novo"). Se isso se mostrar errado, é uma
 * decisão de produto separada, não decidida agora.
 */
export function trimHistoryToCurrentSession(
  messages: Message[],
  sessionGapMs: number = DEFAULT_SESSION_GAP_MS,
): Message[] {
  let sessionStart = 0;
  for (let index = 1; index < messages.length; index += 1) {
    const gap = messages[index].occurredAt.getTime() - messages[index - 1].occurredAt.getTime();
    if (gap >= sessionGapMs) {
      sessionStart = index;
    }
  }
  return messages.slice(sessionStart);
}
