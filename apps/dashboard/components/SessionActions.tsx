import { useState } from 'react';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { connectSession, disconnectSession, removeSession, ClientApiError } from '@/lib/clientApi';
import type { WhatsAppSessionStatus } from '@/lib/clientApi';

interface SessionActionsProps {
  sessionName: string;
  status: WhatsAppSessionStatus;
}

/**
 * Ações do detalhe de sessão (M2, Fase 4 — UI-2): reconectar, desconectar,
 * remover. Cada botão chama a rota BFF correspondente (Fase 3) e não
 * atualiza estado local nenhum — a tela toda já está viva via SSE
 * (`useSessionDetail`, UI-3), então o próximo tick (~2s) reflete o efeito
 * de qualquer ação sozinho, sem essa tela precisar re-buscar nada por
 * conta própria.
 *
 * `remove` é destrutivo e irreversível (apaga registro + credenciais, ver
 * `WhatsAppSessionService.removeSession()`). Milestone 6, Bloco M6E-1:
 * confirmação migrada de `window.confirm` para `Dialog` (Radix, no padrão
 * visual da marca) — mesma régua de "ação destrutiva pede confirmação
 * explícita" (PRODUCT_PRINCIPLES.md §4.3), agora consistente com o resto
 * do produto. Em caso de sucesso, volta para a lista (a sessão removida não
 * existe mais para se ter um detalhe).
 */
export default function SessionActions({ sessionName, status }: SessionActionsProps): JSX.Element {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<'connect' | 'disconnect' | 'remove' | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /**
   * Fase 2 da Reestruturação de Configurações (2026-08-27): desconectar
   * executava em UM clique. Não é destrutivo (dá para reconectar), mas
   * DERRUBA O ATENDIMENTO — enquanto estiver fora, nenhuma mensagem daquele
   * número é recebida ou respondida. Por isso ganha confirmação, com peso
   * menor que "remover": texto sem "não pode ser desfeita" e botão não
   * destrutivo.
   */
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);

  async function run(action: 'connect' | 'disconnect'): Promise<void> {
    setPendingAction(action);
    setErrorMessage(null);
    try {
      if (action === 'connect') {
        await connectSession(sessionName);
      } else {
        await disconnectSession(sessionName);
      }
    } catch (error) {
      const message =
        error instanceof ClientApiError
          ? 'Falha ao executar a ação. Tente novamente.'
          : 'Falha de rede.';
      setErrorMessage(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function confirmRemove(): Promise<void> {
    setPendingAction('remove');
    setErrorMessage(null);
    try {
      await removeSession(sessionName);
      setConfirmOpen(false);
      await router.push('/');
    } catch (error) {
      const message =
        error instanceof ClientApiError
          ? 'Falha ao executar a ação. Tente novamente.'
          : 'Falha de rede.';
      setErrorMessage(message);
      setPendingAction(null);
    }
  }

  const busy = pendingAction !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {status === 'disconnected' && (
          <Button type="button" size="cta" onClick={() => void run('connect')} disabled={busy}>
            {pendingAction === 'connect' ? 'Conectando…' : 'Reconectar'}
          </Button>
        )}
        {status !== 'disconnected' && (
          <Button
            type="button"
            variant="outline"
            size="cta"
            onClick={() => setConfirmDisconnectOpen(true)}
            disabled={busy}
          >
            {pendingAction === 'disconnect' ? 'Desconectando…' : 'Desconectar'}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="cta"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
        >
          Remover sessão
        </Button>
      </div>
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

      <ConfirmDialog
        open={confirmDisconnectOpen}
        onOpenChange={setConfirmDisconnectOpen}
        title={`Desconectar ${sessionName}?`}
        description="Este WhatsApp para de receber e responder mensagens enquanto estiver desconectado. As conversas e o histórico são preservados, e você pode reconectar escaneando o QR Code de novo."
        confirmLabel="Desconectar"
        pendingLabel="Desconectando…"
        variant="default"
        onConfirm={() => run('disconnect')}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover a sessão &ldquo;{sessionName}&rdquo;?</DialogTitle>
            <DialogDescription>
              Essa ação apaga o registro da sessão e suas credenciais de conexão. Não pode ser
              desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pendingAction === 'remove'}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmRemove()}
              disabled={pendingAction === 'remove'}
            >
              {pendingAction === 'remove' ? 'Removendo…' : 'Remover definitivamente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
