# ---------- Build Stage ----------
# Contexto de build = raiz do monorepo (definido no docker-compose.yml),
# necessário porque este workspace depende de package-lock.json e
# tsconfig.base.json que vivem na raiz (npm workspaces).
FROM node:20-alpine AS builder
WORKDIR /app

# Copia apenas os manifestos primeiro (cache de layers do Docker).
# IMPORTANTE: com npm workspaces, o package-lock.json da raiz conhece TODOS
# os workspaces (api + dashboard). "npm ci" exige que os package.json de
# todos eles estejam presentes, mesmo que só o código de um seja usado
# nesta imagem — por isso copiamos os dois manifestos, não só o da api.
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/dashboard/package.json ./apps/dashboard/package.json
RUN npm ci

# Copia o código-fonte da API e compila TypeScript -> JavaScript
COPY apps/api ./apps/api
RUN npm run build -w apps/api

# ---------- Production Stage ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copiamos apenas o node_modules da raiz: com hoisting padrão do npm
# workspaces, as dependências ficam ali, não em apps/api/node_modules
# (que normalmente nem existe, e faria o COPY falhar se referenciado).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]

# Nota: a etapa "npx prisma generate" foi removida propositalmente aqui.
# Ela será reintroduzida no Bloco 1 (Milestone 1), quando prisma/schema.prisma
# for criado. Executá-la agora falharia por falta de schema.
