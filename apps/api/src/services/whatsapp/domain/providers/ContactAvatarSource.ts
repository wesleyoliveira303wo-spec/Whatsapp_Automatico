/**
 * Resultado de uma tentativa de consulta da foto de perfil.
 *
 * A distinção entre os dois casos é a peça mais importante deste port, e
 * custou um bug real: `checked: true` com `avatarUrl` ausente significa
 * "perguntamos ao WhatsApp e esta pessoa não tem foto (ou bloqueou por
 * privacidade)" — informação de verdade, que merece virar registro negativo
 * e poupar consultas futuras. `checked: false` significa "não deu para
 * perguntar" (a sessão não está de pé neste instante, por exemplo) — não é
 * informação sobre a pessoa, e gravar isso como "sem foto" esconderia a foto
 * de TODO MUNDO por horas, logo depois de qualquer reinício.
 */
export type ContactAvatarLookup =
  | { checked: true; avatarUrl?: string }
  | { checked: false; reason: 'session_not_live' };

/**
 * Porta ESTREITA (um método) para consultar a foto de perfil ao vivo —
 * Bloco B2 (issue #13). Mesmo padrão e mesmo motivo de `ContactResolver`/
 * `OptOutDetector`/`AiAvailabilityRepository`: quem precisa de UMA
 * informação declara uma porta pequena, em vez de depender do serviço
 * inteiro (aqui, `WhatsAppSessionService`, que criaria um ciclo).
 *
 * NUNCA lança: ausência de foto, privacidade e timeout são todos respostas
 * válidas (mesmo contrato de `WhatsAppProvider.getProfilePictureUrl`).
 */
export interface ContactAvatarSource {
  lookup(
    tenantId: string,
    sessionName: string,
    contactJid: string,
  ): Promise<ContactAvatarLookup>;
}
