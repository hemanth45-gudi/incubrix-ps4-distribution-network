FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY frontend/package.json ./frontend/

RUN npm install --workspace=@incubrix/frontend

COPY frontend ./frontend

WORKDIR /app/frontend
RUN npm run build

FROM nginx:alpine AS runner

COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
