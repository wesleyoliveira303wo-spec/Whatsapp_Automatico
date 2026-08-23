import { Message } from '../../conversations/domain/entities/Message';
import { PromptVersion } from '../domain/PromptVersion';
import { AiGenerationRequest, AiMediaContentPart } from '../domain/providers/AiProvider';

/**
 * Rótulo factual em português para cada tipo de mídia (Fase 1, Bloco F1.1,
 * ADR #90) — usado só para o HISTÓRICO que a IA lê, nunca exibido ao
 * cliente (a Dashboard usa seus próprios rótulos, `MessageBubble.tsx`).
 */
const MEDIA_CONTENT_TYPE_LABEL: Record<Exclude<Message['contentType'], 'text'>, string> = {
  image: 'imagem',
  audio: 'áudio',
  video: 'vídeo',
  document: 'documento',
  sticker: 'figurinha',
};

/**
 * Descreve o conteúdo de UMA mensagem para o histórico enviado à IA (Fase 1,
 * Bloco F1.1, ADR #90). Nenhum `AiProvider` configurado neste projeto é
 * multimodal (nem `ClaudeAiProvider` nem `GeminiAiProvider` enviam o binário
 * da mídia ao modelo) — sem esta função, uma mensagem de mídia sem legenda
 * viraria um turno de usuário com `content: ''`, invisível para a IA (ela
 * nunca saberia que o cliente enviou algo).
 *
 * A descrição é estritamente FACTUAL ("o cliente enviou uma imagem") —
 * NUNCA inventa o que a mídia contém (não é possível saber sem visão
 * computacional, que este projeto não tem). Quando há legenda, ela é
 * preservada e anexada — é a única informação real disponível sobre o
 * conteúdo. O prompt base (`PromptVersion`) já instrui a IA a nunca inventar
 * informação; esta função só garante que o FATO "houve um anexo" chega até
 * o modelo, para ele reagir com honestidade (ex.: "recebi seu comprovante,
 * mas não consigo abrir arquivos — pode descrever o que precisa?") em vez de
 * ignorar a mensagem ou fingir que era texto vazio.
 */
/**
 * Exportada (Redesign 2026-08-05, R5) para reuso por `SummaryPromptBuilder`
 * — mesmo racional factual documentado abaixo, sem duplicar a função (regra
 * permanente §17.2 do projeto: "Código duplicado é proibição").
 */
export function describeMessageContent(message: Message): string {
  if (message.contentType === 'text' || !message.media) {
    return message.content;
  }
  const label = MEDIA_CONTENT_TYPE_LABEL[message.contentType];
  const caption = message.content.trim();

  // CORREÇÃO 2026-08-21 (bug medido em produção): até aqui o texto era fixo
  // em "O cliente enviou", ignorando `direction`. Numa conversa nascida de
  // campanha com anexo, a mensagem de abertura é NOSSA e é uma imagem — a IA
  // lia o PRÓPRIO turno dela (`role: 'assistant'`) dizendo "[O cliente enviou
  // um(a) imagem com a legenda: <o pitch de abertura>]". Resultado real: ela
  // abria a conversa perguntando sobre uma imagem que o cliente nunca mandou,
  // o cliente respondia "Não mandei imagem!", e a conversa morria em duas
  // trocas de desculpa — sem a IA nunca perceber que já tinha se apresentado.
  // Mídia enviada por NÓS (operador, IA ou campanha) precisa ser descrita na
  // primeira pessoa, para o histórico continuar coerente.
  if (message.direction === 'outbound') {
    return caption
      ? `[Você enviou um(a) ${label} com a legenda: "${caption}"]`
      : `[Você enviou um(a) ${label}, sem legenda]`;
  }

  return caption
    ? `[O cliente enviou um(a) ${label} com a legenda: "${caption}"]`
    : `[O cliente enviou um(a) ${label}, sem legenda]`;
}

/**
 * Transforma o histórico de uma conversa (`Message[]`, de
 * `services/conversations/domain`) + a `PromptVersion` ativa num
 * `AiGenerationRequest` pronto para qualquer `AiProvider` — Milestone 3,
 * Bloco 3a (ver `MILESTONE_003_AI_AUTORESPONDER.md` §2.3, tabela de
 * responsabilidades).
 *
 * Depende do tipo `Message` (dado puro de Domain de outro bounded context,
 * sem nenhum acoplamento a Prisma/Repository) para saber como mapear
 * `direction` para o `role` que a API de geração espera
 * (`'inbound' -> 'user'`, `'outbound' -> 'assistant'`) — não depende de
 * `MessageRepository`, `Prisma`, `BullMQ`, `Worker`, WhatsApp ou Baileys:
 * quem busca o histórico e decide QUANTAS mensagens passar é
 * responsabilidade de quem chama `build()` (`ConversationAiService`, e no
 * futuro o worker do Bloco 4), não deste componente.
 *
 * Classe (não função pura solta), para acompanhar o estilo já usado pelos
 * demais componentes de Application deste projeto (`SessionManager`,
 * `WhatsAppSessionService`, `MessageIngestionService`) — mesmo sem estado
 * próprio, mantém a mesma convenção de camada em vez de misturar estilos.
 *
 * BASE DE CONHECIMENTO (Nível 1): `build()` aceita um `businessContext`
 * OPCIONAL — o texto livre que o dono do negócio configurou (ver
 * `AiBusinessProfile`). Quando presente e não vazio, é ANEXADO ao
 * `systemPrompt` base num bloco rotulado, nunca o substituindo: as regras de
 * segurança do prompt base (não inventar preço/prazo, escalar quando não
 * souber) precisam continuar valendo — o contexto do negócio adiciona FATOS
 * por cima, não afrouxa as regras. Parâmetro opcional de propósito: sem perfil
 * configurado (ou perfil vazio), o comportamento é exatamente o de antes
 * (compatibilidade total), e nenhum chamador antigo precisa mudar.
 *
 * INTERPRETAÇÃO DE MÍDIA (Fase 1, Bloco F1.2): `build()` aceita um 4º
 * parâmetro OPCIONAL, `mediaByMessageId` — um mapa de `Message.id` para o
 * binário já baixado e codificado em base64 (`AiMediaContentPart`). Este
 * componente continua sem saber COMO um binário é obtido (baixar da URL do
 * WhatsApp, decifrar a `mediaKey` — tudo isso é responsabilidade de
 * `ConversationAiService`/`MediaDownloader`, em `services/whatsapp`); só
 * decide ONDE anexar o binário já pronto: na mensagem cujo `id` aparece no
 * mapa. Deliberadamente um `Map` (não um campo em `Message`): o Domain
 * `Message` não deveria carregar um binário de mídia — isso pertubaria toda
 * leitura de histórico que não precisa dele (ex.: a UI, que só usa a
 * referência). Ausência do parâmetro (ou mapa vazio) preserva 100% do
 * comportamento anterior — nenhuma mensagem recebe `media`, e o fallback
 * textual de `describeMessageContent` continua sendo a única informação
 * sobre mídias sem binário anexado (mídias antigas, ou quando o download
 * falhou).
 */
export class PromptBuilder {
  /**
   * F1.8 (2026-08-01): novo 5º parâmetro `offHoursContext` — texto de aviso de
   * horário de atendimento já formatado por `getOffHoursContext()` (domain
   * `workingHours.ts`). Quando presente, é injetado APÓS o bloco de
   * "Informações da empresa" (se houver), em seção própria. `undefined` ou
   * string vazia = sem aviso de horário (comportamento anterior inalterado).
   */
  /**
   * Fase L, Bloco L6 (2026-08-17): novo 6º parâmetro `campaignContext` — já
   * formatado por `buildCampaignContext()` (domain `campaignContext.ts`),
   * presente só quando a conversa nasceu de uma campanha de disparo.
   * Corrige a premissa do `v2` (conversa sempre iniciada pelo cliente) sem
   * reescrever nenhum prompt existente. `undefined` = comportamento
   * inalterado (conversa comum).
   */
  build(
    messages: Message[],
    promptVersion: PromptVersion,
    businessContext?: string,
    mediaByMessageId?: Map<string, AiMediaContentPart>,
    offHoursContext?: string,
    campaignContext?: string,
  ): AiGenerationRequest {
    return {
      systemPrompt: this.composeSystemPrompt(
        promptVersion.systemPrompt,
        businessContext,
        offHoursContext,
        campaignContext,
        promptVersion.closingDirective,
      ),
      messages: messages.map((message) => ({
        role: message.direction === 'inbound' ? 'user' : 'assistant',
        content: describeMessageContent(message),
        media: mediaByMessageId?.get(message.id),
      })),
    };
  }

  /**
   * Anexa contextos opcionais ao prompt base:
   *
   * 1. `businessContext` — texto livre do "Cérebro da IA" (pré-existente).
   *    `trim()` para ignorar texto só com espaços. O rótulo orienta o modelo
   *    a tratar o bloco como fonte de verdade sobre a empresa.
   *
   * 2. `offHoursContext` — aviso de horário de atendimento (F1.8). Injetado
   *    depois do `businessContext` quando presente. Nunca substitui as regras
   *    de segurança do prompt base; só adiciona contexto situacional.
   *
   * 3. `closingDirective` (2026-08-20, 3ª rodada) — SEMPRE por último, depois
   *    de TODOS os blocos de contexto. Motivo medido: o Cérebro da IA é texto
   *    livre escrito pelo cliente e pode ser enorme (10.395 caracteres na
   *    instalação onde o problema apareceu, contra 7.285 do prompt base) — e
   *    costuma conter instruções de CONDUTA ("não empurro o serviço nas
   *    primeiras mensagens"). Tudo que o prompt base diz sobre formato/postura
   *    ficava soterrado sob esse bloco e era sistematicamente derrotado por
   *    ele. A diretiva final é curta e mecânica de propósito: recupera a
   *    última palavra sobre formato e condução SEM enfraquecer as regras de
   *    segurança, que continuam no prompt base.
   */
  private composeSystemPrompt(
    basePrompt: string,
    businessContext?: string,
    offHoursContext?: string,
    campaignContext?: string,
    closingDirective?: string,
  ): string {
    let prompt = basePrompt;

    const trimmedBusiness = businessContext?.trim();
    if (trimmedBusiness) {
      prompt +=
        '\n\nBaseie suas respostas nas informações da empresa abaixo. ' +
        'Se a informação necessária não estiver nelas, não invente — siga a regra de encaminhar para um atendente humano.\n\n' +
        `# Informações da empresa\n${trimmedBusiness}`;
    }

    const trimmedOffHours = offHoursContext?.trim();
    if (trimmedOffHours) {
      prompt += `\n\n${trimmedOffHours}`;
    }

    // Fase L, Bloco L6 — depois dos demais blocos: o mais importante é a
    // empresa/horário; a origem de campanha é um detalhe de enquadramento.
    const trimmedCampaign = campaignContext?.trim();
    if (trimmedCampaign) {
      prompt += `\n\n${trimmedCampaign}`;
    }

    // Sempre o ÚLTIMO bloco — é justamente a posição que dá a ela o poder de
    // corrigir instruções de conduta vindas do Cérebro da IA. Nunca mover.
    const trimmedClosing = closingDirective?.trim();
    if (trimmedClosing) {
      prompt += `\n\n${trimmedClosing}`;
    }

    return prompt;
  }
}
