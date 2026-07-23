import { formatStatusLabel, statusBadgeClassName, formatDisconnectReasonLabel, formatDateTime } from '../../lib/formatters';

describe('formatters (M2, Fase 4)', () => {
  describe('formatStatusLabel', () => {
    it('traduz cada status para pt-BR', () => {
      expect(formatStatusLabel('connected')).toBe('Conectado');
      expect(formatStatusLabel('connecting')).toBe('Conectando…');
      expect(formatStatusLabel('disconnected')).toBe('Desconectado');
    });
  });

  describe('statusBadgeClassName', () => {
    it('devolve uma classe diferente para cada status', () => {
      const classes = new Set([
        statusBadgeClassName('connected'),
        statusBadgeClassName('connecting'),
        statusBadgeClassName('disconnected'),
      ]);
      expect(classes.size).toBe(3);
    });
  });

  describe('formatDisconnectReasonLabel', () => {
    it('devolve undefined quando o motivo não está presente', () => {
      expect(formatDisconnectReasonLabel(undefined)).toBeUndefined();
    });

    it('traduz um motivo conhecido', () => {
      expect(formatDisconnectReasonLabel('logged_out')).toBe('Desconectado pelo celular (logout)');
    });
  });

  describe('formatDateTime', () => {
    it("devolve '—' para undefined", () => {
      expect(formatDateTime(undefined)).toBe('—');
    });

    it("devolve '—' para uma string inválida", () => {
      expect(formatDateTime('não-é-uma-data')).toBe('—');
    });

    it('formata uma data ISO válida', () => {
      const formatted = formatDateTime('2026-07-09T12:30:00.000Z');
      expect(formatted).toMatch(/2026/);
    });
  });
});
