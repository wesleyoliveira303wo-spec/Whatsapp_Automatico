/**
 * Porta (port) compartilhada de criptografia simétrica para segredos em
 * repouso. Composta internamente por implementações de `CredentialsStore`
 * (ex.: `PrismaCredentialsStore`) — o store cuida de ONDE o dado mora, o
 * cipher cuida de COMO ele é protegido (Single Responsibility Principle).
 *
 * `tenantId` é parâmetro obrigatório, não incidental: uma única chave global
 * de criptografia para todos os tenants tornaria o vazamento de uma chave um
 * incidente que compromete simultaneamente as credenciais de WhatsApp de
 * todas as empresas na plataforma — um raio de explosão inaceitável em
 * escala (milhares de tenants). Passar `tenantId` permite que a
 * implementação derive uma chave por tenant (ex.: HKDF a partir de uma
 * chave mestra), sem exigir um KMS por tenant desde já — mais barato agora
 * do que reencriptar tudo depois se essa necessidade só for percebida após
 * dados reais em produção.
 *
 * Trade-off documentado (não bloqueador): com chaves derivadas de uma única
 * chave mestra, rotacionar a chave mestra ainda invalida todas as chaves
 * derivadas — não há isolamento total de rotação por tenant. Uma
 * implementação futura baseada em KMS real por tenant resolve isso trocando
 * apenas a implementação, nunca este port.
 */
export interface Cipher {
  encrypt(tenantId: string, plainText: string): string;
  decrypt(tenantId: string, cipherText: string): string;
}
