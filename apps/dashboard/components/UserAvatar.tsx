import { cn } from '@/lib/utils';
import { avatarPaletteFor } from '@/lib/avatarPalette';

interface UserAvatarProps {
  email: string;
  name?: string;
  avatarUrl?: string;
  className?: string;
}

/** Nome (se houver) -> 2 iniciais; senão, as 2 primeiras letras do e-mail. */
function initialsFor(email: string, name?: string): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    const words = trimmedName.split(/\s+/).filter(Boolean);
    const initials = words
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? '')
      .join('');
    if (initials) return initials.toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

/**
 * Avatar do USUÁRIO logado (Reorganização Perfil/Configurações, 2026-08-27)
 * — antes deste bloco não existia nenhum: o círculo no topo do rail mostrava
 * a foto do WHATSAPP conectado, não da pessoa (achado da auditoria, ver
 * `DECISIONS.md`). Com foto (`avatarUrl`, editável no Perfil) mostra a foto;
 * senão, iniciais do nome (ou do e-mail) com cor determinística
 * (`avatarPaletteFor`, mesmo mecanismo de `ContactAvatar`) — nunca um
 * círculo vazio.
 */
export default function UserAvatar({
  email,
  name,
  avatarUrl,
  className,
}: UserAvatarProps): JSX.Element {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL arbitrária informada pelo usuário, fora do domínio de imagens do next/image.
      <img
        src={avatarUrl}
        alt=""
        className={cn('h-11 w-11 rounded-full object-cover', className)}
      />
    );
  }

  const palette = avatarPaletteFor(email);
  return (
    <div
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold',
        className,
      )}
      style={{ backgroundColor: palette.bg, color: palette.fg }}
    >
      {initialsFor(email, name)}
    </div>
  );
}
