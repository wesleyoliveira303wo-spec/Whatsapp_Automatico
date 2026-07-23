/**
 * Convenção de namespace usada para endereçar as credenciais de uma sessão
 * do WhatsApp dentro do port genérico `CredentialsStore`
 * (`shared/security/domain/CredentialsStore.ts`).
 *
 * Extraído nesta Milestone (M2, Fase 1) de dentro de `BaileysProvider.ts`
 * (onde vivia como uma constante privada, `CREDENTIALS_NAMESPACE_PREFIX`) —
 * `WhatsAppSessionService.removeSession()` (Application) também precisa
 * construir exatamente o mesmo namespace para limpar credenciais ao remover
 * uma sessão, e duplicar essa string entre Application e Infrastructure
 * arriscaria as duas divergirem silenciosamente no futuro. Função pura,
 * sem nenhuma dependência de Infrastructure — cabe no Domain pelo mesmo
 * motivo já usado para `WhatsAppSessionKey`/`isDisconnectReasonRecoverable`:
 * lógica de nomenclatura/decisão sem I/O, compartilhada entre camadas.
 *
 * Formato inalterado em relação ao que já estava em produção
 * (`whatsapp:session:<sessionName>`) — esta extração não muda nenhum dado
 * já persistido em `tenant_credentials`.
 */
export function buildWhatsAppCredentialsNamespace(sessionName: string): string {
  return `whatsapp:session:${sessionName}`;
}
