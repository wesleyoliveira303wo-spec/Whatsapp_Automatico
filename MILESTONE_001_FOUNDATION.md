# MILESTONE 001 – Fundação

## 🎯 Objetivo
Estabelecer a base técnica do projeto, configurando a estrutura monorepo, o ambiente de desenvolvimento, o dashboard inicial, a API de health‑check, a orquestração Docker e as ferramentas de qualidade (ESLint, Prettier, Husky, Jest). Tudo deve estar pronto para que as próximas funcionalidades sejam desenvolvidas de forma segura e consistente.

## 📋 Escopo
- Criação da estrutura de workspaces (`apps/*`, `packages/*`, `services`, `infrastructure`).
- Dashboard (Next.js) com **Sidebar**, **Header** e área principal vazia.
- API (Express) com endpoint `/health`.
- Configuração Docker (PostgreSQL, API, Dashboard) e `docker‑compose.yml`.
- Arquivos de configuração de lint, format, husky e git.
- Documentação inicial (README, ROADMAP, CHANGELOG, TASKS, DECISIONS, etc.).
- Scripts de build, teste e CI.

## 📂 Arquivos que serão criados
- `package.json` (raiz) – workspaces e scripts.
- `tsconfig.base.json`.
- `.eslintrc.js` / `eslint.config.js`.
- `.prettierrc`.
- `.husky/pre-commit`.
- `.gitignore`.
- `docker-compose.yml`.
- `.env.example`.
- `apps/dashboard/package.json`, `tsconfig.json`, `pages/_app.tsx`, `pages/index.tsx`, `components/Sidebar.tsx`, `components/Header.tsx`, `styles/globals.css`, `tailwind.config.js`, `postcss.config.js`.
- `apps/api/package.json`, `tsconfig.json`, `src/index.ts`, `Dockerfile`.
- `CHANGELOG.md`, `ROADMAP.md`, `TASKS.md`, `DECISIONS.md` (entradas de fundação).
- `jest.config.js` e teste de health.

## 🏗️ Arquitetura
- **Monorepo** com workspaces para separar frontend (`apps/dashboard`), backend (`apps/api`) e bibliotecas compartilhadas.
- **Clean Architecture** nas camadas: Presentation → Application → Domain → Infrastructure (para o futuro).  
- **Docker**: três serviços (PostgreSQL, API, Dashboard) com health‑checks; volumes para persistência.
- **Qualidade**: ESLint (flat config), Prettier, Husky (pre‑commit), Jest + Supertest.

## ✅ Critérios de aceite
- `npm install` executa sem erros.
- `npm run lint` finaliza sem erros.
- `npm run build` compila todas as workspaces.
- `npm test` roda o teste de `/health` com sucesso.
- `docker compose up` inicia os containers, todos saudáveis.
- API responde `200` em `/health`.
- Dashboard abre em `http://localhost:3000` mostrando a barra lateral, header e área vazia.
- Nenhum erro aparece no console ao iniciar.

## 🧪 Testes obrigatórios
- **Unitário**: teste em Jest que verifica a resposta da rota `/health` usando Supertest.
- **Integração**: (opcional) teste que sobe o container da API e faz a chamada HTTP.

## 📝 Documentação a atualizar
- `README.md` – instruções de instalação (npm, Docker, como acessar dashboard e API).
- `ROADMAP.md` – marcar o milestone 001 como concluído.
- `CHANGELOG.md` – entrada “0.1.0 – Fundamento do projeto”.
- `TASKS.md` – marcar todas as tarefas da fundação como concluídas.
- `DECISIONS.md` – registrar decisões de monorepo, escolha de Next.js, Express, ESLint flat‑config e Docker.

## 🔄 Plano de rollback
1. **Parar containers**: `docker compose down`.
2. **Reverter commit** que adicionou a estrutura (git checkout <hash‑anterior>). 
3. **Excluir arquivos gerados** (`apps/`, `docker‑compose.yml`, `package.json` etc.) caso o commit não seja mantido.
4. **Restaurar** `package.json` raiz e `tsconfig.base.json` à versão anterior.
5. **Re‑executar** `npm install` e garantir que o repositório volte ao estado pré‑fundação.

---
*Este documento será a referência de entrega da Milestone 001.*