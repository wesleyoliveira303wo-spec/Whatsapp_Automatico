/**
 * Reskin 2026-08-06 — paleta de 6 cores para o fallback de avatar (iniciais)
 * de um contato, hex exatos de `AVATARS` no Design System (as 3 telas que
 * mostram avatar — Conversas, Pipeline, Configurações/Equipe — repetem a
 * MESMA tabela). O mockup atribui uma cor fixa por registro de dado de
 * exemplo (`av: 0..5`); a Dashboard real não tem esse índice armazenado, então
 * `avatarPaletteFor` deriva um índice DETERMINÍSTICO a partir do identificador
 * do contato (hash simples, sem dependência nova) — o mesmo contato sempre
 * cai na mesma cor, sem precisar gravar nada novo no banco. Puramente
 * cosmético: não é uma feature nova, só o critério de escolha de uma cor que
 * já seria escolhida de algum jeito (antes, sempre a mesma cor neutra).
 */

const AVATAR_PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#E4EFE9', fg: '#1F6448' },
  { bg: '#EDE9F8', fg: '#4E3696' },
  { bg: '#FBECE4', fg: '#8F4C1C' },
  { bg: '#E5EDFA', fg: '#1F4C90' },
  { bg: '#F7E9EC', fg: '#94324A' },
  { bg: '#E9F0DE', fg: '#4C6620' },
];

/** Hash simples (djb2) — determinístico, sem dependência nova, suficiente para distribuir contatos entre 6 cores. */
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash);
}

/** Devolve sempre o MESMO par {bg, fg} para o mesmo `id` (ex.: `contactJid`, `userId`, `email`). */
export function avatarPaletteFor(id: string): { bg: string; fg: string } {
  const index = hashString(id) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}
