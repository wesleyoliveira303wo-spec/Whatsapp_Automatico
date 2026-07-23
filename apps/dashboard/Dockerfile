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
# nesta imagem — por isso copiamos os dois manifestos, não só o do dashboard.
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/dashboard/package.json ./apps/dashboard/package.json
RUN npm ci

# Copia o código-fonte do dashboard e builda o Next.js
COPY apps/dashboard ./apps/dashboard
RUN npm run build -w apps/dashboard

# ---------- Production Stage ----------
FROM node:20-alpine AS runner
WORKDIR /app/apps/dashboard
ENV NODE_ENV=production

# Copiamos apenas o node_modules da raiz: com hoisting padrão do npm
# workspaces, as dependências ficam ali, não em apps/dashboard/node_modules
# (que normalmente nem existe, e faria o COPY falhar se referenciado).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/dashboard/.next ./.next
COPY --from=builder /app/apps/dashboard/public ./public
COPY --from=builder /app/apps/dashboard/next.config.js ./
COPY --from=builder /app/apps/dashboard/package.json ./

EXPOSE 3000
CMD ["npm", "run", "start"]
