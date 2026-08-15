/**
 * Normalização de telefone para uma IDENTIDADE canônica — Fase L, Bloco L1.
 *
 * Este é o alicerce da deduplicação de contatos: dois números escritos de
 * formas diferentes precisam produzir a MESMA string, senão a mesma pessoa
 * vira dois contatos e recebe a mesma campanha duas vezes. Errar para o outro
 * lado é pior ainda — juntar duas pessoas diferentes num contato só —, por
 * isso todas as regras abaixo são conservadoras e explícitas.
 *
 * ## O problema do 9º dígito (decisão do fundador: unificar)
 *
 * Celulares brasileiros ganharam um "9" na frente do número local. O WhatsApp
 * convive com as duas formas: numa base real deste projeto havia 33 números
 * de 13 dígitos (com o 9) e 5 de 12 (sem), todos celulares. O mesmo aparelho
 * pode aparecer como `5565 8888-7777` numa conversa e ser digitado como
 * `5565 9 8888-7777` numa planilha.
 *
 * A forma canônica é sempre COM o 9. A guarda que impede juntar gente errada:
 * o "9" só é acrescentado quando o número local começa com 6, 7, 8 ou 9 —
 * faixa de celular no Brasil. Telefone fixo começa com 2, 3, 4 ou 5 e nunca é
 * tocado (um fixo `65 3333-4444` jamais vira `65 9 3333-4444`, que seria um
 * celular de outra pessoa).
 *
 * ## Identidade não é endereço de envio
 *
 * O valor devolvido aqui identifica a PESSOA. Ele não serve para enviar
 * mensagem: o endereço real do WhatsApp continua sendo o `contactJid` gravado
 * na conversa, que pode estar na forma de 12 dígitos. Nunca troque um pelo
 * outro — normalizar para identificar é seguro, "normalizar" para enviar
 * entregaria a mensagem a outro número.
 *
 * ## Limite deliberado: números longos demais são recusados
 *
 * Um LID (endereço de privacidade do WhatsApp, ex.: `225236742053984`) tem 15
 * dígitos e se pareceria com um telefone internacional. Como confundir os dois
 * criaria um "contato" que não é uma pessoa alcançável, qualquer entrada com
 * mais de 13 dígitos é recusada. O custo aceito: números internacionais muito
 * longos (raros neste produto, voltado a PMEs brasileiras) também são
 * recusados. Trade-off consciente — é preferível não cadastrar a cadastrar
 * errado.
 */

/** DDI do Brasil. */
const BRAZIL_COUNTRY_CODE = '55';

/**
 * Primeiro dígito do número local que caracteriza CELULAR no Brasil.
 * Fixos começam com 2–5 e ficam intocados (ver docstring do módulo).
 */
const MOBILE_FIRST_DIGITS = new Set(['6', '7', '8', '9']);

/**
 * Menor entrada aceitável: DDD (2) + número local (8). Abaixo disso não há
 * como saber sequer o DDD, e adivinhar seria inventar dado.
 */
const MIN_DIGITS = 10;

/** Ver "Limite deliberado" na docstring do módulo. */
const MAX_DIGITS = 13;

/**
 * Converte um telefone escrito de qualquer forma na sua identidade canônica
 * (somente dígitos, com DDI). Devolve `undefined` quando a entrada não pode
 * ser interpretada com segurança como telefone — nunca um palpite.
 *
 * Exemplos (Brasil):
 * - `'(65) 8888-7777'`      → `'5565988887777'`  (celular sem o 9 → canônico com o 9)
 * - `'5565988887777'`       → `'5565988887777'`  (já canônico, inalterado)
 * - `'+55 21 98888-7777'`   → `'5521988887777'`
 * - `'11 3333-4444'`        → `'551133334444'`   (fixo: o 9 NÃO é adicionado)
 * - `'225236742053984'`     → `undefined`        (LID, longo demais)
 * - `'123'`                 → `undefined`
 */
export function normalizePhoneToE164(input: string): string | undefined {
  const digits = input.replace(/\D/g, '');

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) {
    return undefined;
  }

  // Com DDI do Brasil já presente: 55 + DDD(2) + local(8 ou 9) = 12 ou 13.
  if (digits.startsWith(BRAZIL_COUNTRY_CODE) && (digits.length === 12 || digits.length === 13)) {
    return normalizeBrazilian(digits.slice(2));
  }

  // Sem DDI: DDD(2) + local(8 ou 9) = 10 ou 11. Assume Brasil — é o único
  // país em que este produto opera, e um número local sem DDI só faz sentido
  // no país de origem de quem digitou.
  if (digits.length === 10 || digits.length === 11) {
    return normalizeBrazilian(digits);
  }

  // Demais formatos (ex.: DDI estrangeiro com 12–13 dígitos): devolvidos como
  // estão. Não há regra de 9º dígito fora do Brasil, e aplicar a brasileira
  // corromperia o número.
  return digits;
}

/**
 * Recebe DDD + número local (sem DDI) e devolve a forma canônica com DDI.
 * Só aqui a regra do 9º dígito é aplicada.
 */
function normalizeBrazilian(dddAndLocal: string): string | undefined {
  const ddd = dddAndLocal.slice(0, 2);
  const local = dddAndLocal.slice(2);

  // DDDs brasileiros vão de 11 a 99 — nenhum começa com 0.
  if (ddd.startsWith('0')) {
    return undefined;
  }

  if (local.length === 9) {
    return `${BRAZIL_COUNTRY_CODE}${ddd}${local}`;
  }

  if (local.length === 8) {
    const isMobile = MOBILE_FIRST_DIGITS.has(local[0]);
    // Celular antigo ganha o 9; fixo permanece exatamente como está.
    return isMobile
      ? `${BRAZIL_COUNTRY_CODE}${ddd}9${local}`
      : `${BRAZIL_COUNTRY_CODE}${ddd}${local}`;
  }

  return undefined;
}

/**
 * Extrai a identidade canônica a partir de um JID do WhatsApp.
 *
 * Devolve `undefined` para qualquer endereço que não seja um telefone real —
 * em especial `@lid`, o formato de privacidade em que o WhatsApp esconde o
 * número (numa base real deste projeto, 13 de 51 conversas). Não existe
 * telefone a extrair de um LID: o dígito que aparece ali é um identificador
 * interno, não uma linha discável. Essas conversas simplesmente ficam sem
 * contato associado até que a pessoa escreva de um endereço com número real.
 */
export function phoneFromWhatsAppJid(contactJid: string): string | undefined {
  const atIndex = contactJid.indexOf('@');
  if (atIndex <= 0) {
    return undefined;
  }

  const domain = contactJid.slice(atIndex + 1);
  if (domain !== 's.whatsapp.net') {
    return undefined;
  }

  return normalizePhoneToE164(contactJid.slice(0, atIndex));
}
