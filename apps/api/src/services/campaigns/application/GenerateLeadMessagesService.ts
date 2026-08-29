import { AiProvider } from '../../ai/domain/providers/AiProvider';
import { normalizePhoneToE164 } from '../../contacts/domain/phoneNumber';
import { EnrichedLead } from '../domain/entities/EnrichedLead';
import { pickMessageVariation } from '../domain/policies/pickMessageVariation';
import { buildLeadMessagePrompt } from '../domain/policies/buildLeadMessagePrompt';
import { LeadMessageGenerationUnavailableError } from '../domain/errors/LeadMessageGenerationUnavailableError';

/** Um rascunho de mensagem 1, pronto para revisão humana — nunca persistido sozinho (vira `phoneRecipients[].personalizedMessage` só depois de aprovado, na criação da campanha). */
export interface LeadMessageDraft {
  companyName: string;
  phoneE164: string;
  message: string;
}

/**
 * Gera a mensagem 1 (abertura) de cada lead de um lote — Fase de
 * Prospecção IA (2026-08-29). NUNCA persiste nada (mesmo racional de
 * `CampaignService.parseRecipientsCsv`): o resultado é só para o operador
 * revisar antes de criar a campanha de fato.
 *
 * A ORDEM dos leads recebidos é preservada e usada como `index` de
 * `pickMessageVariation` — o CHAMADOR (router) é quem garante que os leads
 * já chegam ordenados por prioridade/avaliações (mesma ordem já usada
 * manualmente em `leads-prospeccao-google-maps/`), esta classe só rotaciona
 * a variação NA ORDEM em que recebe.
 */
export class GenerateLeadMessagesService {
  constructor(private readonly aiProvider?: AiProvider) {}

  async generate(leads: EnrichedLead[]): Promise<LeadMessageDraft[]> {
    if (!this.aiProvider) {
      throw new LeadMessageGenerationUnavailableError();
    }

    const drafts: LeadMessageDraft[] = [];
    for (let index = 0; index < leads.length; index += 1) {
      const lead = leads[index];
      const phoneE164 = normalizePhoneToE164(lead.rawPhone);
      if (!phoneE164) {
        continue; // telefone inválido: pulado, nunca derruba o lote inteiro
      }

      const variation = pickMessageVariation(index, lead.openingHooks.length);
      const { systemPrompt, userMessage } = buildLeadMessagePrompt(lead, variation);
      const result = await this.aiProvider.generateReply({
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      drafts.push({
        companyName: lead.companyName,
        phoneE164,
        message: result.content.trim(),
      });
    }
    return drafts;
  }
}
