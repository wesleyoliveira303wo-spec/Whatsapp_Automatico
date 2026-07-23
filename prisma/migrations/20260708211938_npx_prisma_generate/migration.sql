-- CreateEnum
CREATE TYPE "whatsapp_disconnect_reason" AS ENUM ('LOGGED_OUT', 'RESTART_REQUIRED', 'CONNECTION_LOST', 'TIMED_OUT', 'UNKNOWN');

-- AlterTable
ALTER TABLE "whatsapp_sessions" ADD COLUMN     "disconnect_reason" "whatsapp_disconnect_reason";
