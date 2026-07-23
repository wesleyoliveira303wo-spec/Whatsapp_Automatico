/**
 * Politica de senha do sistema — Milestone 5, Bloco M5F-2. Extraida quando o
 * SEGUNDO consumidor apareceu (mesmo gatilho DRY de sempre): o RH
 * (UserManagementService, senha provisoria) e a troca da propria senha
 * (AuthService.changePassword) precisam do MESMO minimo — dois "8" soltos
 * divergiriam em silencio na primeira mudanca.
 */
export const MIN_PASSWORD_LENGTH = 8;
