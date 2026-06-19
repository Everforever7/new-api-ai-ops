FROM oven/bun:1.3.13-alpine

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY web ./web
RUN bun run build

ENV NODE_ENV=production
EXPOSE 8787
CMD ["bun", "run", "start"]
