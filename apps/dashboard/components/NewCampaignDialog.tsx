import { useState } from 'react';
import { Send, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  ClientApiError,
  createCampaign,
  type CampaignRecipientSummary,
  type CampaignSkipReason,
} from '@/lib/clientApi';

interface NewCampaignDialogProps {
  sessionName: string;
  /** Contatos selecionados na tela (checkboxes) — a campanha nasce SÓ com eles. */
  contactIds: string[];
  /** Chamado depois que o operador fecha a tela de resultado — usado para limpar a seleção. */
  onCreated: () => void;
}

const SKIP_REASON_LABELS: Record<CampaignSkipReason, string> = {
  opt_out: 'Pediram para não receber mais campanhas',
  active_human_conversation: 'Já estão sendo atendidos por um humano',
  recently_contacted: 'Contatados por outra campanha há menos de 7 dias',
};

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite criar campanhas.';
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
    if (error.status === 400) {
      const message = (error.body as { message?: string } | undefined)?.message;
      return message ?? 'Dados inválidos.';
    }
  }
  return 'Não foi possível criar a campanha. Tente novamente.';
}

/**
 * "Novo disparo" — Fase L, Bloco L3.
 *
 * **Este modal só CRIA a campanha e CALCULA quem receberia — não envia
 * nenhuma mensagem.** O envio de fato (fila com ritmo controlado + disjuntor
 * de segurança) é trabalho de um bloco futuro (ver `FASE_L_MOTOR_DE_LEADS.md`),
 * ainda não implementado — por isso a tela de resultado é explícita sobre
 * isso, para não sugerir ao operador que algo já foi enviado.
 *
 * Dois passos dentro do mesmo modal: formulário (nome + mensagem) → depois
 * de confirmar, a tela de RESULTADO ("63 de 100 vão receber, eis os
 * motivos dos outros"), sem navegação para outra página.
 */
export default function NewCampaignDialog({
  sessionName,
  contactIds,
  onCreated,
}: NewCampaignDialogProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CampaignRecipientSummary | null>(null);

  const canSubmit = name.trim().length > 0 && messageTemplate.trim().length > 0;

  function resetAndClose(): void {
    setOpen(false);
    setName('');
    setMessageTemplate('');
    setErrorMessage(null);
    const hadResult = result !== null;
    setResult(null);
    if (hadResult) {
      onCreated();
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await createCampaign({
        sessionName,
        name: name.trim(),
        messageTemplate: messageTemplate.trim(),
        contactIds,
      });
      setResult(response.summary);
    } catch (error) {
      setErrorMessage(errorMessageFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          resetAndClose();
        } else {
          setOpen(true);
        }
      }}
    >
      <Button
        type="button"
        size="cta"
        className="shrink-0"
        disabled={contactIds.length === 0}
        title={
          contactIds.length === 0
            ? 'Selecione ao menos um contato para criar uma campanha.'
            : undefined
        }
        onClick={() => setOpen(true)}
      >
        <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Novo disparo
        {contactIds.length > 0 && ` (${contactIds.length})`}
      </Button>

      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Campanha criada</DialogTitle>
              <DialogDescription>
                A campanha foi calculada — <strong>nenhuma mensagem foi enviada ainda</strong>. O
                envio automático em lote ainda está em desenvolvimento (ver painel &quot;Disparos /
                Campanhas&quot;).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 py-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-[13px] text-foreground">
                  <strong>{result.pending}</strong> de <strong>{result.total}</strong> contato(s)
                  {result.pending === 1 ? ' está' : ' estão'} elegíve
                  {result.pending === 1 ? 'l' : 'is'} para receber esta campanha.
                </p>
              </div>

              {result.skipped > 0 && (
                <div className="rounded-lg border border-border bg-card px-3.5 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p className="text-[13px] font-medium text-foreground">
                      {result.skipped} contato(s) suprimido(s)
                    </p>
                  </div>
                  <ul className="space-y-1 pl-6 text-[12.5px] text-muted-foreground">
                    {(Object.keys(result.skipReasons) as CampaignSkipReason[]).map((reason) => (
                      <li key={reason} className="list-disc">
                        {SKIP_REASON_LABELS[reason]}:{' '}
                        <strong className="text-foreground">{result.skipReasons[reason]}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" onClick={resetAndClose}>
                Concluir
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Novo disparo</DialogTitle>
              <DialogDescription>
                Cria uma campanha para os <strong>{contactIds.length}</strong> contato(s)
                selecionado(s). Este passo só calcula quem receberia — o envio automático ainda não
                existe (ver painel &quot;Disparos / Campanhas&quot;).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="new-campaign-name"
                  className="text-sm font-medium text-foreground"
                >
                  Nome da campanha
                </label>
                <Input
                  id="new-campaign-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: Promoção de agosto"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="new-campaign-message"
                  className="text-sm font-medium text-foreground"
                >
                  Mensagem
                </label>
                <Textarea
                  id="new-campaign-message"
                  value={messageTemplate}
                  onChange={(event) => setMessageTemplate(event.target.value)}
                  placeholder="Ex.: Olá {{nome}}, temos uma novidade para você!"
                  rows={4}
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
                {submitting ? 'Calculando…' : 'Calcular destinatários'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
