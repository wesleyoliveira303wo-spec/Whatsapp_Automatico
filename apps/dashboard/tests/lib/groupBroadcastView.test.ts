import {
  flattenStepTargetsForDisplay,
  lastSentAtForStep,
} from '../../lib/groupBroadcastView';
import type { GroupBroadcastStep, GroupBroadcastStepTarget } from '../../lib/clientApi';

function step(overrides: Partial<GroupBroadcastStep> = {}): GroupBroadcastStep {
  return {
    id: 'step-1',
    broadcastId: 'b1',
    order: 0,
    messageTemplate: 'Oi!',
    runsCompleted: 0,
    createdAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}

function stepTarget(overrides: Partial<GroupBroadcastStepTarget> = {}): GroupBroadcastStepTarget {
  return {
    id: 'st-1',
    stepId: 'step-1',
    broadcastId: 'b1',
    groupJid: 'a@g.us',
    groupName: 'Grupo A',
    status: 'pending',
    sentCount: 0,
    createdAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('lastSentAtForStep', () => {
  it('sem alvos: undefined', () => {
    expect(lastSentAtForStep(undefined)).toBeUndefined();
    expect(lastSentAtForStep([])).toBeUndefined();
  });

  it('nenhum alvo publicou ainda: undefined', () => {
    const targets = [stepTarget({ status: 'pending' }), stepTarget({ id: 'st-2', status: 'skipped' })];
    expect(lastSentAtForStep(targets)).toBeUndefined();
  });

  it('um alvo publicado: a data dele', () => {
    const targets = [stepTarget({ status: 'sent', sentAt: '2026-09-18T10:00:00.000Z' })];
    expect(lastSentAtForStep(targets)).toBe('2026-09-18T10:00:00.000Z');
  });

  it('vários alvos: a data MAIS RECENTE, não a última da lista', () => {
    const targets = [
      stepTarget({ id: 'st-1', status: 'sent', sentAt: '2026-09-18T08:00:00.000Z' }),
      stepTarget({ id: 'st-2', status: 'sent', sentAt: '2026-09-18T12:00:00.000Z' }),
      stepTarget({ id: 'st-3', status: 'sent', sentAt: '2026-09-18T09:00:00.000Z' }),
    ];
    expect(lastSentAtForStep(targets)).toBe('2026-09-18T12:00:00.000Z');
  });
});

describe('flattenStepTargetsForDisplay', () => {
  it('publicação única: uma linha por grupo, numerada 1', () => {
    const steps = [step({ id: 'step-1' })];
    const rows = flattenStepTargetsForDisplay(steps, {
      'step-1': [stepTarget({ id: 'st-1', groupJid: 'a@g.us' })],
    });
    expect(rows).toEqual([
      { key: 'step-1:st-1', stepId: 'step-1', stepNumber: 1, target: rows[0].target },
    ]);
  });

  it('várias publicações: o mesmo grupo aparece uma vez por publicação, numerado na ordem', () => {
    const steps = [step({ id: 'step-1', order: 0 }), step({ id: 'step-2', order: 1 })];
    const rows = flattenStepTargetsForDisplay(steps, {
      'step-1': [stepTarget({ id: 'st-1', stepId: 'step-1', groupJid: 'a@g.us', status: 'sent' })],
      'step-2': [stepTarget({ id: 'st-2', stepId: 'step-2', groupJid: 'a@g.us', status: 'pending' })],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ stepId: 'step-1', stepNumber: 1 });
    expect(rows[1]).toMatchObject({ stepId: 'step-2', stepNumber: 2 });
  });

  it('etapa sem alvos ainda carregados (mapa incompleto): não quebra', () => {
    const steps = [step({ id: 'step-1' }), step({ id: 'step-2' })];
    const rows = flattenStepTargetsForDisplay(steps, { 'step-1': [stepTarget()] });
    expect(rows).toHaveLength(1);
  });
});
