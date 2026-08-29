import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import ChangePasswordForm from '@/components/ChangePasswordForm';

/**
 * Auditoria do Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fase 13) —
 * pedido explícito do fundador: "não quero mais um formulário enorme de
 * senha aparecendo permanentemente na página" — trocou o formulário fixo
 * por um botão que abre este modal. Mesma lógica de sempre
 * (`ChangePasswordForm`, endpoint `changePassword` inalterado) — só a
 * casca visual muda.
 */
export default function ChangePasswordModal({
  onSuccess,
}: {
  onSuccess: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Alterar senha
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              Informe sua senha atual e escolha uma nova.
            </DialogDescription>
          </DialogHeader>
          <ChangePasswordForm
            onSuccess={() => {
              setOpen(false);
              onSuccess();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
