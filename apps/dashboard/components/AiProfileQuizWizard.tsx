import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ESSENTIAL_QUIZ_FIELDS,
  ADVANCED_QUIZ_FIELDS,
  generateProfileTextFromQuiz,
  countAnsweredEssentialFields,
  type AiProfileQuizAnswers,
} from '@/lib/aiProfileQuiz';

/** Uma dica curta por campo, para orientar o que escrever — mesmo espírito do `PLACEHOLDER` do modo texto livre, mas uma frase por vez em vez de um exemplo inteiro de uma tacada. */
const FIELD_HINTS: Record<string, string> = {
  businessName: 'Ex.: Salão da Maria',
  whatYouSell: 'Ex.: cortes, escova, coloração e manicure',
  pricing: 'Ex.: corte R$ 50, escova R$ 40, coloração a partir de R$ 120',
  hours: 'Ex.: terça a sábado, das 9h às 18h',
  address: 'Ex.: Rua das Flores, 123',
  paymentMethods: 'Ex.: dinheiro, Pix e cartão',
  differentiator: 'Ex.: atendimento rápido, produtos importados, 15 anos de experiência',
  tone: 'Ex.: informal e simpático, ou formal e objetivo',
  notes: 'Ex.: agendamento só por WhatsApp; não atendemos aos domingos',
};

interface AiProfileQuizWizardProps {
  /** Respostas iniciais — vazio na primeira vez que o quiz é aberto (o modo guiado "esquece" a estrutura assim que o texto é editado manualmente, ver `AiProfilePanel`). */
  initialAnswers?: AiProfileQuizAnswers;
  /** Chamado a cada passo concluído (Próximo/Voltar) com as respostas atuais — permite ao painel pai manter um rascunho vivo, se quiser. */
  onAnswersChange?: (answers: AiProfileQuizAnswers) => void;
  /** Chamado quando o usuário confirma a geração do texto final (último passo). */
  onGenerate: (text: string) => void;
  disabled?: boolean;
}

const STEPS = [...ESSENTIAL_QUIZ_FIELDS, ...ADVANCED_QUIZ_FIELDS];

/**
 * Cérebro da IA v2 — "Assistente Guiado" (ADR #71/#85). Wizard passo a
 * passo (uma pergunta por tela, estilo Typeform — decisão do fundador,
 * preferida a um formulário de uma tela só ou a abas dentro do próprio
 * formulário): reduz a sensação de "formulário longo", mesmo racional da
 * decisão original de manter o quiz enxuto (~8 perguntas, nunca 40 campos
 * de uma vez). A última posição é a seção "Avançado" (`ADVANCED_QUIZ_FIELDS`),
 * visualmente distinta (rótulo "Opcional") mas navegada da mesma forma.
 *
 * Este componente NÃO fala com a API — só coleta respostas e devolve o
 * texto gerado (`generateProfileTextFromQuiz`) via `onGenerate`. Quem
 * decide o que fazer com esse texto (mostrar preview, salvar, etc.) é
 * `AiProfilePanel`, mesmo racional de separar coleta de dados de efeito
 * colateral já seguido no resto do projeto (ex.: `PipelineBoard` recebe
 * `usePipelineConversations` de fora).
 *
 * Reskin 2026-08-07 (Design System, tela Cérebro da IA) — cartão próprio
 * (fundo+borda, mesma anatomia do card de "Texto livre" em
 * `AiProfilePanel`), barra de progresso mais fina (6px) e botões
 * Voltar/Próxima nos estilos exatos do mockup (outline/primário, sem
 * ícones — o mockup não usa seta nos botões de navegação do quiz). O passo
 * "Avançado (opcional)" (9º passo, além dos 8 do mockup) é uma extensão
 * real do produto que o mockup não modela — mantido com rótulo distinto
 * para não confundir com "pergunta 9 de 8".
 */
export default function AiProfileQuizWizard({
  initialAnswers,
  onAnswersChange,
  onGenerate,
  disabled = false,
}: AiProfileQuizWizardProps): JSX.Element {
  const [answers, setAnswers] = useState<AiProfileQuizAnswers>(initialAnswers ?? {});
  const [stepIndex, setStepIndex] = useState(0);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const isAdvancedStep = ADVANCED_QUIZ_FIELDS.some((field) => field.key === step.key);
  const answeredCount = useMemo(() => countAnsweredEssentialFields(answers), [answers]);

  function updateAnswer(value: string): void {
    const next = { ...answers, [step.key]: value };
    setAnswers(next);
    onAnswersChange?.(next);
  }

  function goNext(): void {
    if (isLastStep) {
      onGenerate(generateProfileTextFromQuiz(answers));
      return;
    }
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  }

  function goBack(): void {
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  return (
    <div className="rounded-lg border border-border bg-card p-[18px]">
      <div className="mb-[18px] flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-foreground">
          {isAdvancedStep
            ? 'Avançado (opcional)'
            : `Pergunta ${stepIndex + 1} de ${ESSENTIAL_QUIZ_FIELDS.length}`}
        </span>
        <span className="text-xs text-muted-foreground">
          {answeredCount}/{ESSENTIAL_QUIZ_FIELDS.length} respondidas
        </span>
      </div>
      <div
        className="mb-[18px] h-[6px] w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={answeredCount}
        aria-valuemin={0}
        aria-valuemax={ESSENTIAL_QUIZ_FIELDS.length}
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(answeredCount / ESSENTIAL_QUIZ_FIELDS.length) * 100}%` }}
        />
      </div>

      <label
        htmlFor="ai-profile-quiz-field"
        className="mb-3 block text-[15px] font-semibold tracking-tight text-foreground"
      >
        {step.label}
      </label>
      <Textarea
        id="ai-profile-quiz-field"
        value={answers[step.key] ?? ''}
        onChange={(event) => updateAnswer(event.target.value)}
        placeholder={FIELD_HINTS[step.key]}
        rows={3}
        autoFocus
        disabled={disabled}
        className="rounded-[10px] border-border bg-panel text-[13.5px] leading-[1.55]"
      />

      <div className="mt-3.5 flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          className="h-[34px] rounded-[9px] px-[13px] text-[12.5px] font-medium"
          onClick={goBack}
          disabled={stepIndex === 0 || disabled}
        >
          Voltar
        </Button>
        <Button type="button" size="cta" onClick={goNext} disabled={disabled}>
          {isLastStep ? 'Gerar texto' : 'Próxima'}
        </Button>
      </div>
    </div>
  );
}
