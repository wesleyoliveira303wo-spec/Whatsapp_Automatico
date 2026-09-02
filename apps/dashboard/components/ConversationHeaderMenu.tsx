import { useState } from 'react';
import { useRouter } from 'next/router';
import {
  RefreshCw,
  MailOpen,
  Tag,
  UserPlus,
  Kanban,
  BotOff,
  Archive,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import ConversationTagPicker from './ConversationTagPicker';
import SaveContactButton from './SaveContactButton';
import { toast } from '@/components/ui/use-toast';
import {
  markConversationAsUnread,
  archiveConversation,
  deleteConversation,
  updateConversationStage,
  setConversationExcludedFromPipeline,
  type ConversationSummary,
  type ConversationStage,
} from '@/lib/clientApi';

interface ConversationHeaderMenuProps {
  conversation: ConversationSummary;
  sessionName: string;
  onUpdated: (conversation: ConversationSummary) => void;
  onRefresh: () => void;
}

const STAGE_OPTIONS: { value: ConversationStage; label: string }[] = [
  { value: 'new', label: 'Novo' },
  { value: 'contacted', label: 'Contatado' },
  { value: 'negotiating', label: 'Negociando' },
  { value: 'closed_won', label: 'Ganho' },
  { value: 'closed_lost', label: 'Perdido' },
];

/**
 * Menu "⋮" do cabeçalho da conversa (2026-08-29) — substitui o antigo botão
 * isolado de "Atualizar" (`RefreshCw`). Consolida ações que hoje já existem
 * espalhadas (`ConversationTagPicker`/`SaveContactButton` no painel lateral;
 * `updateConversationStage`/`setConversationExcludedFromPipeline` só
 * acessíveis arrastando o card no board de Pipeline) + 3 ações novas
 * (marcar como não lida, arquivar, excluir).
 *
 * "Ativar Não Cliente" reaproveita `setConversationExcludedFromPipeline` —
 * o ADR #96 (que removeu um toggle equivalente daqui) não se aplica mais:
 * o estado resultante (`excludedFromPipeline: true`) já é visível/reversível
 * na coluna "Não cliente" do board de Pipeline, este item só é mais um ponto
 * de entrada para o MESMO estado, nunca "esconde sem lugar pra achar depois".
 *
 * "Excluir" é DEFINITIVO (hard delete, sem lixeira) — exige digitar o nome
 * exibido do contato antes de habilitar o botão de confirmar, e SÓ o
 * usuário aperta esse botão (mesmo padrão de força de confirmação já usado
 * em `SessionActions.tsx` para "Remover sessão", aqui um degrau acima por
 * apagar histórico de mensagens de verdade).
 *
 * ACHADO REAL (2026-08-30) — todo item que abre um `Dialog` (etiquetas, não
 * cliente, arquivar, excluir) faz isso dentro de `setTimeout(fn, 0)`, nunca
 * direto no `onClick`. Sem o adiamento, o fechamento do `DropdownMenu`
 * (que devolve o foco ao próprio botão "Mais ações" ao selecionar um item) e
 * a abertura do `Dialog` (que prende o foco dentro de si) competem pelo
 * mesmo elemento no mesmo tick — no jsdom isso trava os testes num loop de
 * foco indefinido (`FocusScope` de um brigando com o do outro); mesmo em
 * produção é um padrão real e documentado do Radix para "Dialog disparado
 * de dentro de um DropdownMenuItem", não um hack só para teste passar.
 */
export default function ConversationHeaderMenu({
  conversation,
  sessionName,
  onUpdated,
  onRefresh,
}: ConversationHeaderMenuProps): JSX.Element {
  const router = useRouter();
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [notClientDialogOpen, setNotClientDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [pending, setPending] = useState(false);

  const contactDisplayName =
    conversation.savedContactName ?? conversation.contactName ?? conversation.contactJid;

  async function handleMarkUnread(): Promise<void> {
    setPending(true);
    try {
      const updated = await markConversationAsUnread(conversation.id);
      onUpdated(updated);
      toast({ variant: 'success', title: 'Marcada como não lida' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Não foi possível marcar como não lida',
        description: 'Tente novamente.',
      });
    } finally {
      setPending(false);
    }
  }

  async function handleUpdateStage(stage: ConversationStage): Promise<void> {
    setPending(true);
    try {
      const updated = await updateConversationStage(conversation.id, stage);
      onUpdated(updated);
      toast({ variant: 'success', title: 'Estágio atualizado' });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível mudar o estágio' });
    } finally {
      setPending(false);
    }
  }

  async function handleConfirmNotClient(): Promise<void> {
    setPending(true);
    try {
      const updated = await setConversationExcludedFromPipeline(conversation.id, true);
      onUpdated(updated);
      setNotClientDialogOpen(false);
      toast({ variant: 'success', title: 'Marcada como Não Cliente' });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível marcar como Não Cliente' });
    } finally {
      setPending(false);
    }
  }

  async function handleConfirmArchive(): Promise<void> {
    setPending(true);
    try {
      const updated = await archiveConversation(conversation.id, true);
      onUpdated(updated);
      setArchiveDialogOpen(false);
      toast({ variant: 'success', title: 'Conversa arquivada' });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível arquivar' });
    } finally {
      setPending(false);
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    setPending(true);
    try {
      await deleteConversation(conversation.id);
      toast({ variant: 'success', title: 'Conversa excluída' });
      await router.push(`/sessions/${encodeURIComponent(sessionName)}/conversations`);
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível excluir' });
      setPending(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Mais ações"
            disabled={pending}
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <button type="button" className="gap-2" onClick={onRefresh}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Atualizar
            </button>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button type="button" className="gap-2" onClick={() => void handleMarkUnread()}>
              <MailOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Marcar como não lida
            </button>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button
              type="button"
              className="gap-2"
              onClick={() => setTimeout(() => setTagDialogOpen(true), 0)}
            >
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              Adicionar Etiqueta
            </button>
          </DropdownMenuItem>
          <SaveContactButton
            conversation={conversation}
            onUpdated={onUpdated}
            trigger={
              <DropdownMenuItem asChild>
                <span className="flex w-full cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] outline-none transition-colors focus:bg-muted">
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Salvar Contato
                </span>
              </DropdownMenuItem>
            }
          />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger asChild>
              <button type="button" className="gap-2">
                <Kanban className="h-3.5 w-3.5" aria-hidden="true" />
                Mudar estágio da pipeline
              </button>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {STAGE_OPTIONS.map(({ value, label }) => (
                <DropdownMenuItem key={value} asChild>
                  <button type="button" onClick={() => void handleUpdateStage(value)}>
                    {label}
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem asChild>
            <button
              type="button"
              className="gap-2"
              onClick={() => setTimeout(() => setNotClientDialogOpen(true), 0)}
            >
              <BotOff className="h-3.5 w-3.5" aria-hidden="true" />
              Ativar Não Cliente
            </button>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button
              type="button"
              className="gap-2"
              onClick={() => setTimeout(() => setArchiveDialogOpen(true), 0)}
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              Arquivar
            </button>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button
              type="button"
              className="gap-2 text-destructive focus:bg-destructive/10"
              onClick={() => setTimeout(() => setDeleteDialogOpen(true), 0)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Excluir
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Etiquetas</DialogTitle>
            <DialogDescription>Adicione ou remova etiquetas desta conversa.</DialogDescription>
          </DialogHeader>
          <ConversationTagPicker
            sessionName={sessionName}
            conversationId={conversation.id}
            tags={conversation.tags}
            onChange={(tags) => onUpdated({ ...conversation, tags })}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={notClientDialogOpen} onOpenChange={setNotClientDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como Não Cliente?</DialogTitle>
            <DialogDescription>
              A IA para de responder automaticamente e a conversa é movida para a coluna &quot;Não
              cliente&quot; do Pipeline — nunca some, você acha ela lá quando quiser reverter.
            </DialogDescription>
          </DialogHeader>
          <Button type="button" disabled={pending} onClick={() => void handleConfirmNotClient()}>
            Confirmar
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arquivar esta conversa?</DialogTitle>
            <DialogDescription>
              Some da lista principal de Conversas, mas nada é apagado — pode ser encontrada de
              volta no filtro &quot;Arquivadas&quot; a qualquer momento.
            </DialogDescription>
          </DialogHeader>
          <Button type="button" disabled={pending} onClick={() => void handleConfirmArchive()}>
            Confirmar
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeleteConfirmText('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir esta conversa?</DialogTitle>
            <DialogDescription>
              Ação DEFINITIVA — apaga o histórico de mensagens de verdade, sem desfazer. Para
              confirmar, digite o nome exibido &quot;{contactDisplayName}&quot;.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="delete-confirm-text" className="sr-only">
            {`Digite "${contactDisplayName}" para confirmar`}
          </label>
          <input
            id="delete-confirm-text"
            value={deleteConfirmText}
            onChange={(event) => setDeleteConfirmText(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button
            type="button"
            variant="destructive"
            disabled={pending || deleteConfirmText !== contactDisplayName}
            onClick={() => void handleConfirmDelete()}
          >
            Excluir definitivamente
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
