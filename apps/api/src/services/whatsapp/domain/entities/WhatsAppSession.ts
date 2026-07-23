import { WhatsAppDisconnectReason } from './WhatsAppDisconnectReason';

export interface WhatsAppSession {
  id: string;
  /** Isola a sessão por empresa/cliente. Junto com `sessionName`, forma a
   * chave lógica única da sessão (ver `@@unique([tenantId, sessionName])`
   * em `prisma/schema.prisma`). */
  tenantId: string;
  sessionName: string;
  /**
   * Identificador canônico do provider de conexão. Tipado como união
   * literal (hoje com um único valor) em vez de `string` livre, espelhando
   * o enum `WhatsAppProviderType` do Prisma — corrige o achado F6 do
   * Architecture Gate Review: uma `string` solta permitia divergências
   * como `'Baileys'` vs `'baileys'`, a mesma classe de bug já encontrada
   * no schema legado (`ConversationStatus.CLOSED` inexistente). Novos
   * valores só são adicionados quando uma segunda implementação real de
   * `WhatsAppProvider` existir (YAGNI — ver ADR sobre F9).
   */
  provider: 'baileys';
  status: 'connected' | 'disconnected' | 'connecting';
  /**
   * Motivo da última desconexão (Production Hardening, Bloco 8a) — só
   * relevante enquanto `status === 'disconnected'`; limpo (`undefined`)
   * assim que a sessão volta a `'connecting'`/`'connected'`. Ver
   * `WhatsAppDisconnectReason` para a justificativa completa de ser um
   * campo separado, não um valor a mais em `status`.
   */
  disconnectReason?: WhatsAppDisconnectReason;
  phoneNumber?: string;
  connectedAt?: Date;
  lastSeen?: Date;
  createdAt: Date;
  updatedAt: Date;
}
