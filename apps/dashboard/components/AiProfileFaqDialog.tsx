import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface AiProfileFaqDialogProps {
  /** Chamado ao confirmar, com a pergunta e a resposta já com `trim()` aplicado pelo chamador (`appendFaqEntry` faz o trim de qualquer forma, mas a validação de "não vazio" é feita aqui). */
  onConfirm: (question: string, answer: string) => void;
}

/**
 * Cérebro da IA — "Cadastrar pergunta não respondida" (ADR #71 item (a) /
 * ADR #86). Botão + modal (`Dialog`, já usado no projeto — ex.:
 * `SessionActions`) para o dono do negócio digitar uma pergunta que um
 * cliente fez e a IA não soube responder, junto com a resposta correta.
 *
 * Este componente NÃO fala com a API — só coleta pergunta/resposta e
 * devolve via `onConfirm` (mesmo racional de separar coleta de efeito
 * colateral já usado em `AiProfileQuizWizard`/`PipelineBoard`). Quem decide
 * o que fazer com o par (anexar ao texto, no caso) é `AiProfilePanel`.
 *
 * Fecha e limpa os campos sozinho após confirmar — reabrir o modal depois
 * começa em branco, não mantém rascunho entre usos.
 */
export default function AiProfileFaqDialog({ onConfirm }: AiProfileFaqDialogProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const canConfirm = question.trim().length > 0 && answer.trim().length > 0;

  function handleConfirm(): void {
    if (!canConfirm) return;
    onConfirm(question, answer);
    setQuestion('');
    setAnswer('');
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuestion('');
          setAnswer('');
        }
      }}
    >
      <Button
        type="button"
        variant="outline"
        className="h-[34px] gap-[7px] rounded-[9px] px-[13px] text-[12.5px] font-medium"
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Cadastrar pergunta não respondida
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar pergunta não respondida</DialogTitle>
          <DialogDescription>
            Um cliente perguntou algo e a IA não soube responder? Registre aqui — a pergunta e a
            resposta serão adicionadas ao final do texto do Cérebro da IA, para que ela saiba
            responder da próxima vez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label
              htmlFor="ai-profile-faq-question"
              className="text-sm font-medium text-foreground"
            >
              Pergunta do cliente
            </label>
            <Textarea
              id="ai-profile-faq-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ex.: Vocês entregam aos domingos?"
              rows={2}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ai-profile-faq-answer" className="text-sm font-medium text-foreground">
              Resposta correta
            </label>
            <Textarea
              id="ai-profile-faq-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Ex.: Não, funcionamos de terça a sábado, das 9h às 18h."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            Adicionar ao Cérebro da IA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
