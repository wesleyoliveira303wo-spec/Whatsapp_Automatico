import { PasswordHasher } from '../../auth/domain/PasswordHasher';
import { PlatformAuditLogRepository } from '../domain/repositories/PlatformAuditLogRepository';
import { PlatformUserRepository } from '../domain/repositories/PlatformUserRepository';

export const MIN_PLATFORM_PASSWORD_LENGTH = 12;

export type ResetPlatformPasswordResult =
  | { ok: true; platformUserId: string }
  | { ok: false; reason: 'not_found' | 'too_short' };

/**
 * Troca a senha do admin da plataforma. Só é chamada pelo script
 * `resetPlatformUserPassword.ts` — não existe rota HTTP para isso, mesmo
 * motivo do `createPlatformUser`.
 *
 * A troca fica na trilha da plataforma. Sessões do `/admin` já abertas NÃO
 * caem com a troca (o porteiro relê só o `status`); valem até o fim das 8h.
 */
export async function resetPlatformUserPassword(
  deps: {
    users: PlatformUserRepository;
    audit: PlatformAuditLogRepository;
    hasher: PasswordHasher;
  },
  email: string,
  newPassword: string,
): Promise<ResetPlatformPasswordResult> {
  if (newPassword.length < MIN_PLATFORM_PASSWORD_LENGTH) {
    return { ok: false, reason: 'too_short' };
  }

  const user = await deps.users.findByEmail(email.trim().toLowerCase());
  if (!user) return { ok: false, reason: 'not_found' };

  const updated = await deps.users.updatePasswordHash(user.id, await deps.hasher.hash(newPassword));
  if (!updated) return { ok: false, reason: 'not_found' };

  await deps.audit.append({
    platformUserId: user.id,
    action: 'platform.password_reset',
    metadata: { via: 'script' },
  });

  return { ok: true, platformUserId: user.id };
}
