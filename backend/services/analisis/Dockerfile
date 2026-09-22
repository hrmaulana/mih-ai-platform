FROM oven/bun:1
WORKDIR /app
COPY node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src/ ./src/
EXPOSE 3102
CMD ["bun", "run", "src/index.ts"]