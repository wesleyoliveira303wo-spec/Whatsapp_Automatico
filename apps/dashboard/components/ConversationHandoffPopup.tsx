import { useState } from 'react';
import { Bot } from 'lucide-react';
import { escalateConversation, ClientApiError } from '@/lib/clientApi';
import type { ConversationSummary } from '@/lib/clientApi';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import ConversationSummarySection from './ConversationSummarySection';

interface ConversationHandoffPopupProps {
  conversation: ConversationSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (conversation: ConversationSummary) => void;
}

/**
 * Pop-up de handoff humano — Fase 1, Bloco F1.10 (estabilidade para beta).
 *
 * CONTEXTO: pedido original do fundador (registrado desde a auditoria
 * pré-beta) — quando a IA escala uma conversa (`escalatedAt` preenchido, ver
 * `AiReplyJobProcessor.flagNeedsHumanAttention`/`MessageIngestionService`
 * rate limit, Bloco F1.10) e o operador abre essa conversa, deve aparecer um
 * pop-up com o resumo da conversa e um botão "Assumir atendimento" — em vez
 * de o operador precisar notar o badge "Aguardando atendente" sozinho.
 *
 * DELIBERADAMENTE NÃO REIMPLEMENTA NADA que já existe:
 * - O RESUMO é 100% `ConversationSummarySection` (Redesign R5) embutido sem
 *   alteração — mesma exibição, mesmo botão "Gerar/Atualizar resumo", MESMA
 *   chamada `generateConversationSummary`. Se a conversa já tem
 *   `aiSummary`, ele aparece pronto (nenhuma chamada de IA é feita só por
 *   abrir o pop-up); se não tem, o operador vê "Nenhum resumo gerado ainda"
 *   e o botão para gerar — a geração continua 100% sob demanda (decisão já
 *   tomada no R5: nunca automática, custo previsível). Este pop-up não gera
 *   resumo sozinho ao abrir — evita duplicar/forçar uma chamada de IA que o
 *   operador pode nem precisar (ex.: já sabe do que se trata e só quer
 *   assumir direto).
 * - "Assumir atendimento" chama a MESMA `escalateConversation` (clientApi)
 *   já usada por `ConversationActions`/"Assumir conversa" — mesmo endpoint
 *   (`POST .../escalate`), mesma regra de negócio (`status: 'human'` +
 *   `assignedToUserId`, `escalatedAt` limpo pelo backend). A IA já para de
 *   responder no mesmo instante que "Assumir conversa" sempre parou —
 *   `shouldAutoRespond` exige `status === 'bot'` (Domain, sem nenhuma
 *   mudança nesta rodada). Botão POWER, Pipeline, tags e
 *   `excludedFromPipeline` inalterados — esta ação só toca `status`/
 *   `assignedToUserId`/`escalatedAt`, exatamente como "Assumir conversa" já
 *   fazia.
 *
 * QUANDO ABRE: decidido por quem renderiza (`ConversationDetailPanel`) — só
 * ao ABRIR a conversa (não a cada poll), e só uma vez por conversa (fechar
 * sem assumir não reabre sozinho enquanto a mesma conversa continuar
 * selecionada). Este componente é "burro" quanto a ISSO — só decide o que
 * mostrar DENTRO do pop-up, não quando abrir.
 */
export default function ConversationHandoffPopup({
  conversation,
  open,
  onOpenChange,
  onUpdated,
}: ConversationHandoffPopupProps): JSX.Element {
  const [pending, setPending] = useState(false);

  async function handleAssume(): Promise<void> {
    setPending(true);
    try {
      const updated = await escalateConversation(conversation.id);
      onUpdated(updated);
      onOpenChange(false);
      toast({
        variant: 'success',
        title: 'Atendimento assumido',
        description: 'A IA parou de responder esta conversa.',
      });
    } catch (error) {
      const description =
        error instanceof ClientApiError && error.status === 404
          ? 'Conversa não encontrada.'
          : 'Falha ao assumir o atendimento. Tente novamente.';
      toast({ variant: 'destructive', title: 'Não foi possível concluir', description });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/[.15] text-warning-emphasis">
              <Bot className="h-4 w-4" aria-hidden="true" />
            </span>
            <DialogTitle>A IA pediu atendimento humano</DialogTitle>
          </div>
          <DialogDescription>
            Esta conversa está aguardando um atendente. Revise o resumo abaixo antes de assumir.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <ConversationSummarySection conversation={conversation} onUpdated={onUpdated} />
        </div>

        <DialogFooter className="sm:flex-col sm:space-x-0">
          <Button
            type="button"
            size="cta"
            className="w-full shadow-cta"
            onClick={() => void handleAssume()}
            disabled={pending}
          >
            {pending ? 'Assumindo…' : 'Assumir atendimento'}
          </Button>
          <DialogClose asChild>
            <button
              type="button"
              className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
