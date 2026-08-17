import { determineSkipReason } from '../../../../src/services/campaigns/domain/policies/determineSkipReason';

describe('determineSkipReason (Fase L, Bloco L3)', () => {
  it('devolve null (elegível) quando nenhuma condição de supressão se aplica', () => {
    expect(
      determineSkipReason({
        optedOut: false,
        hasActiveHumanConversation: false,
        recentlyContactedByCampaign: false,
      }),
    ).toBeNull();
  });

  it('suprime por opt_out', () => {
    expect(
      determineSkipReason({
        optedOut: true,
        hasActiveHumanConversation: false,
        recentlyContactedByCampaign: false,
      }),
    ).toBe('opt_out');
  });

  it('suprime por active_human_conversation', () => {
    expect(
      determineSkipReason({
        optedOut: false,
        hasActiveHumanConversation: true,
        recentlyContactedByCampaign: false,
      }),
    ).toBe('active_human_conversation');
  });

  it('suprime por recently_contacted', () => {
    expect(
      determineSkipReason({
        optedOut: false,
        hasActiveHumanConversation: false,
        recentlyContactedByCampaign: true,
      }),
    ).toBe('recently_contacted');
  });

  // Prioridade: opt-out sempre vence, mesmo quando outras condições também se aplicam.
  it('opt_out tem prioridade sobre as demais condições', () => {
    expect(
      determineSkipReason({
        optedOut: true,
        hasActiveHumanConversation: true,
        recentlyContactedByCampaign: true,
      }),
    ).toBe('opt_out');
  });

  it('active_human_conversation tem prioridade sobre recently_contacted', () => {
    expect(
      determineSkipReason({
        optedOut: false,
        hasActiveHumanConversation: true,
        recentlyContactedByCampaign: true,
      }),
    ).toBe('active_human_conversation');
  });
});
