import { useState, type ReactNode } from 'react';
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

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pergunta direta, com o ALVO no título ("Suspender maria@empresa.com?") — nunca genérica. */
  title: ReactNode;
  /** O que vai acontecer + como reverter (ou o aviso de que não dá). */
  description: ReactNode;
  /** Rótulo específico da ação ("Suspender acesso"), nunca "Confirmar"/"OK". */
  confirmLabel: string;
  /** Rótulo enquanto a ação roda ("Suspendendo…"). */
  pendingLabel?: string;
  /** `destructive` para o que não se desfaz ou derruba acesso; `default` para o resto. */
  variant?: 'destructive' | 'default';
  onConfirm: () => Promise<void> | void;
}

/**
 * Confirmação de ação administrativa — Reestruturação de Configurações,
 * Fase 2 (2026-08-27).
 *
 * Extraído do diálogo que `SessionActions` já usava para "Remover sessão"
 * (o único do produto que tinha confirmação): mesma casca, mesmos
 * primitivos, mesmo comportamento — só generalizado para os outros pontos
 * que a auditoria encontrou executando em UM clique (suspender usuário,
 * redefinir senha de terceiro, desconectar WhatsApp, alterar cargo).
 *
 * Deliberadamente NÃO é um confirm para tudo: a régua é o RISCO (ver
 * `CONFIGURACOES_REDESIGN_PLAN.md` §11) — ações reversíveis e de baixo
 * impacto (reativar usuário, reconectar) seguem em um clique, como antes.
 * Confirmar o inofensivo treina a pessoa a clicar "sim" sem ler, e aí a
 * confirmação que importa também passa batida.
 *
 * O botão de confirmar carrega o rótulo da AÇÃO ("Suspender acesso"), não
 * um "Confirmar" genérico — Web Interface Guidelines: rótulos específicos.
 * `pending` desabilita os dois botões enquanto a chamada corre, para não
 * disparar a mesma mutação duas vezes.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  variant = 'destructive',
  onConfirm,
}: ConfirmDialogProps): JSX.Element {
  const [pending, setPending] = useState(false);

  async function handleConfirm(): Promise<void> {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={variant}
            onClick={() => void handleConfirm()}
            disabled={pending}
          >
            {pending ? (pendingLabel ?? 'Aplicando…') : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
