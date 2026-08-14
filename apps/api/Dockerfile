# ---------- Build Stage ----------
# Contexto de build = raiz do monorepo (definido no docker-compose.yml),
# necessário porque este workspace depende de package-lock.json e
# tsconfig.base.json que vivem na raiz (npm workspaces).
FROM node:20-alpine AS builder
WORKDIR /app

# O Prisma depende do OpenSSL para os binários nativos (query engine e schema
# engine). A imagem node:20-alpine não traz o pacote `openssl`, e sem ele o
# Prisma falha ao DETECTAR a versão do libssl: ele assume "openssl-1.1.x",
# baixa o engine errado e quebra em runtime com
# "Could not parse schema engine response". Instalar o pacote faz a detecção
# funcionar e o engine correto (musl + OpenSSL 3.x) ser usado.
RUN apk add --no-cache openssl

# Copia apenas os manifestos primeiro (cache de layers do Docker).
# IMPORTANTE: com npm workspaces, o package-lock.json da raiz conhece TODOS
# os workspaces (api + dashboard). "npm ci" exige que os package.json de
# todos eles estejam presentes, mesmo que só o código de um seja usado
# nesta imagem — por isso copiamos os dois manifestos, não só o da api.
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/dashboard/package.json ./apps/dashboard/package.json
RUN npm ci

# Prisma Client PRECISA ser gerado antes do `tsc`: o build da API importa
# tipos de `@prisma/client` que só existem depois do generate. O schema mora
# na RAIZ do monorepo (prisma/schema.prisma), não em apps/api — por isso a
# cópia é da raiz do contexto de build.
COPY prisma ./prisma
RUN npx prisma generate

# Copia o código-fonte da API e compila TypeScript -> JavaScript
COPY apps/api ./apps/api
RUN npm run build -w apps/api

# ---------- Production Stage ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Mesmo motivo do estágio de build: os engines do Prisma são carregados em
# tempo de EXECUÇÃO (pelo `api`/`worker` e pelo `prisma migrate deploy`),
# então o OpenSSL precisa existir também na imagem final.
RUN apk add --no-cache openssl

# Copiamos apenas o node_modules da raiz: com hoisting padrão do npm
# workspaces, as dependências ficam ali, não em apps/api/node_modules
# (que normalmente nem existe, e faria o COPY falhar se referenciado).
# O node_modules copiado do builder JÁ CONTÉM o Prisma Client gerado
# (node_modules/.prisma/client) — por isso o generate acontece só no builder.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# O schema/migrations também vão para a imagem final: é o que permite rodar
# `docker compose run --rm api npx prisma migrate deploy` em produção, sem
# precisar de checkout do código na VPS nem de uma imagem separada só para
# migrar. `migrate deploy` (não `migrate dev`) é o comando correto para
# produção: aplica migrations já versionadas e nunca gera/reescreve nenhuma.
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
