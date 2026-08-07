/**
 * Cérebro da IA v2 — "Assistente Guiado" (ADR #71/#85). Funções PURAS de
 * modelo/geração de texto do quiz, deliberadamente separadas de qualquer
 * componente React — mesmo racional de `conversationsView.ts`/
 * `analyticsView.ts`: testável em `testEnvironment: 'node'`, sem jsdom.
 *
 * Contrato de saída: o quiz não introduz nenhum campo/tabela novo no
 * backend. Ele só PRODUZ uma string (`content`) no mesmo formato que o modo
 * texto livre já aceita — a mesma chamada `saveAiProfile(sessionName,
 * content)` de sempre. Zero mudança em `AiBusinessProfileService`,
 * `PromptBuilder` ou no schema Prisma (ADR #71: "zero mudança no motor de
 * IA").
 *
 * ~8 perguntas essenciais + seção "avançado" (decisão do fundador, ADR #71
 * pushback: nunca um formulário de 40 campos obrigatórios de uma vez —
 * risco de abandono). Todos os campos essenciais são opcionais no MODELO de
 * dados (o usuário pode pular uma pergunta no wizard) — só a ausência TOTAL
 * de conteúdo é tratada como "nada para gerar" por quem chama.
 */

export interface AiProfileQuizAnswers {
  // --- Essenciais (~8 perguntas) ---
  businessName?: string;
  whatYouSell?: string;
  pricing?: string;
  hours?: string;
  address?: string;
  paymentMethods?: string;
  differentiator?: string;
  tone?: string;
  // --- Avançado (opcional, seção separada no wizard) ---
  notes?: string;
}

interface QuizField {
  key: keyof AiProfileQuizAnswers;
  label: string;
}

/** Ordem e rótulos EXATOS usados tanto pelo wizard (uma pergunta por tela) quanto pela geração do texto final — fonte única, sem duplicar rótulo em dois lugares. */
export const ESSENTIAL_QUIZ_FIELDS: readonly QuizField[] = [
  { key: 'businessName', label: 'Nome' },
  { key: 'whatYouSell', label: 'O que vendemos' },
  { key: 'pricing', label: 'Preços' },
  { key: 'hours', label: 'Horário' },
  { key: 'address', label: 'Endereço' },
  { key: 'paymentMethods', label: 'Formas de pagamento' },
  { key: 'differentiator', label: 'Diferencial' },
  { key: 'tone', label: 'Tom de voz' },
];

export const ADVANCED_QUIZ_FIELDS: readonly QuizField[] = [{ key: 'notes', label: 'Observações' }];

export const ALL_QUIZ_FIELDS: readonly QuizField[] = [
  ...ESSENTIAL_QUIZ_FIELDS,
  ...ADVANCED_QUIZ_FIELDS,
];

/**
 * Gera o texto final (mesmo formato markdown de lista que o placeholder do
 * modo texto livre já sugere — `AiProfilePanel.tsx`, `PLACEHOLDER`) a partir
 * das respostas do quiz. Campos vazios/só-espaço são OMITIDOS (não gera
 * "- Preços: " em branco) — evita ruído no prompt e evita que a IA leia uma
 * instrução vazia como "sem preço definido".
 *
 * Devolve string vazia se NENHUM campo foi preenchido — quem chama decide o
 * que fazer (ex.: não habilitar "Salvar" com um texto vazio gerado à toa).
 */
export function generateProfileTextFromQuiz(answers: AiProfileQuizAnswers): string {
  const lines = ALL_QUIZ_FIELDS.map(({ key, label }) => {
    const value = answers[key]?.trim();
    return value ? `- ${label}: ${value}` : null;
  }).filter((line): line is string => line !== null);

  return lines.join('\n');
}

/** Quantas das perguntas ESSENCIAIS (não conta "avançado") já têm resposta — alimenta a barra de progresso do wizard. */
export function countAnsweredEssentialFields(answers: AiProfileQuizAnswers): number {
  return ESSENTIAL_QUIZ_FIELDS.filter(({ key }) => Boolean(answers[key]?.trim())).length;
}
