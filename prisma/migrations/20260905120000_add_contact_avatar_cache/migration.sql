-- Bloco B2 (issue #13) — cache servidor da foto de perfil de contato.
-- Aditiva: nenhuma tabela existente é tocada, nenhum backfill necessário
-- (linha ausente já significa "nunca checamos", que é o estado de todo
-- contato hoje).
CREATE TABLE "whatsapp_contact_avatars" (
    "tenant_id" TEXT NOT NULL,
    "session_name" TEXT NOT NULL,
    "contact_jid" TEXT NOT NULL,
    -- NULO com a linha presente = "checamos e não tem foto" (registro
    -- negativo, com validade própria). Linha ausente = "nunca checamos".
    "avatar_url" TEXT,
    "refreshed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contact_avatars_pkey" PRIMARY KEY ("tenant_id","session_name","contact_jid")
);
