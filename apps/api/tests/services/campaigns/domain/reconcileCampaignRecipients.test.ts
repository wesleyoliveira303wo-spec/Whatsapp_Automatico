import { reconcileRecipients } from '../../../../src/services/campaigns/domain/policies/reconcileCampaignRecipients';

describe('reconcileRecipients (edição de campanha para contatos, 2026-09-15)', () => {
  it('destinatário novo (contactId ou telefone) entra em toCreate*', () => {
    const result = reconcileRecipients([], ['contact-1'], ['+5511999999999']);

    expect(result.toCreateContactIds).toEqual(['contact-1']);
    expect(result.toCreatePhones).toEqual(['+5511999999999']);
    expect(result.toDelete).toEqual([]);
    expect(result.toSuppress).toEqual([]);
  });

  it('destinatário removido do desejado, SEM histórico: apagado de vez', () => {
    const result = reconcileRecipients(
      [{ id: 'r1', contactId: 'contact-1', hasHistory: false }],
      [],
      [],
    );

    expect(result.toDelete).toEqual(['r1']);
    expect(result.toSuppress).toEqual([]);
  });

  it('destinatário removido do desejado, JÁ recebeu (hasHistory): suprimido, nunca apagado', () => {
    const result = reconcileRecipients(
      [{ id: 'r1', contactId: 'contact-1', hasHistory: true }],
      [],
      [],
    );

    expect(result.toDelete).toEqual([]);
    expect(result.toSuppress).toEqual(['r1']);
  });

  it('destinatário solto (phoneE164) removido do desejado, com histórico: suprimido', () => {
    const result = reconcileRecipients(
      [{ id: 'r1', phoneE164: '+5511999999999', hasHistory: true }],
      [],
      [],
    );

    expect(result.toSuppress).toEqual(['r1']);
  });

  it('destinatário presente nos dois lados (existente e desejado): nem cria, nem remove', () => {
    const result = reconcileRecipients(
      [
        { id: 'r1', contactId: 'contact-1', hasHistory: false },
        { id: 'r2', phoneE164: '+5511999999999', hasHistory: false },
      ],
      ['contact-1'],
      ['+5511999999999'],
    );

    expect(result.toCreateContactIds).toEqual([]);
    expect(result.toCreatePhones).toEqual([]);
    expect(result.toDelete).toEqual([]);
    expect(result.toSuppress).toEqual([]);
  });

  it('deduplica contactIds/telefones desejados repetidos', () => {
    const result = reconcileRecipients([], ['contact-1', 'contact-1'], []);
    expect(result.toCreateContactIds).toEqual(['contact-1']);
  });

  it('mistura de criar, apagar e suprimir na mesma edição', () => {
    const result = reconcileRecipients(
      [
        { id: 'stays', contactId: 'contact-stays', hasHistory: false },
        { id: 'deleted', contactId: 'contact-gone-no-history', hasHistory: false },
        { id: 'suppressed', contactId: 'contact-gone-with-history', hasHistory: true },
      ],
      ['contact-stays', 'contact-new'],
      [],
    );

    expect(result.toCreateContactIds).toEqual(['contact-new']);
    expect(result.toDelete).toEqual(['deleted']);
    expect(result.toSuppress).toEqual(['suppressed']);
  });
});
