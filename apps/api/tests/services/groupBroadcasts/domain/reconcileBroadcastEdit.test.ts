import { reconcileSteps, reconcileTargets } from '../../../../src/services/groupBroadcasts/domain/policies/reconcileBroadcastEdit';

describe('reconcileSteps', () => {
  it('etapa existente com id continua: entra em toUpdate, nunca em toDelete', () => {
    const r = reconcileSteps(
      [{ id: 's1', order: 0, runsCompleted: 2, hasHistory: true }],
      [{ id: 's1', messageTemplate: 'texto novo' }],
    );
    expect(r.toUpdate).toEqual([{ id: 's1', desired: { id: 's1', messageTemplate: 'texto novo' } }]);
    expect(r.toDelete).toEqual([]);
    expect(r.toFinish).toEqual([]);
  });

  it('etapa nova (sem id) recebe a próxima order livre', () => {
    const r = reconcileSteps(
      [{ id: 's1', order: 0, runsCompleted: 0, hasHistory: false }],
      [{ id: 's1', messageTemplate: 'a' }, { messageTemplate: 'nova' }],
    );
    expect(r.toCreate).toEqual([{ order: 1, desired: { messageTemplate: 'nova' } }]);
  });

  it('etapa removida SEM histórico é apagada', () => {
    const r = reconcileSteps(
      [{ id: 's1', order: 0, runsCompleted: 0, hasHistory: false }, { id: 's2', order: 1, runsCompleted: 0, hasHistory: false }],
      [{ id: 's1', messageTemplate: 'a' }],
    );
    expect(r.toDelete).toEqual(['s2']);
    expect(r.toFinish).toEqual([]);
  });

  it('etapa removida COM histórico é encerrada, nunca apagada', () => {
    const r = reconcileSteps(
      [{ id: 's1', order: 0, runsCompleted: 0, hasHistory: false }, { id: 's2', order: 1, runsCompleted: 3, hasHistory: true }],
      [{ id: 's1', messageTemplate: 'a' }],
    );
    expect(r.toFinish).toEqual(['s2']);
    expect(r.toDelete).toEqual([]);
  });

  it('order nova nunca colide com order já usada, mesmo depois de remoções', () => {
    const r = reconcileSteps(
      [{ id: 's1', order: 0, runsCompleted: 0, hasHistory: false }, { id: 's2', order: 5, runsCompleted: 1, hasHistory: true }],
      [{ id: 's1', messageTemplate: 'a' }, { id: 's2', messageTemplate: 'b' }, { messageTemplate: 'nova' }],
    );
    expect(r.toCreate[0].order).toBe(6);
  });

  it('etapa desejada com id inexistente (id inválido ou de outra campanha) é tratada como etapa NOVA', () => {
    const r = reconcileSteps(
      [{ id: 's1', order: 0, runsCompleted: 0, hasHistory: false }],
      [{ id: 's1', messageTemplate: 'a' }, { id: 'de-outra-campanha', messageTemplate: 'intrusa' }],
    );
    expect(r.toCreate).toEqual([{ order: 1, desired: { id: 'de-outra-campanha', messageTemplate: 'intrusa' } }]);
    expect(r.toUpdate).toEqual([{ id: 's1', desired: { id: 's1', messageTemplate: 'a' } }]);
  });
});

describe('reconcileTargets', () => {
  it('jid novo entra em toCreate', () => {
    const r = reconcileTargets([{ id: 't1', groupJid: '1@g.us', hasHistory: false }], ['1@g.us', '2@g.us']);
    expect(r.toCreate).toEqual(['2@g.us']);
  });

  it('removido SEM histórico é apagado; COM histórico é suprimido', () => {
    const r = reconcileTargets(
      [
        { id: 't1', groupJid: '1@g.us', hasHistory: false },
        { id: 't2', groupJid: '2@g.us', hasHistory: true },
      ],
      [],
    );
    expect(r.toDelete).toEqual(['t1']);
    expect(r.toSuppress).toEqual(['t2']);
  });

  it('jid repetido na lista desejada não duplica', () => {
    const r = reconcileTargets([], ['1@g.us', '1@g.us']);
    expect(r.toCreate).toEqual(['1@g.us']);
  });
});
