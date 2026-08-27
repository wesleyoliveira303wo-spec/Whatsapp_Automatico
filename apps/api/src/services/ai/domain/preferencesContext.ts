import { AiAutonomyLevel, AiPreferences } from './entities/AiPreferences';

const AUTONOMY_INSTRUCTION: Record<AiAutonomyLevel, string> = {
  conservative:
    'Nível de autonomia: CONSERVADOR. Prefira confirmar com um humano antes de fechar detalhes ' +
    'importantes (preço final, prazo, condições especiais) — na dúvida, encaminhe.',
  balanced:
    'Nível de autonomia: EQUILIBRADO. Conduza a conversa e feche o que estiver dentro do que o ' +
    'Cérebro da IA já autoriza; só encaminhe para um humano quando faltar informação real.',
  autonomous:
    'Nível de autonomia: AUTÔNOMO. Conduza a venda/negociação até o fim sozinho sempre que possível ' +
    '— só encaminhe para um humano em casos excepcionais, não por precaução.',
};

/**
 * Bloco de contexto com as preferências/limites operacionais da sessão —
 * Cérebro da IA v3, Fase 3 (2026-08-26). Mesmo padrão de `buildFaqContext`/
 * `buildCampaignContext`: um bloco anexo, opcional, que só existe quando a
 * sessão configurou pelo menos uma preferência real (nunca escreve sobre um
 * campo `null`/vazio — silêncio sobre um limite não configurado é o
 * comportamento correto, não "zero").
 *
 * `customHandoffMessage` NÃO entra aqui — é usado por `AiReplyJobProcessor`
 * diretamente (substitui a mensagem enviada ao cliente), não é uma instrução
 * de prompt.
 */
export function buildPreferencesContext(preferences: AiPreferences | null): string | undefined {
  if (!preferences) {
    return undefined;
  }

  const lines: string[] = [AUTONOMY_INSTRUCTION[preferences.autonomyLevel]];

  if (preferences.maxDiscountPercent != null) {
    lines.push(
      `Você pode oferecer, por conta própria, um desconto de até ${preferences.maxDiscountPercent}%. ` +
        'Nunca ofereça mais que isso sem confirmar com um humano.',
    );
  }

  const topics = preferences.topicsToAvoid?.trim();
  if (topics) {
    lines.push(`Assuntos para evitar ou redirecionar a um humano: ${topics}.`);
  }

  if (preferences.escalateAfterAttempts != null) {
    lines.push(
      `Se não conseguir resolver o pedido do cliente em até ${preferences.escalateAfterAttempts} ` +
        'tentativas, prefira encaminhar para um atendente humano em vez de insistir.',
    );
  }

  return `# Preferências de atendimento\n${lines.join('\n')}`;
}
