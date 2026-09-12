/**
 * Um grupo de WhatsApp do qual o número da sessão participa — Disparos em
 * grupos (2026-09-11). Leitura AO VIVO do socket (`WhatsAppProvider.listGroups`),
 * nunca persistida por este bounded context: o conjunto de grupos muda sem
 * aviso (entradas, saídas, renomeações) e o próprio WhatsApp é a fonte de
 * verdade.
 *
 * Grupo é destino de PUBLICAÇÃO, não canal de atendimento — mensagens de grupo
 * continuam descartadas na entrada (`isIgnoredChatJid`, `BaileysProvider`).
 */
export interface WhatsAppGroupSummary {
  /** JID do grupo (`...@g.us`) — é para ele que o envio vai. */
  jid: string;
  /** Nome ("assunto") do grupo no momento da consulta. */
  name: string;
  /** Quantidade de participantes (`size` do WhatsApp, ou a contagem da lista quando ausente). */
  participantCount: number;
  /** `true` quando o grupo está configurado para "só administradores enviam mensagens". */
  announce: boolean;
  /** `true` quando o NÚMERO DA SESSÃO é administrador (ou superadministrador) do grupo. */
  isAdmin: boolean;
  /**
   * Se este número consegue publicar no grupo agora: `!announce || isAdmin`.
   * Derivado (não um dado do WhatsApp) — calculado num único lugar
   * (`buildWhatsAppGroupSummaries`) para a UI e o disparo nunca divergirem.
   */
  canSend: boolean;
}
