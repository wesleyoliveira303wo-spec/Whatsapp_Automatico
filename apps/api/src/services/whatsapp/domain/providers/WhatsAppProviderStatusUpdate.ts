/**
 * @deprecated Substituído por `WhatsAppProviderEvent` (união discriminada
 * genérica) e pelo método de port `onEvent`, como parte da correção do
 * achado F2 do Architecture Gate Review (ver `DECISIONS.md`): o desenho
 * anterior (`onStatusChange` + este tipo único) exigiria um novo método no
 * port a cada novo tipo de evento (QR, mensagem, presence, typing),
 * violando Open/Closed. Este arquivo é mantido vazio de código —
 * intencionalmente sem `export` — apenas como um marcador para quem
 * procurar por este nome; toda referência real já foi migrada para
 * `WhatsAppProviderEvent.ts`.
 */
export {};
