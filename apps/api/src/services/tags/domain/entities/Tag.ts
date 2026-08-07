/**
 * Paleta FIXA de cores de tag (8 opções — decisão do fundador: "bolinhas"
 * de cor pré-definidas, não hex livre, garante legibilidade em ambos os
 * temas sem cálculo de contraste em tempo real). União literal (não
 * `string` solto) — o TypeScript garante que só uma cor real é usada;
 * espelha o enum `TagColor` do Prisma (`GRAY`→`gray` etc., convertido em
 * `PrismaTagRepository`, mesmo padrão de `ConversationStage`).
 */
export const TAG_COLORS = [
  'gray',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'purple',
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export function isTagColor(value: string): value is TagColor {
  return (TAG_COLORS as readonly string[]).includes(value);
}

/**
 * Tag livre (etiqueta) — Redesign 2026-08-05 (R4). Catálogo POR SESSÃO
 * (mesmo padrão do Cérebro da IA/Respostas Rápidas, ADR #82): cada WhatsApp
 * tem seu próprio conjunto de tags, independente de outras sessões do
 * mesmo tenant.
 */
export interface Tag {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  color: TagColor;
  createdAt: Date;
  updatedAt: Date;
}
