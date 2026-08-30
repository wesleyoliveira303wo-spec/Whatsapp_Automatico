import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { saveConversationContact, ClientApiError } from '@/lib/clientApi';
import type { ConversationSummary } from '@/lib/clientApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';

interface SaveContactButtonProps {
  conversation: ConversationSummary;
  onUpdated: (conversation: ConversationSummary) => void;
  /**
   * Menu "⋮" da conversa (2026-08-29) — gatilho customizado (ex.: um item de
   * menu) para abrir o MESMO diálogo de "Salvar contato", em vez do ícone
   * padrão do painel de contexto. `undefined` = comportamento de sempre.
   */
  trigger?: React.ReactNode;
}

/**
 * Botão "Salvar contato" do painel de contexto da conversa (retrofit visual
 * 2026-08-18, pedido do fundador) — ícone sutil ao lado do telefone
 * (`ConversationContextPanel`). Salva (ou renomeia) o `Contact` desta pessoa
 * direto da conversa, sem passar pela aba Contatos: um clique + nome, e a
 * pessoa já aparece salva lá.
 *
 * Continua clicável mesmo depois de já salvo — reabrir o modal serve também
 * para RENOMEAR (a API sempre sobrescreve o nome, ação humana explícita, ver
 * `ContactResolver.saveName`), então não há um estado "concluído" que
 * desative o botão.
 *
 * Escondido (não apenas desabilitado) quando a conversa é `@lid` E ainda não
 * tem `contactId` — o WhatsApp não expõe telefone algum para esse endereço, e
 * um botão que sempre falha é pior do que nenhum botão (mesmo racional já
 * registrado neste projeto para o botão "Filtros" da Campanhas: preferir não
 * entregar um botão morto).
 */
export default function SaveContactButton({
  conversation,
  onUpdated,
  trigger,
}: SaveContactButtonProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(conversation.savedContactName ?? conversation.contactName ?? '');
  const [pending, setPending] = useState(false);

  const canDeriveContact =
    Boolean(conversation.contactId) || !conversation.contactJid.endsWith('@lid');
  if (!canDeriveContact) {
    return null;
  }

  function handleOpenChange(nextOpen: boolean): void {
    setOpen(nextOpen);
    if (nextOpen) {
      // CORREÇÃO 2026-08-20: reabrir para RENOMEAR deve partir do nome já
      // salvo (`savedContactName`), não sempre do apelido do WhatsApp — senão
      // reabrir o modal de um contato já nomeado silenciosamente sugeria
      // substituir o nome escolhido pelo apelido de exibição do contato.
      setName(conversation.savedContactName ?? conversation.contactName ?? '');
    }
  }

  async function handleConfirm(): Promise<void> {
    setPending(true);
    try {
      const trimmed = name.trim();
      const updated = await saveConversationContact(conversation.id, trimmed || undefined);
      onUpdated(updated);
      setOpen(false);
      toast({
        variant: 'success',
        title: 'Contato salvo',
        description: 'Já aparece na aba Contatos.',
      });
    } catch (error) {
      const description =
        error instanceof ClientApiError && error.status === 422
          ? 'Este WhatsApp usa número privado (LID) — não é possível salvar o contato automaticamente.'
          : 'Não foi possível salvar o contato agora. Tente novamente.';
      toast({ variant: 'destructive', title: 'Falha ao salvar contato', description });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? (
        <span onClick={() => handleOpenChange(true)}>{trigger}</span>
      ) : (
        <button
          type="button"
          aria-label="Salvar contato"
          title="Salvar contato"
          onClick={() => handleOpenChange(true)}
          className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Salvar contato</DialogTitle>
          <DialogDescription>
            Dê um nome para esta pessoa — ela já aparece na aba Contatos, com este telefone
            vinculado ao histórico desta conversa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="save-contact-name" className="text-sm font-medium text-foreground">
            Nome
          </label>
          <Input
            id="save-contact-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Maria Costa"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleConfirm();
            }}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" onClick={() => void handleConfirm()} disabled={pending}>
            {pending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
