/**
 * Recorte + compressão de foto de perfil no NAVEGADOR (Auditoria do Perfil,
 * 2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fase 4) — substitui o campo "URL da
 * foto" (colar um link era péssima experiência para "minha foto") por
 * upload de arquivo de verdade. Sem storage binário no backend (S3/disco) —
 * decisão deliberada, mesma filosofia de `AgentMediaCache` (nenhum storage
 * permanente novo sem necessidade real): a imagem processada aqui vira uma
 * `data:image/jpeg;base64,...` pequena, salva direto na coluna `avatarUrl`
 * já existente (`TEXT`, sem limite real no Postgres — só o teto de
 * validação em `authRouter.ts`, alinhado a este módulo).
 *
 * Recorte SEMPRE quadrado (centralizado no menor lado) — o avatar é
 * exibido dentro de um círculo (`UserAvatar`); uma foto retangular sem
 * recorte esticaria/achataria dentro do círculo.
 */

/** Lado do quadrado final, em pixels — avatar nunca é exibido maior que isso na UI (maior uso: 56px no Perfil, em tela retina ~2x); dobro disso já cobre com folga. */
const TARGET_SIZE_PX = 256;
/** Teto do resultado final em bytes — bem abaixo do limite de corpo de `PATCH /auth/me` (256kb, ver `apps/api/src/index.ts`), com folga para o resto do JSON. */
const TARGET_MAX_BYTES = 180_000;
/** Tentativas de qualidade JPEG, da melhor pra pior — para até na primeira que cabe no teto. */
const JPEG_QUALITIES = [0.85, 0.7, 0.55, 0.4];

export class ImageResizeError extends Error {}

function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageResizeError('Não foi possível ler essa imagem.'));
    img.src = objectUrl;
  });
}

/** Base64 (sem prefixo `data:...;base64,`) → bytes — para medir o tamanho real do resultado sem depender de `Blob.size` (evita um `canvas.toBlob` assíncrono extra). */
function base64Length(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Recebe o arquivo escolhido no `<input type="file">`, devolve uma
 * `data:image/jpeg;base64,...` quadrada e comprimida. Lança
 * `ImageResizeError` (mensagem já pronta para exibir) para: arquivo que não
 * é imagem, arquivo corrompido/ilegível, ou impossível comprimir abaixo do
 * teto mesmo na pior qualidade (foto absurdamente complexa — nunca visto
 * na prática, mas a função não deve travar nesse caso).
 */
export async function resizeImageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new ImageResizeError('Escolha um arquivo de imagem (JPEG, PNG…).');
  }

  const objectUrl = URL.createObjectURL(file);
  let image: HTMLImageElement;
  try {
    image = await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const side = Math.min(image.naturalWidth, image.naturalHeight);
  if (side <= 0) {
    throw new ImageResizeError('Essa imagem parece estar corrompida.');
  }
  const sourceX = (image.naturalWidth - side) / 2;
  const sourceY = (image.naturalHeight - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE_PX;
  canvas.height = TARGET_SIZE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ImageResizeError('Seu navegador não conseguiu processar essa imagem.');
  }
  ctx.drawImage(image, sourceX, sourceY, side, side, 0, 0, TARGET_SIZE_PX, TARGET_SIZE_PX);

  for (const quality of JPEG_QUALITIES) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (base64Length(dataUrl) <= TARGET_MAX_BYTES) {
      return dataUrl;
    }
  }
  throw new ImageResizeError('Essa imagem é grande demais mesmo depois de comprimida. Tente outra.');
}
