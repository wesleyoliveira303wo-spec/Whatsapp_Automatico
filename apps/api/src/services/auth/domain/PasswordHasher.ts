/**
 * Porta (port) de hash de senha — Milestone 5, Bloco M5B (D54). "Trituradora
 * de documento": transforma a senha num valor do qual NAO se recupera a senha
 * original, mas contra o qual se pode CONFERIR se uma tentativa bate.
 *
 * E deliberadamente separada de `ApiKeyHasher` (shared/security): aquela usa
 * HMAC rapido, adequado a chaves de ALTA entropia (API keys geradas por
 * maquina); senha humana e de BAIXA entropia e exige um hash LENTO e com sal
 * (scrypt/bcrypt/argon2) para resistir a forca bruta. A implementacao concreta
 * (algoritmo) fica atras deste port — trocavel sem tocar quem usa (D54: o
 * algoritmo e um detalhe de Infrastructure).
 *
 * Vive em `services/auth` (nao em `shared/`) porque hoje o unico consumidor e
 * auth — mesma disciplina do D9 (so promover a `shared/` quando surgir um
 * segundo consumidor real).
 */
export interface PasswordHasher {
  /** Gera o hash (com sal aleatorio) de uma senha em texto plano. */
  hash(plainPassword: string): Promise<string>;

  /** Confere se uma senha em texto plano corresponde a um hash guardado. Nunca lanca — devolve `false` inclusive para hash malformado. */
  verify(plainPassword: string, storedHash: string): Promise<boolean>;
}
