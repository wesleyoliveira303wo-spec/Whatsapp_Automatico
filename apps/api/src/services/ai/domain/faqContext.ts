import { AiFaqEntryInfo } from './repositories/AiFaqReader';

/**
 * Bloco de contexto anexado ao prompt quando a sessão tem FAQ estruturada
 * cadastrada — Cérebro da IA v3, Fase 2 (2026-08-25). Mesmo padrão de
 * `businessContext`/`offHoursContext`/`campaignContext`: um bloco anexo,
 * opcional, que só existe quando aplicável.
 *
 * Substitui o antigo botão "Cadastrar pergunta não respondida", que só
 * ANEXAVA texto cru ao blob de `AiBusinessProfile.content` — agora as FAQs
 * são um bloco PRÓPRIO, rotulado, nunca misturado ao texto livre do
 * "Conhecimento". Só entram aqui as FAQs ATIVAS (`AiFaqReader.
 * listActiveFaqEntries` já filtra); uma desativada some do prompt sem
 * precisar apagar o cadastro.
 */
export function buildFaqContext(faqEntries: AiFaqEntryInfo[]): string | undefined {
  if (faqEntries.length === 0) {
    return undefined;
  }

  const lines = faqEntries.map((entry) => {
    const category = entry.category ? ` (${entry.category})` : '';
    return `**P:** ${entry.question}${category}\n**R:** ${entry.answer}`;
  });

  return (
    '# Perguntas frequentes\n' +
    'Estas são respostas já aprovadas pela empresa para perguntas comuns. Quando a pergunta do ' +
    'cliente corresponder a uma destas, use a resposta abaixo como base — pode adaptar o tom, mas ' +
    'não mude o fato.\n\n' +
    lines.join('\n\n')
  );
}
