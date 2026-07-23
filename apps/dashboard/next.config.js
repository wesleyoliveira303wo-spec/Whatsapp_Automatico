const path = require('path');

// Carrega o .env da RAIZ do monorepo. O Next.js so auto-carrega arquivos
// .env* do PROPRIO diretorio (apps/dashboard) — e o projeto centraliza toda
// a configuracao num unico .env na raiz. Mesmo racional do dotenv explicito
// em apps/api/src/index.ts. Sem isto, `npm run dev` local sobe o Dashboard
// sem API_BASE_URL/DASHBOARD_SESSION_SECRET e todo login falha com
// server_misconfigured (achado do primeiro teste ponta a ponta da M5).
// No Docker o env_file do compose ja injeta as variaveis — o dotenv abaixo
// nao sobrescreve nada que ja exista no ambiente (comportamento padrao).
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
