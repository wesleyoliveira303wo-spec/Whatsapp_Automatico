import { useEffect, useState } from 'react';
import { createAiFaqEntry, ClientApiError } from '@/lib/clientApi';
import { toast } from '@/components/ui/use-toast';
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
} from '@/components/ui/dialog';

interface TeachAnswerDialogProps {
  sessionName: string;
  /** Pergunta do cliente que a IA não soube responder. `null` mantém fechado. */
  question: string | null;
  onClose: () => void;
  /** Chamado depois de cadastrar — quem chama recarrega a lista de lacunas. */
  onSaved?: () => void;
}

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite cadastrar respostas na FAQ.';
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
  }
  return 'Não foi possível salvar. Tente novamente.';
}

/**
 * Cadastro da resposta para uma pergunta que a IA não soube responder, SEM
 * sair da conversa (pedido do fundador, 2026-09-05).
 *
 * Antes, o operador via a lacuna só na aba FAQ do Cérebro da IA — longe do
 * contexto em que ela apareceu. Aqui a pergunta já vem preenchida com o que
 * o cliente escreveu, e só falta escrever a resposta.
 *
 * Grava pelo MESMO caminho da tela de FAQ (`createAiFaqEntry`) — nenhuma
 * rota nova, nenhuma segunda forma de gravar a mesma coisa.
 */
export default function TeachAnswerDialog({
  sessionName,
  question,
  onClose,
  onSaved,
}: TeachAnswerDialogProps): JSX.Element {
  const [questionText, setQuestionText] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reabrir para OUTRA mensagem tem que trocar o conteúdo do formulário —
  // sem isto, o diálogo manteria a pergunta da mensagem anterior.
  useEffect(() => {
    if (question === null) return;
    setQuestionText(question);
    setAnswer('');
    setErrorMessage(null);
  }, [question]);

  async function handleSave(): Promise<void> {
    const pergunta = questionText.trim();
    const resposta = answer.trim();
    if (!pergunta || !resposta) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      await createAiFaqEntry(sessionName, pergunta, resposta, null);
      toast({ title: 'Resposta cadastrada', description: 'A IA já pode usar a partir de agora.' });
      onSaved?.();
      onClose();
    } catch (error) {
      setErrorMessage(errorMessageFor(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={question !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ensinar a IA</DialogTitle>
          <DialogDescription>
            A IA não soube responder esta pergunta. Escreva a resposta certa e ela passa a usar nas
            próximas conversas deste WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label htmlFor="teachQuestion" className="mb-1 block text-[12px] text-muted-foreground">
              Pergunta do cliente
            </label>
            <Input
              id="teachQuestion"
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
              className="h-9 text-[13px]"
            />
          </div>
          <div>
            <label htmlFor="teachAnswer" className="mb-1 block text-[12px] text-muted-foreground">
              Resposta que a IA deve dar
            </label>
            <Textarea
              id="teachAnswer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={4}
              placeholder="Escreva como a IA deve responder…"
              className="rounded-[9px] border-border bg-panel text-[13px]"
            />
          </div>
          {errorMessage && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving || !questionText.trim() || !answer.trim()}
            onClick={() => void handleSave()}
          >
            {saving ? 'Salvando…' : 'Salvar resposta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
