/**
 * Porta (port) compartilhada para persistência opaca de segredos por tenant,
 * organizados em um namespace lógico e endereçados por chave.
 *
 * Vive em `shared/security/domain` — subpasta própria dentro de `shared/`,
 * separada de `shared/domain` (onde vive o `Logger`) — porque lida com
 * material sensível (credenciais, tokens, segredos de sessão), merecendo um
 * local claramente identificável para auditorias de segurança, mesmo sendo,
 * como o `Logger`, um primitivo de infraestrutura sem semântica de negócio.
 *
 * Por que não é `WhatsAppCredentialsStore`: modelar este port em torno do
 * formato específico de estado de autenticação do Baileys (que internamente
 * não é um blob único, e sim um conjunto de pares chave-valor do protocolo
 * Signal, com dezenas a centenas de entradas por sessão, lidas/escritas
 * individualmente) vazaria um detalhe de uma biblioteca concreta para o
 * Domain — o mesmo erro já evitado para `WhatsAppProvider` (ver achado F9,
 * DECISIONS.md). Um port genérico de chave-valor namespaced generaliza, sem
 * custo, para qualquer futuro consumidor que precise guardar segredos por
 * tenant (outro provider de WhatsApp, integrações de IA, OAuth de CRM), sem
 * o Domain nunca precisar saber o que está sendo guardado.
 *
 * `namespace` é uma convenção de quem consome o port (ex.:
 * `"whatsapp:session:<sessionName>"`), nunca interpretada aqui. `value` já
 * deve chegar serializado (string) — serialização é responsabilidade de quem
 * chama, não deste port.
 *
 * Callers nunca devem depender de uma implementação concreta (Ports &
 * Adapters / DIP) — apenas desta interface.
 */
export interface CredentialsStore {
  /** Lê uma chave específica. Retorna `null` se não existir. */
  get(tenantId: string, namespace: string, key: string): Promise<string | null>;

  /**
   * Lê todas as chaves de um namespace de uma vez (evita N+1 queries no
   * cenário de restauração de uma sessão inteira no boot de um provider).
   */
  getAll(tenantId: string, namespace: string): Promise<Record<string, string>>;

  /** Cria ou substitui o valor de uma chave (upsert). */
  set(tenantId: string, namespace: string, key: string, value: string): Promise<void>;

  /** Remove uma única chave (ex.: poda de chaves obsoletas do provider). */
  remove(tenantId: string, namespace: string, key: string): Promise<void>;

  /** Remove todas as chaves de um namespace (ex.: logout/reset de sessão). */
  clear(tenantId: string, namespace: string): Promise<void>;
}
