import {
  clampGroupIntervalSeconds,
  computeGroupSendDelayMs,
  DEFAULT_GROUP_INTERVAL_SECONDS,
  determineGroupTargetSkipReason,
  GROUP_JITTER_MAX_MS,
  MAX_GROUP_INTERVAL_SECONDS,
  MAX_GROUP_MEDIA_BYTES,
  MAX_GROUP_MEDIA_UPLOAD_BYTES,
  MAX_GROUPS_PER_BROADCAST,
  MIN_GROUP_INTERVAL_SECONDS,
  shouldPauseGroupBroadcast,
} from '../../../../src/services/groupBroadcasts/domain/policies/groupBroadcastPacing';

describe('groupBroadcastPacing (Disparos em grupos — calibragem anti-banimento)', () => {
  describe('constantes', () => {
    it('são mais conservadoras que o motor 1:1: piso de 30s, padrão de 60s, teto de 30 grupos', () => {
      expect(MIN_GROUP_INTERVAL_SECONDS).toBe(30);
      expect(DEFAULT_GROUP_INTERVAL_SECONDS).toBe(60);
      expect(MAX_GROUPS_PER_BROADCAST).toBe(30);
    });

    it('vídeo aceita mais que imagem, e o limite do corpo HTTP é o maior dos dois', () => {
      expect(MAX_GROUP_MEDIA_BYTES.image).toBe(5 * 1024 * 1024);
      expect(MAX_GROUP_MEDIA_BYTES.video).toBe(16 * 1024 * 1024);
      expect(MAX_GROUP_MEDIA_UPLOAD_BYTES).toBe(16 * 1024 * 1024);
    });
  });

  describe('clampGroupIntervalSeconds()', () => {
    it('ausente ou inválido vira o padrão', () => {
      expect(clampGroupIntervalSeconds(undefined)).toBe(DEFAULT_GROUP_INTERVAL_SECONDS);
      expect(clampGroupIntervalSeconds(Number.NaN)).toBe(DEFAULT_GROUP_INTERVAL_SECONDS);
    });

    it('nunca desce abaixo do piso de 30s, mesmo pedindo 0 ou negativo', () => {
      expect(clampGroupIntervalSeconds(0)).toBe(MIN_GROUP_INTERVAL_SECONDS);
      expect(clampGroupIntervalSeconds(5)).toBe(MIN_GROUP_INTERVAL_SECONDS);
      expect(clampGroupIntervalSeconds(-100)).toBe(MIN_GROUP_INTERVAL_SECONDS);
    });

    it('respeita o teto e arredonda valores fracionados', () => {
      expect(clampGroupIntervalSeconds(99_999)).toBe(MAX_GROUP_INTERVAL_SECONDS);
      expect(clampGroupIntervalSeconds(90.6)).toBe(91);
    });
  });

  describe('computeGroupSendDelayMs()', () => {
    const now = new Date('2026-09-11T12:00:00Z');

    it('delay(n) = n × intervalo + jitter', () => {
      expect(computeGroupSendDelayMs(0, 60, now, () => 0)).toBe(0);
      expect(computeGroupSendDelayMs(3, 60, now, () => 0)).toBe(180_000);
      expect(computeGroupSendDelayMs(1, 60, now, () => 0.5)).toBe(60_000 + GROUP_JITTER_MAX_MS / 2);
    });

    it('um intervalo gravado abaixo do piso nunca acelera o disparo (defesa em profundidade)', () => {
      expect(computeGroupSendDelayMs(2, 1, now, () => 0)).toBe(2 * MIN_GROUP_INTERVAL_SECONDS * 1000);
    });
  });

  describe('shouldPauseGroupBroadcast() — disjuntor "ao primeiro sinal de falhas seguidas"', () => {
    it('pausa quando as DUAS últimas tentativas falharam', () => {
      expect(shouldPauseGroupBroadcast(['failed', 'failed'])).toBe(true);
    });

    it('não pausa com uma falha isolada seguida de sucesso (nem na ordem inversa)', () => {
      expect(shouldPauseGroupBroadcast(['failed', 'sent'])).toBe(false);
      expect(shouldPauseGroupBroadcast(['sent', 'failed'])).toBe(false);
    });

    it('não avalia com amostra menor que 2 — uma falha só não pausa', () => {
      expect(shouldPauseGroupBroadcast(['failed'])).toBe(false);
      expect(shouldPauseGroupBroadcast([])).toBe(false);
    });
  });

  describe('determineGroupTargetSkipReason()', () => {
    const base = { jid: '1@g.us', name: 'Grupo', participantCount: 10 };

    it('grupo fora da listagem ao vivo → group_not_found', () => {
      expect(determineGroupTargetSkipReason(undefined)).toBe('group_not_found');
    });

    it('grupo "só admins" onde o número não é admin → admin_only_group', () => {
      expect(determineGroupTargetSkipReason({ ...base, canSend: false })).toBe('admin_only_group');
    });

    it('grupo que aceita envio → entra (undefined)', () => {
      expect(determineGroupTargetSkipReason({ ...base, canSend: true })).toBeUndefined();
    });
  });
});
