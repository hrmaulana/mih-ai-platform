FROM oven/bun:1
WORKDIR /app
COPY package.json ./
RUN bun install
COPY . .
EXPOSE 3101
CMD ["bun", "run", "src/index.ts"]