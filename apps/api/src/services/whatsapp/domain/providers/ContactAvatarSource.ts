/**
 * Porta ESTREITA (um método) para consultar a foto de perfil ao vivo —
 * Bloco B2 (issue #13). Mesmo padrão e mesmo motivo de `ContactResolver`/
 * `OptOutDetector`/`AiAvailabilityRepository`: quem precisa de UMA
 * informação declara uma porta pequena, em vez de depender do serviço
 * inteiro (aqui, `WhatsAppSessionService`, que criaria um ciclo).
 *
 * NUNCA lança: ausência de foto, socket desconectado, privacidade e timeout
 * são todos `undefined` — a ausência é o caso comum, não uma falha (mesmo
 * contrato de `WhatsAppProvider.getProfilePictureUrl`).
 */
export interface ContactAvatarSource {
  fetchAvatarUrl(
    tenantId: string,
    sessionName: string,
    contactJid: string,
  ): Promise<string | undefined>;
}
