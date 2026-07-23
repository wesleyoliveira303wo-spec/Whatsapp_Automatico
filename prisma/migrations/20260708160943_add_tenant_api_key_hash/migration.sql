/*
  Warnings:

  - A unique constraint covering the columns `[api_key_hash]` on the table `tenants` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "api_key_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_api_key_hash_key" ON "tenants"("api_key_hash");
