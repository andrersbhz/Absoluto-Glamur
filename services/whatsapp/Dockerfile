FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev=false --no-audit --no-fund
COPY src ./src
RUN mkdir -p /app/.wa-auth
EXPOSE 8787
CMD ["npm", "start"]
