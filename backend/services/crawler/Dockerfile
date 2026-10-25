FROM oven/bun:1

# Konteks build = root repo (lihat backend/Dockerfile). Service crawler memakai
# inti bersama `shared/highlight-core.ts`.
WORKDIR /app/backend/services/crawler
COPY backend/services/crawler/package.json backend/services/crawler/bun.lock ./
RUN bun install
COPY shared/ /app/shared/
COPY backend/services/crawler/ /app/backend/services/crawler/
EXPOSE 3101
CMD ["bun", "run", "src/index.ts"]
