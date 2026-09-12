FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/.wa-auth
EXPOSE 8787
CMD ["npm", "start"]
