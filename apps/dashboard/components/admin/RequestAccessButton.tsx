import { useState } from 'react';
import { useRouter } from 'next/router';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PlatformApiError, requestSupportAccess } from '@/lib/platformClientApi';

/**
 * "Pedir acesso" a um tenant — Painel `/admin`, Fase 5 (§9.1 passo 1). Abre um
 * diálogo com o MOTIVO obrigatório (é o que o cliente lê antes de decidir e o
 * que fica gravado). Ao enviar, cria o pedido `pending` e leva para a seção
 * Suporte.
 */
export default function RequestAccessButton({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}): JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (reason.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await requestSupportAccess(tenantId, reason.trim());
      setOpen(false);
      setReason('');
      await router.push('/admin/support');
    } catch (err) {
      if (err instanceof PlatformApiError && err.status === 409) {
        setError('Já há um pedido de acesso aberto para este cliente.');
      } else {
        setError('Não foi possível enviar o pedido.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Pedir acesso
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir acesso à conta de {tenantName}</DialogTitle>
            <DialogDescription>
              O cliente (dono ou administrador) verá este motivo e decide se autoriza. Autorizado,
              o acesso dura 2 horas e pode ser encerrado por ele a qualquer momento.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex.: verificar por que a IA parou de responder"
            aria-label="Motivo do pedido de acesso"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={busy || reason.trim().length === 0}
              onClick={() => void submit()}
            >
              {busy ? 'Enviando…' : 'Enviar pedido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
