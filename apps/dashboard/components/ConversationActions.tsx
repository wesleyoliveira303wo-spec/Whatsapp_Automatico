import { useState } from 'react';
import { BotOff } from 'lucide-react';
import { escalateConversation, resumeConversation, ClientApiError } from '@/lib/clientApi';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import type { ConversationStatus, ConversationSummary } from '@/lib/clientApi';

interface ConversationActionsProps {
  conversationId: string;
  status: ConversationStatus;
  /**
   * ADR #96 (2026-08-01) — se a conversa está fora do funil comercial.
   * Agora é SÓ LEITURA aqui: quem marca/desmarca é o board do Pipeline
   * (arrastar para a coluna "Não cliente"). Este componente apenas informa o
   * operador de que a IA está desligada nesta conversa, para ele não estranhar
   * a ausência de respostas automáticas.
   */
  excludedFromPipeline: boolean;
  /** Recebe a `Conversation` atualizada devolvida pela API (escalate/resume sao idempotentes e devolvem o estado novo) — a pagina aplica via `applyUpdate` do hook, sem rebuscar nada. */
  onUpdated: (conversation: ConversationSummary) => void;
}

/**
 * Acoes de escalonamento (Milestone 3, Bloco 6 — D31): assumir conversa
 * (bot -> humano) / devolver ao bot (humano -> bot).
 *
 * Milestone 6, Bloco M6E-2: feedback migrado do banner inline para `Toast`
 * (`useToast`, M6C) — decisão revisitada agora que o primitivo existe (a
 * decisão original de "sem toast" era só por falta de dependência).
 * Consistente com PRODUCT_PRINCIPLES.md §4.1 e com `MessageComposer`.
 *
 * ADR #96 (2026-08-01) — o botão "Não é cliente"/"Devolver ao funil
 * comercial" (introduzido pela ADR #94) foi REMOVIDO daqui. Motivo de
 * usabilidade levantado pelo fundador: marcar conversa por conversa, de
 * dentro da conversa, não escala para um WhatsApp com centenas de contatos, e
 * a conversa marcada simplesmente desaparecia do Pipeline sem nenhuma tela
 * que a listasse de volta. A marcação passou a ser feita arrastando o card
 * para a coluna "Não cliente" do board, onde ela é visível, contável e
 * reversível pelo mesmo gesto. O endpoint continua existindo — é o board que
 * o consome agora.
 */
export default function ConversationActions({
  conversationId,
  status,
  excludedFromPipeline,
  onUpdated,
}: ConversationActionsProps): JSX.Element {
  const [pending, setPending] = useState(false);

  async function run(action: 'escalate' | 'resume'): Promise<void> {
    setPending(true);
    try {
      const updated =
        action === 'escalate'
          ? await escalateConversation(conversationId)
          : await resumeConversation(conversationId);
      onUpdated(updated);
      toast({
        variant: 'success',
        title: action === 'escalate' ? 'Conversa assumida' : 'Conversa devolvida ao bot',
        description:
          action === 'escalate' ? 'A IA parou de responder.' : 'A IA voltou a responder.',
      });
    } catch (error) {
      const description =
        error instanceof ClientApiError && error.status === 404
          ? 'Conversa não encontrada.'
          : 'Falha ao executar a ação. Tente novamente.';
      toast({ variant: 'destructive', title: 'Não foi possível concluir', description });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'bot' ? (
        <Button
          type="button"
          size="cta"
          className="shadow-cta"
          onClick={() => void run('escalate')}
          disabled={pending}
        >
          {pending ? 'Assumindo…' : 'Assumir conversa'}
        </Button>
      ) : (
        <Button
          type="button"
          size="cta"
          variant="outline"
          onClick={() => void run('resume')}
          disabled={pending}
        >
          {pending ? 'Devolvendo…' : 'Devolver ao bot'}
        </Button>
      )}
      {excludedFromPipeline && (
        <span
          className="inline-flex h-[30px] items-center gap-1.5 rounded-[9px] border border-dashed border-muted-foreground/40 px-2.5 text-xs text-muted-foreground"
          title="Marcada como Não cliente no Pipeline — mova o card de volta para uma coluna do funil para religar a IA."
        >
          <BotOff className="h-3.5 w-3.5" aria-hidden="true" />
          Não cliente · IA desligada
        </span>
      )}
    </div>
  );
}
