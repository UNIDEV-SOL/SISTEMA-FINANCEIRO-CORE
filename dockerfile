FROM node:22-bullseye AS builder
WORKDIR /usr/src/app

RUN yarn config set registry https://registry.npmmirror.com --global && \
    yarn config set network-timeout 600000 --global

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build yarn prisma generate && yarn build

FROM node:22-bullseye-slim
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package.json yarn.lock prisma.config.ts ./
RUN yarn install --frozen-lockfile --production=false && yarn cache clean
COPY prisma ./prisma
# Manual de utilizador e FAQ (semeados pelo seed)
COPY content ./content
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/src/generated ./dist/generated

USER node
EXPOSE 4000

# Aplica as migrações pendentes antes de arrancar
CMD ["sh", "-c", "yarn prisma migrate deploy && node dist/server.js"]
