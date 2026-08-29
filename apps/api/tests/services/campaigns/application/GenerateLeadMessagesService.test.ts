import { GenerateLeadMessagesService } from '../../../../src/services/campaigns/application/GenerateLeadMessagesService';
import { LeadMessageGenerationUnavailableError } from '../../../../src/services/campaigns/domain/errors/LeadMessageGenerationUnavailableError';
import { EnrichedLead } from '../../../../src/services/campaigns/domain/entities/EnrichedLead';
import { FakeAiProvider } from '../../../services/ai/infrastructure/FakeAiProviderFactory';

function buildLead(overrides: Partial<EnrichedLead> = {}): EnrichedLead {
  return {
    companyName: 'Adega Barril do Recreio',
    category: 'Restaurante português',
    neighborhood: 'Recreio dos Bandeirantes',
    siteStatus: 'Sem Site',
    googleRating: 4.3,
    reviewCount: 3096,
    mainPainPoint: 'Tem prova social forte mas nenhuma vitrine digital própria.',
    socialProofTrigger: 'Referência consolidada no bairro (3096 avaliações, nota 4.3)',
    recommendedTone: 'Direto e consultivo',
    openingHooks: ['Gancho um', 'Gancho dois'],
    recommendedCta: 'Pergunta direta sobre uma ligação rápida',
    rawPhone: '+55 21 2437-4428',
    ...overrides,
  };
}

describe('GenerateLeadMessagesService (Fase de Prospecção IA)', () => {
  it('gera um rascunho por lead, com o telefone já normalizado', async () => {
    const aiProvider = new FakeAiProvider();
    aiProvider.setNextResult({
      content: 'Texto gerado pela IA para o primeiro lead.',
      model: 'fake-model',
      tokensInput: 10,
      tokensOutput: 20,
    });
    const service = new GenerateLeadMessagesService(aiProvider);

    const drafts = await service.generate([buildLead()]);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual({
      companyName: 'Adega Barril do Recreio',
      // Confirmado via normalizePhoneToE164('+55 21 2437-4428') rodado isoladamente
      // (ver apps/api/src/services/contacts/domain/phoneNumber.ts): a função devolve
      // só dígitos (sem "+"), e '2437-4428' já tem 8 dígitos locais começando com '2'
      // (fixo) — o 9º dígito NÃO é adicionado.
      phoneE164: '552124374428',
      message: 'Texto gerado pela IA para o primeiro lead.',
    });
  });

  it('chama a IA uma vez por lead, e cada chamada usa um esqueleto diferente do anterior', async () => {
    const aiProvider = new FakeAiProvider();
    const service = new GenerateLeadMessagesService(aiProvider);

    await service.generate([buildLead(), buildLead({ companyName: 'Segundo Lead' })]);

    expect(aiProvider.generateReplyCalls).toHaveLength(2);
    expect(aiProvider.generateReplyCalls[0].systemPrompt).not.toBe(
      aiProvider.generateReplyCalls[1].systemPrompt,
    );
  });

  it('lead com telefone que não normaliza é pulado, sem derrubar o lote inteiro', async () => {
    const aiProvider = new FakeAiProvider();
    const service = new GenerateLeadMessagesService(aiProvider);

    const drafts = await service.generate([buildLead({ rawPhone: 'não é um telefone' })]);

    expect(drafts).toHaveLength(0);
  });

  it('sem AiProvider configurado, lança LeadMessageGenerationUnavailableError', async () => {
    const service = new GenerateLeadMessagesService(undefined);

    await expect(service.generate([buildLead()])).rejects.toBeInstanceOf(
      LeadMessageGenerationUnavailableError,
    );
  });
});
