import { useState, useEffect } from 'react';
import { UserPlus, Plus } from 'lucide-react';

import { ClientApiError, type Contact } from '@/lib/clientApi';
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

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite gerenciar contatos.';
    if (error.status === 409) return 'Já existe outro contato com esse telefone.';
    if (error.status === 400) {
      const message = (error.body as { message?: string } | undefined)?.message;
      return message ?? 'Telefone inválido.';
    }
    if (error.status === 404) return 'Este contato não existe mais.';
  }
  return 'Não foi possível salvar. Tente novamente.';
}

interface ContactFormDialogProps {
  /** Ausente = criar; presente = editar este contato. */
  contact?: Contact;
  onSubmit: (input: { name?: string; phone: string }) => Promise<{ wasCreated?: boolean } | void>;
  /** Controla o modal externamente quando `contact` é passado (edição, disparada por um botão de linha). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Estilo do gatilho de criação (retrofit 2026-08-18, réplica de imagem do
   * fundador) — `'toolbar'` (padrão) é o botão de sempre, ao lado da busca.
   * `'quick-action'` é a linha em pílula usada dentro do card "Ações
   * rápidas" de Contatos (ícone `+`, rótulo "Novo contato", mesma largura
   * das outras ações do card).
   */
  triggerVariant?: 'toolbar' | 'quick-action';
}

/**
 * Formulário de contato (criar/editar) — Reorganização Contatos/Campanhas
 * (2026-08-17): a tela de Contatos vira um CRUD de verdade. Mesmo `Dialog`
 * já usado no resto do produto (`SessionActions`, `AiProfileFaqDialog`).
 *
 * Modo CRIAR: renderiza seu próprio botão-gatilho ("Adicionar contato").
 * Modo EDITAR: sem gatilho próprio — controlado via `open`/`onOpenChange`
 * pelo botão "Editar" de cada linha da tabela.
 */
export default function ContactFormDialog({
  contact,
  onSubmit,
  open: controlledOpen,
  onOpenChange,
  triggerVariant = 'toolbar',
}: ContactFormDialogProps): JSX.Element {
  const isEdit = Boolean(contact);
  // "Controlado" = o pai passou `open`/`onOpenChange` (caso do botão "Editar"
  // por linha, disparado de fora) — nesse caso este componente NUNCA
  // renderiza seu próprio botão-gatilho, mesmo sem `contact` (evita dois
  // botões "Adicionar contato" quando `editingContact` ainda é `null`).
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [name, setName] = useState(contact?.name ?? '');
  const [phone, setPhone] = useState(contact?.phoneE164 ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reabrir para editar um contato DIFERENTE precisa repovoar os campos.
  useEffect(() => {
    if (open) {
      setName(contact?.name ?? '');
      setPhone(contact?.phoneE164 ?? '');
      setErrorMessage(null);
    }
  }, [open, contact]);

  const canSubmit = phone.trim().length > 0;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit({ name: name.trim() || undefined, phone: phone.trim() });
      setOpen(false);
    } catch (error) {
      setErrorMessage(errorMessageFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled &&
        (triggerVariant === 'quick-action' ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-left text-[13px] font-medium text-primary transition-colors hover:bg-primary/15"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo contato
          </button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="cta"
            className="shrink-0"
            onClick={() => setOpen(true)}
          >
            <UserPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Adicionar contato
          </Button>
        ))}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar contato' : 'Adicionar contato'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Altere o nome e/ou o telefone deste contato.'
              : 'Se o telefone já existir na base, o contato existente é reaproveitado (o nome já cadastrado nunca é sobrescrito).'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="contact-name" className="text-sm font-medium text-foreground">
              Nome
            </label>
            <Input
              id="contact-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Maria Souza"
              autoFocus={!isEdit}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-phone" className="text-sm font-medium text-foreground">
              Telefone
            </label>
            <Input
              id="contact-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Ex.: (65) 98888-7777"
            />
          </div>
          {errorMessage && <p className="text-[12.5px] text-destructive">{errorMessage}</p>}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={submitting}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || submitting}>
            {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
