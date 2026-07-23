/**
 * Value Object que encapsula a chave lógica de uma sessão do WhatsApp
 * (`tenantId` + `sessionName` — a mesma dupla do `@@unique([tenantId,
 * sessionName])` em `prisma/schema.prisma`).
 *
 * Existe para dar a um futuro `WhatsAppConnectionRegistry` (Item 5) uma
 * chave de `Map` canônica, sem espalhar concatenação de string pelo código
 * chamador. Completa, apenas nesta parte, o achado F4 do Architecture Gate
 * Review (ver DECISIONS.md ADR #18: "`SessionKey` encapsulando
 * `tenantId`+`sessionName`, com `toString()` canônico para uso como chave
 * de mapa/registry... revisitar quando o Item 3/4 tornar esses pontos de
 * manipulação mais frequentes"). O outro Value Object citado na mesma ADR
 * (`PhoneNumber`, validação E.164) continua fora de escopo — não é
 * necessário para o Registry e não foi implementado aqui.
 *
 * Nenhuma dependência de Infrastructure — usa só primitivos de JavaScript.
 */
export class WhatsAppSessionKey {
  /**
   * Caractere separador usado no `toString()` canônico: o caractere de
   * código 0 (NUL), obtido via `String.fromCharCode(0)` para evitar
   * qualquer ambiguidade de escape no código-fonte. Escolhido por ser
   * praticamente impossível de aparecer em `tenantId` (UUID) ou
   * `sessionName` (nome legível escolhido por humanos, que PODE conter
   * espaços comuns, dois-pontos etc. — por isso um separador como ' ' ou
   * ':' seria uma escolha ruim). Reduz ao mínimo o risco de colisão entre
   * duas chaves logicamente diferentes que produziriam a mesma string
   * canônica (ex.: `tenantId="a:b"` + `sessionName="c"` vs. `tenantId="a"` +
   * `sessionName="b:c"`, se o separador fosse `:`). O construtor rejeita
   * explicitamente qualquer `tenantId`/`sessionName` que contenha este
   * caractere reservado, fechando essa janela por completo em vez de
   * apenas torná-la improvável.
   */
  private static readonly CANONICAL_SEPARATOR = String.fromCharCode(0);

  public readonly tenantId: string;
  public readonly sessionName: string;

  constructor(tenantId: string, sessionName: string) {
    WhatsAppSessionKey.assertValidPart('tenantId', tenantId);
    WhatsAppSessionKey.assertValidPart('sessionName', sessionName);

    this.tenantId = tenantId;
    this.sessionName = sessionName;

    // Imutabilidade real (não só por convenção de `readonly` do
    // TypeScript, que só protege em tempo de compilação): `Object.freeze`
    // faz qualquer tentativa de reatribuição em runtime falhar
    // (silenciosamente em modo não-estrito, lançando `TypeError` em modo
    // estrito — que é o caso deste projeto, compilado como módulo ES).
    Object.freeze(this);
  }

  private static assertValidPart(fieldName: 'tenantId' | 'sessionName', value: string): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`WhatsAppSessionKey: '${fieldName}' não pode ser vazio.`);
    }
    if (value.includes(WhatsAppSessionKey.CANONICAL_SEPARATOR)) {
      throw new Error(`WhatsAppSessionKey: '${fieldName}' contém um caractere reservado (NUL) e não é permitido.`);
    }
  }

  /** Igualdade por valor — nunca por referência (`===` entre duas instâncias distintas sempre seria `false`, mesmo com os mesmos dados). */
  equals(other: WhatsAppSessionKey): boolean {
    return this.tenantId === other.tenantId && this.sessionName === other.sessionName;
  }

  /**
   * Representação canônica, exclusivamente para uso como chave de `Map`
   * (ex.: dentro do futuro `WhatsAppConnectionRegistry`). Não deve ser
   * interpretada, exibida ao usuário, nem persistida — é um detalhe interno
   * deste Value Object.
   */
  toString(): string {
    return `${this.tenantId}${WhatsAppSessionKey.CANONICAL_SEPARATOR}${this.sessionName}`;
  }
}
