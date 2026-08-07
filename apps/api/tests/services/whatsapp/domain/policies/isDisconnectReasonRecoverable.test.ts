import { isDisconnectReasonRecoverable } from '../../../../../src/services/whatsapp/domain/policies/isDisconnectReasonRecoverable';
import { WhatsAppDisconnectReason } from '../../../../../src/services/whatsapp/domain/entities/WhatsAppDisconnectReason';

describe('isDisconnectReasonRecoverable', () => {
  it('retorna false para logged_out (único motivo definitivo)', () => {
    expect(isDisconnectReasonRecoverable('logged_out')).toBe(false);
  });

  it.each<WhatsAppDisconnectReason>([
    'restart_required',
    'connection_lost',
    'timed_out',
    'unknown',
  ])('retorna true para %s (recuperável)', (reason) => {
    expect(isDisconnectReasonRecoverable(reason)).toBe(true);
  });
});
