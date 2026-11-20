FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY backend/package.json ./backend/
COPY connectors/package.json ./connectors/

RUN npm install --workspace=@incubrix/backend

COPY backend ./backend
COPY connectors ./connectors

WORKDIR /app/backend
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY backend/package.json ./backend/
COPY connectors/package.json ./connectors/

RUN npm install --workspace=@incubrix/backend --omit=dev

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/node_modules/.prisma ./backend/node_modules/.prisma

WORKDIR /app/backend

EXPOSE 3001
CMD ["node", "dist/index.js"]
