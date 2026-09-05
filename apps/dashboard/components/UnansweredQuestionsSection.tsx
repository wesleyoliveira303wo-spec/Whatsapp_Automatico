import { useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { useUnansweredQuestions } from '@/hooks/useUnansweredQuestions';
import { formatContactDisplayNameParts, formatConversationTimestamp } from '@/lib/formatters';
import DisplayNameParts from '@/components/DisplayNameParts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface UnansweredQuestionsSectionProps {
  sessionName: string;
  /** Perguntas já cadastradas na FAQ — usadas só para marcar "já respondida". */
  answeredQuestions: string[];
  /** Leva a pergunta para o formulário "Nova pergunta" logo acima. */
  onAnswer: (questionText: string) => void;
}

/** Comparação tolerante a caixa/acento/pontuação, só para o selo "Já respondida". */
function normalizeForComparison(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Bloco B3 (issue #14) — "o caderninho das perguntas que a IA não soube
 * responder". Fecha o ciclo de aprendizado que a Fase 1, Bloco F1.4 (ADR
 * #95) deixou pela metade: o backend já marcava a lacuna
 * (`escalationReason = 'unknown_answer'`), mas nada no produto mostrava
 * isso, então o operador precisava adivinhar o que ensinar à IA.
 *
 * Vive DENTRO da aba FAQ de propósito (e não como item novo de navegação):
 * a ação que resolve uma lacuna é justamente cadastrar uma resposta na FAQ
 * daquela sessão, que está a dois centímetros de distância na mesma tela.
 *
 * Recolhida por padrão quando não há nenhuma lacuna, para não roubar espaço
 * do que o operador veio fazer.
 */
export default function UnansweredQuestionsSection({
  sessionName,
  answeredQuestions,
  onAnswer,
}: UnansweredQuestionsSectionProps): JSX.Element | null {
  const { questions, loading, errorMessage } = useUnansweredQuestions(sessionName);
  const [expanded, setExpanded] = useState(true);

  const answeredSet = useMemo(
    () => new Set(answeredQuestions.map(normalizeForComparison)),
    [answeredQuestions],
  );

  // Enquanto carrega, um esqueleto discreto — nunca um bloco vazio que
  // pisca. Erro aqui NÃO derruba a FAQ: é uma seção auxiliar.
  if (loading) {
    return <Skeleton className="mb-3.5 h-11 w-full rounded-lg" />;
  }

  if (errorMessage) {
    // Aviso discreto, SEM botão de tentar de novo: esta seção é auxiliar e
    // vive acima da FAQ, que tem o `ErrorState` dela. Dois blocos de erro
    // empilhados (e dois botões "Tentar de novo") confundiriam qual das duas
    // coisas falhou. A próxima visita à aba já refaz a busca.
    return (
      <p className="mb-3.5 text-[12px] text-muted-foreground" role="status">
        {errorMessage}
      </p>
    );
  }

  if (questions.length === 0) return null;

  const pendingCount = questions.filter(
    (question) =>
      !question.questionText || !answeredSet.has(normalizeForComparison(question.questionText)),
  ).length;

  return (
    <section
      className="mb-3.5 overflow-hidden rounded-lg border border-warning/40 bg-warning/5"
      aria-label="Perguntas que a IA não soube responder"
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
      >
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning-emphasis">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13.5px] font-semibold text-foreground">
            A IA não soube responder {questions.length}{' '}
            {questions.length === 1 ? 'pergunta' : 'perguntas'}
          </h2>
          <p className="text-[12px] text-muted-foreground">
            {pendingCount === 0
              ? 'Todas já têm resposta cadastrada na FAQ.'
              : `${pendingCount} ainda sem resposta cadastrada na FAQ.`}
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-warning/30 bg-card">
          {questions.map((question, index) => {
            const alreadyAnswered = Boolean(
              question.questionText && answeredSet.has(normalizeForComparison(question.questionText)),
            );
            const nameParts = formatContactDisplayNameParts(
              question.contactJid,
              question.contactName,
              question.savedContactName,
            );
            return (
              <div
                key={question.interactionId}
                data-testid={`unanswered-row-${question.interactionId}`}
                className={cn(
                  'flex items-start gap-2.5 px-3.5 py-[13px]',
                  index < questions.length - 1 && 'border-b border-border/70',
                  alreadyAnswered && 'opacity-60',
                )}
              >
                <div className="min-w-0 flex-1">
                  {question.questionText ? (
                    <p className="break-words text-[13px] font-medium text-foreground">
                      “{question.questionText}”
                    </p>
                  ) : (
                    // Interações anteriores ao F1.4 não guardam a mensagem de
                    // origem — dizer isso é melhor do que sumir com a linha.
                    <p className="text-[13px] italic text-muted-foreground">
                      Pergunta original não registrada
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                    <DisplayNameParts primary={nameParts.primary} secondary={nameParts.secondary} />
                    <span aria-hidden="true">·</span>
                    <span>{formatConversationTimestamp(question.occurredAt)}</span>
                    {alreadyAnswered && (
                      <Badge variant="outline" className="text-[11px]">
                        Já respondida
                      </Badge>
                    )}
                  </p>
                </div>
                {question.questionText && !alreadyAnswered && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => onAnswer(question.questionText as string)}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Ensinar a IA
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
