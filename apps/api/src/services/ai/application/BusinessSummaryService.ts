import { Logger } from '../../../shared/domain/Logger';
import { AiProvider } from '../domain/providers/AiProvider';
import { AiBusinessProfileService } from './AiBusinessProfileService';
import { buildBusinessSummaryPrompt } from './BusinessSummaryPromptBuilder';

/**
 * Gera e CACHEIA o resumo do negócio (Auditoria do Perfil, 2026-08-28, ver
 * `PERFIL_REDESIGN_PLAN.md`) — pedido explícito do fundador: "automático e
 * deve ficar salvo, atualizar somente quando houver interação no cérebro da
 * IA". Molde EXATO de `ConversationSummaryService` (mesmo racional de
 * porta/provider/degradação graciosa), adaptado para uma entrada mais
 * simples (um texto solto, não um histórico de mensagens) e uma saída
 * cacheada (não devolvida ao vivo por um endpoint síncrono — gravada e
 * consumida depois pela leitura normal do perfil).
 *
 * Chamado pelo router de Cérebro da IA (`aiProfileRouter`) depois de UM
 * `PUT` bem-sucedido — nunca na leitura (`GET`), nunca automaticamente por
 * tempo/cron. `regenerate()` é FIRE-AND-FORGET do ponto de vista do
 * chamador (o router não espera o resultado — ver docstring de
 * `createAiProfileRouter`): salvar o Cérebro da IA não deve ficar mais
 * lento nem falhar por causa do resumo.
 *
 * NÃO grava `AiInteraction`, diferente de `ConversationSummaryService` —
 * simplificação deliberada: `AiInteraction.conversationId` é obrigatório
 * (audita custo POR CONVERSA) e este resumo não pertence a nenhuma; abrir
 * esse campo para `undefined` alteraria um contrato usado em todo o
 * billing/auditoria existente, fora do escopo deste pedido. O custo desta
 * chamada (pequena — um texto curto, não um histórico inteiro) fica só no
 * log estruturado (`logger.warn`/`logger.info`), não no billing por
 * conversa. Se isso precisar de auditoria formal no futuro, é uma decisão
 * separada (tornar `conversationId` opcional, ou um log de custo próprio).
 */
export class BusinessSummaryService {
  constructor(
    private readonly aiBusinessProfileService: AiBusinessProfileService,
    private readonly logger: Logger,
    private readonly aiProvider?: AiProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Regenera o resumo de `(tenantId, sessionName)` a partir do `content`
   * informado (o texto que ACABOU de ser salvo — evita reler o banco
   * imediatamente depois de escrever nele). `content` vazio/só espaços:
   * limpa o resumo (`summary: null`) sem chamar a IA — nada a resumir, e
   * "sem resumo" já é o estado correto para "sem Cérebro configurado" (o
   * Perfil trata os dois graciosamente, mesmo formatador de degradação dos
   * demais campos ausentes).
   *
   * Nunca lança: falha do provider (indisponível, sem credenciais, erro de
   * rede) é logada e ABSORVIDA — quem chama isto não deve ver o
   * salvamento do Cérebro da IA falhar por causa do resumo, que é um
   * extra, não o dado principal.
   */
  async regenerate(tenantId: string, sessionName: string, content: string): Promise<void> {
    const trimmed = content.trim();
    if (trimmed === '') {
      await this.aiBusinessProfileService.updateSummary(tenantId, sessionName, null, this.now());
      return;
    }

    if (!this.aiProvider) {
      this.logger.warn(
        'Resumo do negócio não gerado: nenhum AiProvider configurado (ver AI_PROVIDER/CLAUDE_API_KEY/GEMINI_API_KEY no .env).',
        { tenantId, sessionName },
      );
      return;
    }

    try {
      const request = buildBusinessSummaryPrompt(trimmed);
      const result = await this.aiProvider.generateReply(request);
      await this.aiBusinessProfileService.updateSummary(
        tenantId,
        sessionName,
        result.content.trim(),
        this.now(),
      );
      this.logger.info('Resumo do negócio gerado', {
        tenantId,
        sessionName,
        model: result.model,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
      });
    } catch (error) {
      this.logger.warn('Falha ao gerar resumo do negócio via IA — Cérebro salvo normalmente', {
        tenantId,
        sessionName,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
